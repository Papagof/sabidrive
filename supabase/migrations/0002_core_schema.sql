-- Core SabiDrive schema (Phase 1). Single-school assumption is not hard-coded here;
-- it's just what Phase 1 seed data + UI exercise.

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'UTC',
  geofence_lat double precision,
  geofence_lng double precision,
  geofence_radius_m integer not null default 300,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  phone text,
  role text not null check (role in ('parent', 'driver', 'admin', 'student')),
  school_id uuid references public.schools (id) on delete set null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  direction text not null default 'pickup' check (direction in ('pickup', 'dropoff')),
  -- ordered array of {lat, lng} objects describing the route polyline
  polyline jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  sequence_no integer not null,
  lat double precision not null,
  lng double precision not null,
  radius_m integer not null default 150,
  scheduled_time time,
  created_at timestamptz not null default now(),
  unique (route_id, sequence_no)
);

create table public.buses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  label text not null,
  license_plate text,
  capacity integer,
  driver_id uuid references public.profiles (id) on delete set null,
  attendant_id uuid references public.profiles (id) on delete set null,
  default_route_id uuid references public.routes (id) on delete set null,
  status text not null default 'inactive' check (status in ('inactive', 'active', 'maintenance')),
  current_trip_id uuid,
  created_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  grade text,
  photo_url text,
  default_route_id uuid references public.routes (id) on delete set null,
  default_stop_id uuid references public.stops (id) on delete set null,
  qr_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now()
);

create table public.guardian_student_links (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  relationship text,
  is_primary boolean not null default false,
  is_authorized_pickup boolean not null default true,
  created_at timestamptz not null default now(),
  unique (guardian_id, student_id)
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  bus_id uuid not null references public.buses (id) on delete cascade,
  route_id uuid not null references public.routes (id),
  driver_id uuid not null references public.profiles (id),
  status text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  direction text not null check (direction in ('pickup', 'dropoff')),
  trip_date date not null default current_date,
  started_at timestamptz,
  ended_at timestamptz,
  avg_speed_kmh numeric not null default 25,
  created_at timestamptz not null default now()
);

alter table public.buses
  add constraint buses_current_trip_id_fkey
  foreign key (current_trip_id) references public.trips (id) on delete set null;

create table public.trip_locations (
  id bigint generated always as identity primary key,
  trip_id uuid not null references public.trips (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  heading_deg numeric,
  speed_kmh numeric,
  recorded_at timestamptz not null default now()
);
create index trip_locations_trip_id_recorded_at_idx on public.trip_locations (trip_id, recorded_at desc);

create table public.trip_stop_etas (
  trip_id uuid not null references public.trips (id) on delete cascade,
  stop_id uuid not null references public.stops (id) on delete cascade,
  eta_minutes integer not null,
  distance_m numeric,
  updated_at timestamptz not null default now(),
  primary key (trip_id, stop_id)
);

create table public.check_in_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  stop_id uuid references public.stops (id) on delete set null,
  event_type text not null check (event_type in ('board', 'alight')),
  method text not null default 'qr' check (method in ('qr', 'manual')),
  scanned_by uuid references public.profiles (id),
  lat double precision,
  lng double precision,
  occurred_at timestamptz not null default now()
);
create index check_in_events_trip_id_idx on public.check_in_events (trip_id);

create table public.attendance_expectations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'boarded', 'missed', 'excused')),
  updated_at timestamptz not null default now(),
  unique (trip_id, student_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('boarding', 'alighting', 'delay', 'geofence', 'sos', 'mismatch', 'announcement')),
  title text not null,
  body text,
  related_trip_id uuid references public.trips (id) on delete set null,
  related_student_id uuid references public.students (id) on delete set null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_recipient_id_created_at_idx on public.notifications (recipient_id, created_at desc);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  trip_id uuid references public.trips (id) on delete set null,
  type text not null check (type in ('geofence_enter', 'geofence_exit', 'route_deviation', 'sos', 'harsh_brake', 'speeding', 'attendance_mismatch')),
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id)
);
create index alerts_school_id_created_at_idx on public.alerts (school_id, created_at desc);
