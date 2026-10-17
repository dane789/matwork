-- Coach-reviewed lesson capture. Keep raw coach notes in a separate table so
-- wrestler accounts cannot select them through the shared lesson table.
alter table public.lessons
  add column ai_assisted boolean not null default false,
  add column ai_model text,
  add column coach_approved_at timestamptz,
  add column coach_approved_by uuid references auth.users(id) on delete set null;

create table public.coach_source_notes (
  lesson_id uuid primary key,
  wrestler_id uuid not null references public.wrestlers(id) on delete cascade,
  source_note text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (lesson_id, wrestler_id) references public.lessons(id, wrestler_id) on delete cascade
);
alter table public.coach_source_notes enable row level security;
grant select on public.coach_source_notes to authenticated;
revoke insert, update, delete on public.coach_source_notes from public, anon, authenticated;
create policy coach_source_notes_read_parent_or_coach on public.coach_source_notes for select to authenticated
  using (public.is_parent_for(wrestler_id) or public.is_coach_for(wrestler_id));

create function public.save_coach_lesson_bundle(
  p_wrestler_id uuid,
  p_lesson_date date,
  p_lesson_number integer,
  p_focus text,
  p_source_note text,
  p_coach_cues text,
  p_observations text,
  p_wrestler_focus text,
  p_parent_support text,
  p_follow_up_topics text,
  p_tasks jsonb,
  p_ai_model text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := (select auth.uid());
  new_lesson_id uuid;
  task jsonb;
  task_count integer := 0;
begin
  if current_user_id is null or not public.is_coach_for(p_wrestler_id) then
    raise exception 'Active coach access required';
  end if;
  if p_lesson_date is null or nullif(trim(p_focus), '') is null then
    raise exception 'Lesson date and focus are required';
  end if;
  if length(coalesce(p_source_note, '')) not between 12 and 12000 then
    raise exception 'Source note must be between 12 and 12000 characters';
  end if;
  if jsonb_typeof(coalesce(p_tasks, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_tasks, '[]'::jsonb)) > 30 then
    raise exception 'Practice checklist is invalid';
  end if;

  insert into public.lessons (wrestler_id, lesson_number, lesson_date, focus, instructor_label, created_by, ai_assisted, ai_model, coach_approved_at, coach_approved_by)
  values (p_wrestler_id, p_lesson_number, p_lesson_date, trim(p_focus), 'Coach', current_user_id, true, left(coalesce(p_ai_model, ''), 80), now(), current_user_id)
  returning id into new_lesson_id;

  insert into public.coach_source_notes (lesson_id, wrestler_id, source_note, created_by)
  values (new_lesson_id, p_wrestler_id, p_source_note, current_user_id);

  if nullif(trim(coalesce(p_coach_cues, '')), '') is not null then
    insert into public.lesson_items (lesson_id, wrestler_id, kind, content, audience, authored_by)
    values (new_lesson_id, p_wrestler_id, 'coach_cue', trim(p_coach_cues), array['parent','wrestler','coach']::public.reflection_audience[], current_user_id);
  end if;
  if nullif(trim(coalesce(p_observations, '')), '') is not null then
    insert into public.lesson_items (lesson_id, wrestler_id, kind, content, audience, authored_by)
    values (new_lesson_id, p_wrestler_id, 'coach_observation', trim(p_observations), array['parent','wrestler','coach']::public.reflection_audience[], current_user_id);
  end if;
  if nullif(trim(coalesce(p_wrestler_focus, '')), '') is not null then
    insert into public.lesson_items (lesson_id, wrestler_id, kind, content, audience, authored_by)
    values (new_lesson_id, p_wrestler_id, 'development_priority', trim(p_wrestler_focus), array['parent','wrestler','coach']::public.reflection_audience[], current_user_id);
  end if;
  if nullif(trim(coalesce(p_parent_support, '')), '') is not null then
    insert into public.lesson_items (lesson_id, wrestler_id, kind, content, audience, authored_by)
    values (new_lesson_id, p_wrestler_id, 'parent_interpretation', trim(p_parent_support), array['parent','coach']::public.reflection_audience[], current_user_id);
  end if;
  if nullif(trim(coalesce(p_follow_up_topics, '')), '') is not null then
    insert into public.lesson_items (lesson_id, wrestler_id, kind, content, audience, authored_by)
    values (new_lesson_id, p_wrestler_id, 'lesson_follow_up', trim(p_follow_up_topics), array['parent','coach']::public.reflection_audience[], current_user_id);
  end if;

  for task in select value from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb)) loop
    task_count := task_count + 1;
    if nullif(trim(coalesce(task->>'title', '')), '') is null or coalesce(task->>'audience', '') not in ('wrestler', 'parent') then
      raise exception 'Each checklist item needs a title and a valid audience';
    end if;
    insert into public.practice_assignments (wrestler_id, lesson_id, title, instructions, source, audience, created_by)
    values (p_wrestler_id, new_lesson_id, left(trim(task->>'title'), 140), left(coalesce(task->>'instructions', ''), 3000), 'coach', (task->>'audience')::public.assignment_audience, current_user_id);
  end loop;

  return new_lesson_id;
end;
$$;

revoke all on function public.save_coach_lesson_bundle(uuid,date,integer,text,text,text,text,text,text,text,jsonb,text) from public, anon;
grant execute on function public.save_coach_lesson_bundle(uuid,date,integer,text,text,text,text,text,text,text,jsonb,text) to authenticated;

