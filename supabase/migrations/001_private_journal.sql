-- Matwork private shared workspace, initial schema draft.
-- Apply only to a new Supabase project after reviewing the role policies.
-- No wrestler or lesson data is seeded here.

create type public.family_role as enum ('parent', 'wrestler');
create type public.lesson_item_kind as enum (
  'coach_cue', 'coach_observation', 'parent_interpretation',
  'development_priority', 'practice_recommendation', 'lesson_follow_up'
);
create type public.assignment_source as enum ('coach', 'parent');
create type public.assignment_audience as enum ('wrestler', 'parent');
create type public.reflection_audience as enum ('parent', 'wrestler', 'coach');

create table public.families (
  id uuid primary key default gen_random_uuid(),
  display_name text not null default 'My family',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.wrestlers (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  first_name text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint wrestlers_id_family_unique unique (id, family_id)
);

create table public.family_memberships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.family_role not null,
  wrestler_id uuid references public.wrestlers(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint family_role_subject check (
    (role = 'parent' and wrestler_id is null) or
    (role = 'wrestler' and wrestler_id is not null)
  ),
  constraint membership_wrestler_family_fk unique (family_id, user_id, wrestler_id),
  constraint membership_wrestler_same_family_fk
    foreign key (wrestler_id, family_id) references public.wrestlers(id, family_id) on delete cascade
);
create unique index one_parent_membership_per_user
  on public.family_memberships(family_id, user_id) where role = 'parent';
create unique index one_wrestler_login_per_wrestler
  on public.family_memberships(wrestler_id) where role = 'wrestler';

create table public.coach_assignments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  wrestler_id uuid not null references public.wrestlers(id) on delete cascade,
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid not null references auth.users(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint coach_assignment_family_fk unique (wrestler_id, coach_user_id, granted_at),
  constraint coach_assignment_wrestler_family_fk
    foreign key (wrestler_id, family_id) references public.wrestlers(id, family_id) on delete cascade
);
create unique index one_active_coach_assignment
  on public.coach_assignments(wrestler_id, coach_user_id) where revoked_at is null;

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  wrestler_id uuid not null references public.wrestlers(id) on delete cascade,
  lesson_number integer,
  lesson_date date not null,
  focus text not null,
  instructor_label text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lessons_id_wrestler_unique unique (id, wrestler_id)
);

create table public.lesson_items (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null,
  wrestler_id uuid not null references public.wrestlers(id) on delete cascade,
  kind public.lesson_item_kind not null,
  content text not null,
  audience public.reflection_audience[] not null default array['parent']::public.reflection_audience[],
  authored_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint lesson_item_audience_values check (cardinality(audience) > 0)
);
alter table public.lesson_items
  add constraint lesson_items_lesson_wrestler_fk
  foreign key (lesson_id, wrestler_id) references public.lessons(id, wrestler_id) on delete cascade;

create table public.practice_assignments (
  id uuid primary key default gen_random_uuid(),
  wrestler_id uuid not null references public.wrestlers(id) on delete cascade,
  lesson_id uuid,
  title text not null,
  instructions text not null default '',
  source public.assignment_source not null,
  audience public.assignment_audience not null default 'wrestler',
  created_by uuid not null references auth.users(id) on delete restrict,
  due_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint practice_assignment_id_wrestler_unique unique (id, wrestler_id)
);
alter table public.practice_assignments
  add constraint practice_assignment_lesson_wrestler_fk
  foreign key (lesson_id, wrestler_id) references public.lessons(id, wrestler_id) on delete set null (lesson_id);

create table public.checklist_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null,
  wrestler_id uuid not null references public.wrestlers(id) on delete cascade,
  completed boolean not null,
  note text not null default '',
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now()
);
alter table public.checklist_events
  add constraint checklist_assignment_wrestler_fk
  foreign key (assignment_id, wrestler_id) references public.practice_assignments(id, wrestler_id) on delete cascade;

create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  wrestler_id uuid not null references public.wrestlers(id) on delete cascade,
  session_date date not null,
  session_type text not null,
  duration_minutes integer check (duration_minutes between 0 and 600),
  focus text not null default '',
  note text not null default '',
  share_with_coach boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  wrestler_id uuid not null references public.wrestlers(id) on delete cascade,
  milestone_date date not null,
  title text not null,
  category text not null,
  note text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.reflections (
  id uuid primary key default gen_random_uuid(),
  wrestler_id uuid not null references public.wrestlers(id) on delete cascade,
  reflection_date date not null,
  content text not null,
  mood text not null default '',
  audience public.reflection_audience not null default 'wrestler',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index wrestlers_family_id_idx on public.wrestlers(family_id);
create index family_memberships_user_id_idx on public.family_memberships(user_id);
create index coach_assignments_user_active_idx on public.coach_assignments(coach_user_id, revoked_at);
create index lessons_wrestler_date_idx on public.lessons(wrestler_id, lesson_date desc);
create index lesson_items_wrestler_idx on public.lesson_items(wrestler_id, created_at desc);
create index practice_assignments_wrestler_idx on public.practice_assignments(wrestler_id, active, created_at desc);
create index checklist_events_assignment_idx on public.checklist_events(assignment_id, recorded_at desc);

-- Authorization helpers run as the migration owner so policy checks do not
-- recurse through the row-level policies on membership and assignment tables.
create function public.is_parent_for(target_wrestler uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.wrestlers w
    join public.family_memberships m on m.family_id = w.family_id
    where w.id = target_wrestler
      and m.user_id = (select auth.uid())
      and m.role = 'parent'
  );
$$;

create function public.is_wrestler_for(target_wrestler uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.family_memberships m
    where m.wrestler_id = target_wrestler
      and m.user_id = (select auth.uid())
      and m.role = 'wrestler'
  );
$$;

create function public.is_coach_for(target_wrestler uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.coach_assignments c
    where c.wrestler_id = target_wrestler
      and c.coach_user_id = (select auth.uid())
      and c.revoked_at is null
  );
$$;

create function public.can_view_wrestler(target_wrestler uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_parent_for(target_wrestler)
      or public.is_wrestler_for(target_wrestler)
      or public.is_coach_for(target_wrestler);
$$;

revoke all on function public.is_parent_for(uuid) from public, anon;
revoke all on function public.is_wrestler_for(uuid) from public, anon;
revoke all on function public.is_coach_for(uuid) from public, anon;
revoke all on function public.can_view_wrestler(uuid) from public, anon;
grant execute on function public.is_parent_for(uuid) to authenticated;
grant execute on function public.is_wrestler_for(uuid) to authenticated;
grant execute on function public.is_coach_for(uuid) to authenticated;
grant execute on function public.can_view_wrestler(uuid) to authenticated;

-- Initial household setup. The caller becomes the parent owner.
create function public.create_family(family_label text default 'My family')
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_family uuid;
begin
  if (select auth.uid()) is null then raise exception 'Sign-in required'; end if;
  insert into public.families(display_name, created_by)
  values (left(coalesce(nullif(trim(family_label), ''), 'My family'), 80), (select auth.uid()))
  returning id into new_family;
  insert into public.family_memberships(family_id, user_id, role)
  values (new_family, (select auth.uid()), 'parent');
  return new_family;
end;
$$;

create function public.create_wrestler(target_family uuid, wrestler_first_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_wrestler uuid;
begin
  if not public.is_parent_for_family(target_family) then raise exception 'Parent access required'; end if;
  if nullif(trim(coalesce(wrestler_first_name, '')), '') is null then raise exception 'Wrestler first name is required'; end if;
  insert into public.wrestlers(family_id, first_name)
  values (target_family, left(trim(coalesce(wrestler_first_name, '')), 30))
  returning id into new_wrestler;
  return new_wrestler;
end;
$$;

-- This family-level helper is also used by the initial setup RPC.
create function public.is_parent_for_family(target_family uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.family_memberships m
    where m.family_id = target_family
      and m.user_id = (select auth.uid())
      and m.role = 'parent'
  );
$$;

revoke all on function public.create_family(text) from public, anon;
revoke all on function public.create_wrestler(uuid, text) from public, anon;
revoke all on function public.is_parent_for_family(uuid) from public, anon;
grant execute on function public.create_family(text) to authenticated;
grant execute on function public.create_wrestler(uuid, text) to authenticated;
grant execute on function public.is_parent_for_family(uuid) to authenticated;

create function public.grant_wrestler_login(target_wrestler uuid, target_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target_family uuid;
begin
  select family_id into target_family from public.wrestlers where id = target_wrestler;
  if target_family is null or not public.is_parent_for_family(target_family) then
    raise exception 'Parent access required';
  end if;
  insert into public.family_memberships(family_id, user_id, role, wrestler_id)
  values (target_family, target_user, 'wrestler', target_wrestler)
  on conflict do nothing;
end;
$$;

create function public.grant_coach_access(target_wrestler uuid, target_coach uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target_family uuid;
begin
  select family_id into target_family from public.wrestlers where id = target_wrestler;
  if target_family is null or not public.is_parent_for_family(target_family) then
    raise exception 'Parent access required';
  end if;
  insert into public.coach_assignments(family_id, wrestler_id, coach_user_id, granted_by)
  values (target_family, target_wrestler, target_coach, (select auth.uid()))
  on conflict (wrestler_id, coach_user_id) where revoked_at is null do nothing;
end;
$$;

create function public.revoke_coach_access(target_wrestler uuid, target_coach uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target_family uuid;
begin
  select family_id into target_family from public.wrestlers where id = target_wrestler;
  if target_family is null or not public.is_parent_for_family(target_family) then
    raise exception 'Parent access required';
  end if;
  update public.coach_assignments set revoked_at = now()
  where wrestler_id = target_wrestler and coach_user_id = target_coach and revoked_at is null;
end;
$$;

revoke all on function public.grant_wrestler_login(uuid, uuid) from public, anon;
revoke all on function public.grant_coach_access(uuid, uuid) from public, anon;
revoke all on function public.revoke_coach_access(uuid, uuid) from public, anon;
grant execute on function public.grant_wrestler_login(uuid, uuid) to authenticated;
grant execute on function public.grant_coach_access(uuid, uuid) to authenticated;
grant execute on function public.revoke_coach_access(uuid, uuid) to authenticated;

alter table public.families enable row level security;
alter table public.wrestlers enable row level security;
alter table public.family_memberships enable row level security;
alter table public.coach_assignments enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_items enable row level security;
alter table public.practice_assignments enable row level security;
alter table public.checklist_events enable row level security;
alter table public.training_sessions enable row level security;
alter table public.milestones enable row level security;
alter table public.reflections enable row level security;

grant select on public.families to authenticated;
grant update (display_name) on public.families to authenticated;
grant select on public.wrestlers to authenticated;
grant update (first_name, active) on public.wrestlers to authenticated;
grant select on public.family_memberships, public.coach_assignments to authenticated;
grant select, insert, update, delete on public.lessons, public.lesson_items, public.practice_assignments to authenticated;
grant select, insert on public.checklist_events to authenticated;
grant select, insert, update, delete on public.training_sessions, public.milestones, public.reflections to authenticated;

create policy families_read_member on public.families for select to authenticated
  using (public.is_parent_for_family(id) or exists (
    select 1 from public.family_memberships m
    where m.family_id = id and m.user_id = (select auth.uid())
  ));
create policy families_update_parent on public.families for update to authenticated
  using (public.is_parent_for_family(id)) with check (public.is_parent_for_family(id));

create policy wrestlers_read_assigned on public.wrestlers for select to authenticated
  using (public.can_view_wrestler(id));
create policy wrestlers_update_parent on public.wrestlers for update to authenticated
  using (public.is_parent_for(id)) with check (public.is_parent_for(id));

create policy memberships_read_self_or_parent on public.family_memberships for select to authenticated
  using (user_id = (select auth.uid()) or public.is_parent_for_family(family_id));

create policy coach_assignments_read_party on public.coach_assignments for select to authenticated
  using (public.is_parent_for(wrestler_id) or coach_user_id = (select auth.uid()));

create policy lessons_read_assigned on public.lessons for select to authenticated
  using (public.can_view_wrestler(wrestler_id));
create policy lessons_insert_parent_or_coach on public.lessons for insert to authenticated
  with check (created_by = (select auth.uid()) and (public.is_parent_for(wrestler_id) or public.is_coach_for(wrestler_id)));
create policy lessons_update_parent_or_author on public.lessons for update to authenticated
  using (public.is_parent_for(wrestler_id) or (public.is_coach_for(wrestler_id) and created_by = (select auth.uid())))
  with check (public.is_parent_for(wrestler_id) or (public.is_coach_for(wrestler_id) and created_by = (select auth.uid())));
create policy lessons_delete_parent_or_author on public.lessons for delete to authenticated
  using (public.is_parent_for(wrestler_id) or (public.is_coach_for(wrestler_id) and created_by = (select auth.uid())));

create policy lesson_items_read_by_audience on public.lesson_items for select to authenticated
  using (public.is_parent_for(wrestler_id)
    or (public.is_wrestler_for(wrestler_id) and 'wrestler' = any(audience))
    or (public.is_coach_for(wrestler_id) and 'coach' = any(audience)));
create policy lesson_items_insert_parent_or_coach on public.lesson_items for insert to authenticated
  with check (authored_by = (select auth.uid()) and (public.is_parent_for(wrestler_id) or public.is_coach_for(wrestler_id)));
create policy lesson_items_update_parent_or_author on public.lesson_items for update to authenticated
  using (public.is_parent_for(wrestler_id) or (public.is_coach_for(wrestler_id) and authored_by = (select auth.uid())))
  with check (public.is_parent_for(wrestler_id) or (public.is_coach_for(wrestler_id) and authored_by = (select auth.uid())));
create policy lesson_items_delete_parent_or_author on public.lesson_items for delete to authenticated
  using (public.is_parent_for(wrestler_id) or (public.is_coach_for(wrestler_id) and authored_by = (select auth.uid())));

create policy practice_read_by_role on public.practice_assignments for select to authenticated
  using (public.is_parent_for(wrestler_id)
    or (public.is_wrestler_for(wrestler_id) and audience = 'wrestler')
    or (public.is_coach_for(wrestler_id) and source = 'coach'));
create policy practice_insert_parent_or_coach on public.practice_assignments for insert to authenticated
  with check (created_by = (select auth.uid()) and (
    (public.is_parent_for(wrestler_id) and source = 'parent')
    or (public.is_coach_for(wrestler_id) and source = 'coach')
  ));
create policy practice_update_parent_or_author on public.practice_assignments for update to authenticated
  using (public.is_parent_for(wrestler_id) or (public.is_coach_for(wrestler_id) and source = 'coach' and created_by = (select auth.uid())))
  with check (public.is_parent_for(wrestler_id) or (public.is_coach_for(wrestler_id) and source = 'coach' and created_by = (select auth.uid())));
create policy practice_delete_parent_or_author on public.practice_assignments for delete to authenticated
  using (public.is_parent_for(wrestler_id) or (public.is_coach_for(wrestler_id) and source = 'coach' and created_by = (select auth.uid())));

create policy checklist_read_by_role on public.checklist_events for select to authenticated
  using (public.is_parent_for(wrestler_id)
    or (public.is_wrestler_for(wrestler_id) and exists (
      select 1 from public.practice_assignments a
      where a.id = checklist_events.assignment_id and a.audience = 'wrestler'
    ))
    or (public.is_coach_for(wrestler_id) and exists (
      select 1 from public.practice_assignments a
      where a.id = checklist_events.assignment_id and a.source = 'coach'
    )));
create policy checklist_insert_family on public.checklist_events for insert to authenticated
  with check (recorded_by = (select auth.uid()) and (public.is_parent_for(wrestler_id) or public.is_wrestler_for(wrestler_id))
    and exists (select 1 from public.practice_assignments a where a.id = checklist_events.assignment_id and a.wrestler_id = checklist_events.wrestler_id));

create policy sessions_read_shared on public.training_sessions for select to authenticated
  using (public.is_parent_for(wrestler_id) or public.is_wrestler_for(wrestler_id)
    or (public.is_coach_for(wrestler_id) and share_with_coach));
create policy sessions_insert_family on public.training_sessions for insert to authenticated
  with check (created_by = (select auth.uid()) and (public.is_parent_for(wrestler_id) or public.is_wrestler_for(wrestler_id)));
create policy sessions_update_family on public.training_sessions for update to authenticated
  using (public.is_parent_for(wrestler_id) or (public.is_wrestler_for(wrestler_id) and created_by = (select auth.uid())))
  with check (public.is_parent_for(wrestler_id) or (public.is_wrestler_for(wrestler_id) and created_by = (select auth.uid())));
create policy sessions_delete_family on public.training_sessions for delete to authenticated
  using (public.is_parent_for(wrestler_id) or (public.is_wrestler_for(wrestler_id) and created_by = (select auth.uid())));

create policy milestones_read_family on public.milestones for select to authenticated
  using (public.is_parent_for(wrestler_id) or public.is_wrestler_for(wrestler_id));
create policy milestones_insert_family on public.milestones for insert to authenticated
  with check (created_by = (select auth.uid()) and (public.is_parent_for(wrestler_id) or public.is_wrestler_for(wrestler_id)));
create policy milestones_update_family on public.milestones for update to authenticated
  using (public.is_parent_for(wrestler_id) or (public.is_wrestler_for(wrestler_id) and created_by = (select auth.uid())))
  with check (public.is_parent_for(wrestler_id) or (public.is_wrestler_for(wrestler_id) and created_by = (select auth.uid())));
create policy milestones_delete_family on public.milestones for delete to authenticated
  using (public.is_parent_for(wrestler_id) or (public.is_wrestler_for(wrestler_id) and created_by = (select auth.uid())));

create policy reflections_read_by_audience on public.reflections for select to authenticated
  using (public.is_parent_for(wrestler_id)
    or (public.is_wrestler_for(wrestler_id) and audience = 'wrestler')
    or (public.is_coach_for(wrestler_id) and audience = 'coach'));
create policy reflections_insert_family on public.reflections for insert to authenticated
  with check (created_by = (select auth.uid()) and (public.is_parent_for(wrestler_id) or public.is_wrestler_for(wrestler_id)));
create policy reflections_update_family on public.reflections for update to authenticated
  using (public.is_parent_for(wrestler_id) or (public.is_wrestler_for(wrestler_id) and created_by = (select auth.uid())))
  with check (public.is_parent_for(wrestler_id) or (public.is_wrestler_for(wrestler_id) and created_by = (select auth.uid())));
create policy reflections_delete_family on public.reflections for delete to authenticated
  using (public.is_parent_for(wrestler_id) or (public.is_wrestler_for(wrestler_id) and created_by = (select auth.uid())));

-- Coach and wrestler accounts are attached through authenticated invitations in
-- the next setup step; do not expose membership or coach grant writes directly.
revoke insert, update, delete on public.family_memberships, public.coach_assignments from authenticated;
revoke insert, delete on public.families from authenticated;
revoke insert, delete on public.wrestlers from authenticated;

