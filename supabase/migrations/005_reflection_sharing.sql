-- Coach-visible wrestler and parent check-ins, with explicit sharing.
-- Parents can review every reflection. Wrestlers see reflections addressed to
-- them. Assigned coaches see only entries shared with coaches.

alter table public.reflections
  add column if not exists author_role text check (author_role in ('parent', 'wrestler')),
  add column if not exists share_with_coach boolean not null default false;

drop policy if exists reflections_read_by_audience on public.reflections;
create policy reflections_read_by_audience on public.reflections for select to authenticated
  using (public.is_parent_for(wrestler_id)
    or (public.is_wrestler_for(wrestler_id) and audience = 'wrestler')
    or (public.is_coach_for(wrestler_id) and (audience = 'coach' or share_with_coach)));

drop policy if exists reflections_insert_family on public.reflections;
create policy reflections_insert_family on public.reflections for insert to authenticated
  with check (created_by = (select auth.uid()) and (
    (public.is_parent_for(wrestler_id) and author_role = 'parent')
    or (public.is_wrestler_for(wrestler_id) and author_role = 'wrestler' and audience = 'wrestler')
  ));

drop policy if exists reflections_update_family on public.reflections;
create policy reflections_update_family on public.reflections for update to authenticated
  using (public.is_parent_for(wrestler_id) or (public.is_wrestler_for(wrestler_id) and created_by = (select auth.uid())))
  with check (created_by = (select auth.uid()) and (
    (public.is_parent_for(wrestler_id) and author_role = 'parent')
    or (public.is_wrestler_for(wrestler_id) and author_role = 'wrestler' and audience = 'wrestler')
  ));

comment on column public.reflections.author_role is 'Whether the check-in was written from the parent or wrestler perspective.';
comment on column public.reflections.share_with_coach is 'Explicit opt-in for sharing this family reflection with assigned coaches.';

