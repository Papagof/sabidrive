-- Admin can now delete a bus, but trips.bus_id was ON DELETE CASCADE --
-- deleting a bus with any trip history would have silently cascaded away
-- every trip, check-in event, attendance record, and GPS location tied to
-- it. Switched to the same no-action/RESTRICT behavior trips.driver_id
-- already has (0002_core_schema.sql), so the database itself refuses the
-- delete (a real FK violation, not just a client-side check) for any bus
-- that has ever run a trip -- the admin UI catches that specific error and
-- shows a friendly message instead of a raw Postgres error.
alter table public.trips drop constraint trips_bus_id_fkey;
alter table public.trips add constraint trips_bus_id_fkey
  foreign key (bus_id) references public.buses (id);
