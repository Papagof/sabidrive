-- Driver verification status (spec: "driver background verification status
-- viewable by admin", "driver verification visible to parents").
alter table public.profiles
  add column verification_status text check (verification_status in ('pending', 'verified', 'rejected'));

-- Admin can manage their school's driver profiles (needed to set verification_status).
create policy "profiles_update_driver_admin" on public.profiles
  for update using (
    public.current_role() = 'admin' and role = 'driver' and school_id = public.current_school_id()
  )
  with check (
    public.current_role() = 'admin' and role = 'driver' and school_id = public.current_school_id()
  );

-- Same-day pickup authorization overrides (spec: "two-factor pickup
-- authorization", "ID verification for unfamiliar pickup persons").
create table public.pickup_overrides (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  authorized_name text not null,
  authorized_relationship text,
  notes text,
  valid_date date not null default current_date,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index pickup_overrides_student_id_valid_date_idx on public.pickup_overrides (student_id, valid_date);

alter table public.pickup_overrides enable row level security;

create policy "pickup_overrides_admin_crud" on public.pickup_overrides
  for all using (
    public.current_role() = 'admin'
    and exists (select 1 from public.students s where s.id = student_id and s.school_id = public.current_school_id())
  )
  with check (
    public.current_role() = 'admin'
    and exists (select 1 from public.students s where s.id = student_id and s.school_id = public.current_school_id())
  );

create policy "pickup_overrides_select_driver" on public.pickup_overrides
  for select using (
    public.current_role() = 'driver'
    and student_id in (
      select s.id from public.students s
      where s.default_route_id in (select default_route_id from public.buses where driver_id = auth.uid() or attendant_id = auth.uid())
    )
  );
