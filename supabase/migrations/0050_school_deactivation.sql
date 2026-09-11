-- Reversible whole-school lockout for the developer schools page, same
-- bare-nullable-marker shape as profiles.deactivated_at (0028) and
-- buses.retired_at (0030). No RLS policy needs to change -- schools_select_
-- member/schools_update_admin (0003_rls_policies.sql) are already scoped
-- per-school and don't reference status; enforcement is a real Supabase
-- Auth ban on every account at the school (see the deactivate Route
-- Handler), the same enforcement point deactivate-driver already uses.
alter table public.schools add column deactivated_at timestamptz;

-- Same drop-constraint/add-constraint pattern already used repeatedly for
-- notifications.type. actor_id is nullable (on delete set null) so a
-- developer action logs cleanly even when the caller has no profiles row.
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check check (action in (
  'route_deleted', 'bus_deleted', 'bus_retired', 'bus_restored',
  'guardian_removed', 'driver_deactivated', 'driver_reactivated', 'user_invited',
  'school_deactivated', 'school_reactivated'
));
