-- Wires notifications -> real Web Push, via the push-dispatch edge function
-- deployed separately. The shared secret authenticating this call lives in
-- Supabase Vault (Postgres side) and must match the push-dispatch edge
-- function's PUSH_DISPATCH_SECRET env var (Edge Function secrets can't be
-- set via the Supabase MCP tools, so that side is a manual dashboard step).
create extension if not exists pg_net;

select vault.create_secret(
  'f0b475bff10d901a6a4de081c4a16ca2df77e8cd11a4d0e997c34b1e66054e3b',
  'push_dispatch_secret',
  'Shared secret authenticating pg_net calls from notifications trigger to the push-dispatch edge function.'
);

create or replace function public.dispatch_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_dispatch_secret';
  if v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://ubslfmtqebuuxujohksd.supabase.co/functions/v1/push-dispatch',
    body := jsonb_build_object('notification_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-dispatch-secret', v_secret)
  );
  return new;
end;
$$;

create trigger on_notification_dispatch_push
  after insert on public.notifications
  for each row execute function public.dispatch_push_notification();

revoke execute on function public.dispatch_push_notification() from anon, authenticated;
