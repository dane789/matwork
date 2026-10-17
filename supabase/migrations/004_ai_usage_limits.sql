-- Server-side AI draft quotas. Counts requests only; never stores lesson text.
-- Defaults are conservative pilot values and can be adjusted by the project owner.

create table public.ai_usage_settings (
  singleton boolean primary key default true check (singleton),
  global_monthly_limit integer not null default 100 check (global_monthly_limit between 0 and 100000),
  per_coach_monthly_limit integer not null default 20 check (per_coach_monthly_limit between 0 and 10000),
  updated_at timestamptz not null default now()
);

insert into public.ai_usage_settings (singleton, global_monthly_limit, per_coach_monthly_limit)
values (true, 100, 20)
on conflict (singleton) do nothing;

create table public.ai_draft_usage (
  id uuid primary key default gen_random_uuid(),
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'reserved' check (status in ('reserved', 'completed', 'released')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index ai_draft_usage_month_coach_idx on public.ai_draft_usage (created_at, coach_user_id, status);

alter table public.ai_usage_settings enable row level security;
alter table public.ai_draft_usage enable row level security;
revoke all on public.ai_usage_settings, public.ai_draft_usage from anon, authenticated;

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
  coach_limit integer;
  global_used integer;
  coach_used integer;
  reservation_id uuid;
begin
  if current_user_id is null then raise exception 'Sign-in required'; end if;

  if not exists (
    select 1 from public.coach_assignments
    where coach_user_id = current_user_id and revoked_at is null
  ) then
    raise exception 'Active coach access required';
  end if;

  select global_monthly_limit, per_coach_monthly_limit
    into global_limit, coach_limit
    from public.ai_usage_settings where singleton = true;
  if global_limit is null or coach_limit is null then
    raise exception 'AI usage limits are not configured';
  end if;

  -- Serialize the small monthly reservation operation so concurrent clicks
  -- cannot exceed either allowance.
  perform pg_advisory_xact_lock(736281, extract(year from now())::integer * 100 + extract(month from now())::integer);

  -- Old reservation rows are no longer needed for monthly totals.
  delete from public.ai_draft_usage where created_at < month_start - interval '1 month';

  select count(*)::integer into global_used
  from public.ai_draft_usage
  where created_at >= month_start
    and status in ('reserved', 'completed');

  select count(*)::integer into coach_used
  from public.ai_draft_usage
  where coach_user_id = current_user_id and created_at >= month_start
    and status in ('reserved', 'completed');

  if global_used >= global_limit or coach_used >= coach_limit then
    return jsonb_build_object('allowed', false, 'remaining', greatest(0, least(global_limit - global_used, coach_limit - coach_used)));
  end if;

  insert into public.ai_draft_usage (coach_user_id) values (current_user_id) returning id into reservation_id;
  return jsonb_build_object('allowed', true, 'reservation_id', reservation_id,
    'remaining', greatest(0, least(global_limit - global_used - 1, coach_limit - coach_used - 1)));
end;
$$;

create or replace function public.complete_coach_ai_draft(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Sign-in required'; end if;
  update public.ai_draft_usage
  set status = 'completed', completed_at = now()
  where id = p_reservation_id and coach_user_id = auth.uid() and status = 'reserved';
  if not found then raise exception 'AI draft reservation not found'; end if;
end;
$$;

create or replace function public.release_coach_ai_draft(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Sign-in required'; end if;
  update public.ai_draft_usage
  set status = 'released'
  where id = p_reservation_id and coach_user_id = auth.uid() and status = 'reserved';
end;
$$;

revoke all on function public.reserve_coach_ai_draft() from public, anon;
revoke all on function public.complete_coach_ai_draft(uuid) from public, anon;
revoke all on function public.release_coach_ai_draft(uuid) from public, anon;
grant execute on function public.reserve_coach_ai_draft() to authenticated;
grant execute on function public.complete_coach_ai_draft(uuid) to authenticated;
grant execute on function public.release_coach_ai_draft(uuid) to authenticated;

comment on table public.ai_usage_settings is 'Owner-managed monthly caps for optional AI lesson drafts.';
comment on table public.ai_draft_usage is 'Private AI draft request counts only; stores no lesson text or prompt content.';

