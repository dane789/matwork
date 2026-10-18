-- Email-free Athlete sign-in support.
-- The browser never reads the login credential table. Only the service role
-- used by the athlete-access Edge Function can look up codes or rate limits.

create table public.athlete_login_credentials (
  wrestler_id uuid primary key references public.wrestlers(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  code_hash text not null unique,
  auth_email text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.athlete_login_credentials enable row level security;
revoke all on public.athlete_login_credentials from public, anon, authenticated;
grant all on public.athlete_login_credentials to service_role;

create table public.athlete_login_attempts (
  code_hash text primary key,
  failed_attempts smallint not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.athlete_login_attempts enable row level security;
revoke all on public.athlete_login_attempts from public, anon, authenticated;
grant all on public.athlete_login_attempts to service_role;

create function public.athlete_login_throttle(p_code_hash text, p_succeeded boolean default null)
returns table(is_locked boolean, locked_until timestamptz)
language plpgsql security definer set search_path = '' as $$
declare attempt_row public.athlete_login_attempts%rowtype;
begin
  if p_code_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid login'; end if;
  if p_succeeded is true then
    delete from public.athlete_login_attempts where code_hash = p_code_hash;
    return query select false, null::timestamptz;
    return;
  end if;
  if p_succeeded is null then
    select * into attempt_row from public.athlete_login_attempts where code_hash = p_code_hash;
    return query select coalesce(attempt_row.locked_until > now(), false), attempt_row.locked_until;
    return;
  end if;
  insert into public.athlete_login_attempts as attempts(code_hash, failed_attempts, locked_until, updated_at)
  values (p_code_hash, 1, null, now())
  on conflict (code_hash) do update
    set failed_attempts = case when attempts.locked_until is not null and attempts.locked_until <= now() then 1 else attempts.failed_attempts + 1 end,
        locked_until = case
          when attempts.locked_until is not null and attempts.locked_until > now() then attempts.locked_until
          when (case when attempts.locked_until is not null and attempts.locked_until <= now() then 1 else attempts.failed_attempts + 1 end) >= 5 then now() + interval '15 minutes'
          else null
        end,
        updated_at = now()
  returning * into attempt_row;
  return query select coalesce(attempt_row.locked_until > now(), false), attempt_row.locked_until;
end;
$$;
revoke all on function public.athlete_login_throttle(text, boolean) from public, anon, authenticated;
grant execute on function public.athlete_login_throttle(text, boolean) to service_role;

comment on table public.athlete_login_credentials is 'Private service-role-only mapping from a hashed Athlete code to a Supabase Auth user.';
comment on table public.athlete_login_attempts is 'Service-role-only per-code failure tracking for email-free Athlete sign-in.';

