-- Broadcast changes on these tables over Supabase Realtime so the family/admin
-- apps can subscribe instead of polling.
alter publication supabase_realtime add table
  public.trip_locations,
  public.trip_stop_etas,
  public.check_in_events,
  public.notifications,
  public.alerts;
