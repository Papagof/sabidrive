-- Incident triage: who's on it, and why it was resolved the way it was.
-- Existing "alerts_resolve_admin" update policy (0003) already covers writes
-- to these new columns — no RLS change needed.
alter table public.alerts add column assigned_to uuid references public.profiles (id);
alter table public.alerts add column notes text;
