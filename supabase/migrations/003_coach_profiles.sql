-- Account-linked coach display names for attribution on lessons and assignments.
-- A coach's email and auth identity are never exposed to other workspace members.

create table public.coach_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  updated_at timestamptz not null default now()
);

alter table public.coach_profiles enable row level security;
grant select, insert, update on public.coach_profiles to authenticated;
revoke delete on public.coach_profiles from public, anon, authenticated;

create function public.can_view_coach_profile(target_coach uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select target_coach = (select auth.uid()) or exists (
    select 1 from public.coach_assignments c
    where c.coach_user_id = target_coach
      and public.can_view_wrestler(c.wrestler_id)
  );
$$;

revoke all on function public.can_view_coach_profile(uuid) from public, anon;
grant execute on function public.can_view_coach_profile(uuid) to authenticated;

create policy coach_profiles_read_related on public.coach_profiles for select to authenticated
  using (public.can_view_coach_profile(user_id));

create policy coach_profiles_insert_self on public.coach_profiles for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.coach_assignments c
    where c.coach_user_id = (select auth.uid()) and c.revoked_at is null
  ));

create policy coach_profiles_update_self on public.coach_profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

