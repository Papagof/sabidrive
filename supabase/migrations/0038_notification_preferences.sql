-- Lets a parent mute non-critical notification types (push + SMS delivery
-- only -- the notifications row is always inserted regardless, so their
-- in-app history stays complete even for a muted type). sos is never
-- mutable: it always delivers, matching this project's existing
-- critical/red-reserved-for-true-emergencies convention.
--
-- An absent key in notification_prefs means "enabled" (the default), so
-- every existing row needs zero backfill and any future new notification
-- type automatically defaults to enabled for everyone without a migration.
alter table public.profiles add column notification_prefs jsonb not null default '{}'::jsonb;

create or replace function public.dispatch_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_enabled boolean;
begin
  if new.type <> 'sos' then
    select coalesce((notification_prefs ->> new.type)::boolean, true)
      into v_enabled
      from public.profiles
      where id = new.recipient_id;
    if not coalesce(v_enabled, true) then
      return new;
    end if;
  end if;

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

create or replace function public.queue_sms_fallback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_enabled boolean;
begin
  if new.type in ('boarding', 'alighting', 'sos', 'mismatch', 'announcement') then
    if new.type <> 'sos' then
      select coalesce((notification_prefs ->> new.type)::boolean, true)
        into v_enabled
        from public.profiles
        where id = new.recipient_id;
      if not coalesce(v_enabled, true) then
        return new;
      end if;
    end if;

    select phone into v_phone from public.profiles where id = new.recipient_id;
    if v_phone is not null then
      insert into public.sms_outbox (recipient_phone, body, related_notification_id)
      values (v_phone, new.title || ': ' || coalesce(new.body, ''), new.id);
    end if;
  end if;
  return new;
end;
$$;
