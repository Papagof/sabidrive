-- The fleet map now centers on each school's own location (captured via the
-- browser's Geolocation API at signup, see api/signup-school), rather than a
-- single hardcoded global default. `address` is the free-text display
-- companion to `geofence_lat`/`geofence_lng` (already existed since Phase 1).
alter table public.schools add column address text;
