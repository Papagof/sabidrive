-- 0013's "revoke ... from public" had no effect: Supabase applies default
-- privileges that grant EXECUTE directly to the anon/authenticated roles for
-- newly created functions (not via the PUBLIC pseudo-role), so revoking from
-- PUBLIC alone doesn't touch it. Revoke from the actual roles instead,
-- confirmed via has_function_privilege() rather than the (cached) advisor.
revoke execute on function public.create_announcement(text, text) from anon;
revoke execute on function public.purge_old_data() from anon, authenticated;
revoke execute on function public.queue_sms_fallback() from anon, authenticated;
