-- purge_old_data() is invoked only by the pg_cron schedule (which runs
-- internally, not via PostgREST) and queue_sms_fallback() is trigger-only —
-- neither should be directly callable by any client role.
revoke execute on function public.purge_old_data() from public;
revoke execute on function public.queue_sms_fallback() from public;
