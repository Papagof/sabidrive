-- Phase 1 uses plain lat/lng double precision columns (see packages/gps-sim/src/route-utils.ts
-- for haversine/geofence math) rather than PostGIS, so this project has no hard extension
-- dependency beyond pgcrypto for gen_random_uuid().
create extension if not exists pgcrypto;
