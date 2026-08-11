-- School -> parent announcements (spec section 6: "in-app chat/announcements
-- from school to parents").
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  title text not null,
  body text not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index announcements_school_id_created_at_idx on public.announcements (school_id, created_at desc);

alter table public.announcements enable row level security;

create policy "announcements_select_school" on public.announcements
  for select using (school_id = public.current_school_id());
-- Inserts only via create_announcement() RPC below.

-- SECURITY DEFINER so it can fan out a notifications row to every parent in
-- the school, following the same pattern as check_in()/start_trip().
create or replace function public.create_announcement(p_title text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_announcement_id uuid;
begin
  if public.current_role() <> 'admin' then
    raise exception 'only an admin can create announcements';
  end if;
  v_school_id := public.current_school_id();

  insert into public.announcements (school_id, title, body, created_by)
  values (v_school_id, p_title, p_body, auth.uid())
  returning id into v_announcement_id;

  insert into public.notifications (recipient_id, type, title, body)
  select p.id, 'announcement', p_title, p_body
  from public.profiles p
  where p.school_id = v_school_id and p.role = 'parent';

  return v_announcement_id;
end;
$$;

revoke execute on function public.create_announcement(text, text) from public;
grant execute on function public.create_announcement(text, text) to authenticated;
