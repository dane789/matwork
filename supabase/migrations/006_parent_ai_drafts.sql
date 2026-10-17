-- Permit a parent to format their own lesson observations with AI.
-- Access to a specific athlete is checked separately by the Edge Function.
-- The existing per-coach allowance now acts as a per-account allowance for
-- either a parent or coach, while the global monthly cap remains unchanged.
create or replace function public.reserve_coach_ai_draft()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  month_start timestamptz := date_trunc('month', now());
  global_limit integer;
  user_limit integer;
  global_used integer;
  user_used integer;
  reservation_id uuid;
begin
  if current_user_id is null then raise exception 'Sign-in required'; end if;

  if not exists (
    select 1 from public.family_memberships
    where user_id = current_user_id and role = 'parent'
  ) and not exists (
    select 1 from public.coach_assignments
    where coach_user_id = current_user_id and revoked_at is null
  ) then
    raise exception 'Active parent or coach workspace required';
  end if;

  select global_monthly_limit, per_coach_monthly_limit
    into global_limit, user_limit
    from public.ai_usage_settings where singleton = true;
  if global_limit is null or user_limit is null then
    raise exception 'AI usage limits are not configured';
  end if;

  perform pg_advisory_xact_lock(736281, extract(year from now())::integer * 100 + extract(month from now())::integer);
  delete from public.ai_draft_usage where created_at < month_start - interval '1 month';

  select count(*)::integer into global_used
  from public.ai_draft_usage
  where created_at >= month_start and status in ('reserved', 'completed');

  select count(*)::integer into user_used
  from public.ai_draft_usage
  where coach_user_id = current_user_id and created_at >= month_start
    and status in ('reserved', 'completed');

  if global_used >= global_limit or user_used >= user_limit then
    return jsonb_build_object('allowed', false, 'remaining', greatest(0, least(global_limit - global_used, user_limit - user_used)));
  end if;

  insert into public.ai_draft_usage (coach_user_id) values (current_user_id) returning id into reservation_id;
  return jsonb_build_object('allowed', true, 'reservation_id', reservation_id,
    'remaining', greatest(0, least(global_limit - global_used - 1, user_limit - user_used - 1)));
end;
$$;

comment on column public.ai_draft_usage.coach_user_id is 'Authenticated requesting account (parent or coach); name retained for schema compatibility.';
comment on column public.ai_usage_settings.per_coach_monthly_limit is 'Monthly AI request limit per authenticated requesting account (parent or coach).';

alter table public.practice_assignments
  add column if not exists share_with_coach boolean not null default false;
alter table public.practice_assignments
  drop constraint if exists practice_assignments_coach_origin_check;
alter table public.practice_assignments
  add constraint practice_assignments_coach_origin_check
  check (coach_origin in ('coach_stated', 'ai_suggestion_approved', 'parent_suggestion'));

drop policy if exists practice_read_by_role on public.practice_assignments;
create policy practice_read_by_role on public.practice_assignments for select to authenticated
  using (public.is_parent_for(wrestler_id)
    or (public.is_wrestler_for(wrestler_id) and audience = 'wrestler')
    or (public.is_coach_for(wrestler_id) and (source = 'coach' or (source = 'parent' and share_with_coach))));

drop policy if exists checklist_read_by_role on public.checklist_events;
create policy checklist_read_by_role on public.checklist_events for select to authenticated
  using (public.is_parent_for(wrestler_id)
    or (public.is_wrestler_for(wrestler_id) and exists (
      select 1 from public.practice_assignments a
      where a.id = checklist_events.assignment_id and a.audience = 'wrestler'
    ))
    or (public.is_coach_for(wrestler_id) and exists (
      select 1 from public.practice_assignments a
      where a.id = checklist_events.assignment_id
        and (a.source = 'coach' or (a.source = 'parent' and a.share_with_coach))
    )));

create or replace function public.save_parent_lesson_plan(
  p_wrestler_id uuid,
  p_lesson_date date,
  p_lesson_number integer,
  p_focus text,
  p_recap text,
  p_reported_cues text,
  p_parent_observations text,
  p_share_with_coach boolean,
  p_tasks jsonb,
  p_ai_model text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := (select auth.uid());
  new_lesson_id uuid;
  task jsonb;
begin
  if current_user_id is null or not public.is_parent_for(p_wrestler_id) then
    raise exception 'Parent access to this athlete is required';
  end if;
  if p_lesson_date is null or nullif(trim(coalesce(p_focus, '')), '') is null then
    raise exception 'Lesson date and focus are required';
  end if;
  if length(coalesce(p_recap, '')) > 12000 or length(coalesce(p_parent_observations, '')) > 5000
    or length(coalesce(p_reported_cues, '')) > 5000 then
    raise exception 'The reviewed plan is too long';
  end if;
  if jsonb_typeof(coalesce(p_tasks, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_tasks, '[]'::jsonb)) > 20 then
    raise exception 'Practice checklist is invalid';
  end if;

  insert into public.lessons (wrestler_id, lesson_number, lesson_date, focus, created_by, ai_assisted, ai_model)
  values (p_wrestler_id, p_lesson_number, p_lesson_date, trim(p_focus), current_user_id, true, left(coalesce(p_ai_model, ''), 80))
  returning id into new_lesson_id;

  if nullif(trim(coalesce(p_recap, '')), '') is not null or nullif(trim(coalesce(p_reported_cues, '')), '') is not null then
    insert into public.lesson_items (lesson_id, wrestler_id, kind, content, audience, authored_by, ai_assisted)
    values (
      new_lesson_id, p_wrestler_id, 'parent_interpretation',
      concat_ws(E'\n\n', nullif(trim(p_recap), ''), case when nullif(trim(p_reported_cues), '') is null then null else 'Coach cue wording:' || E'\n' || trim(p_reported_cues) end),
      case when coalesce(p_share_with_coach, false) then array['parent','coach']::public.reflection_audience[] else array['parent']::public.reflection_audience[] end,
      current_user_id, true
    );
  end if;
  if nullif(trim(coalesce(p_parent_observations, '')), '') is not null then
    insert into public.lesson_items (lesson_id, wrestler_id, kind, content, audience, authored_by, ai_assisted)
    values (
      new_lesson_id, p_wrestler_id, 'parent_interpretation', 'Parent observations:' || E'\n' || trim(p_parent_observations),
      case when coalesce(p_share_with_coach, false) then array['parent','coach']::public.reflection_audience[] else array['parent']::public.reflection_audience[] end,
      current_user_id, true
    );
  end if;

  for task in select value from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb)) loop
    if nullif(trim(coalesce(task->>'title', '')), '') is null then
      raise exception 'Each parent action step needs a title';
    end if;
    insert into public.practice_assignments (wrestler_id, lesson_id, title, instructions, source, audience, created_by, coach_origin, share_with_coach)
    values (p_wrestler_id, new_lesson_id, left(trim(task->>'title'), 140), left(coalesce(task->>'instructions', ''), 3000), 'parent', 'wrestler', current_user_id, 'parent_suggestion', coalesce(p_share_with_coach, false));
  end loop;
  return new_lesson_id;
end;
$$;

revoke all on function public.save_parent_lesson_plan(uuid,date,integer,text,text,text,text,boolean,jsonb,text) from public, anon;
grant execute on function public.save_parent_lesson_plan(uuid,date,integer,text,text,text,text,boolean,jsonb,text) to authenticated;

