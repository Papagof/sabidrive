-- 0016's "revoke ... from anon, authenticated" left a stray PUBLIC grant in
-- place (visible via pg_proc.proacl as a bare "=X/postgres" entry) that
-- anon/authenticated inherit regardless of their own explicit revokes —
-- unlike purge_old_data/queue_sms_fallback, which never had one. Revoking
-- from PUBLIC directly is what actually clears it (confirmed via
-- has_function_privilege(), not the advisor, which caches).
revoke execute on function public.dispatch_push_notification() from public;
