-- Follow-up to 0029: a bus with trip history can't be hard-deleted (by
-- design, to protect that history), but admin still needs a way to get it
-- off the active Buses page -- e.g. it was sold or taken out of service.
-- "Retire" is the reversible alternative, same shape as driver
-- deactivation (0028): a marker column plus vacating its current
-- assignments, not touching any trip/check-in/attendance row.
alter table public.buses add column retired_at timestamptz;
