-- Web Push subscription registry. The push-dispatch trigger that actually
-- calls the edge function is added later (0013) once that function is
-- deployed and its secret is coordinated — this migration only creates the
-- self-contained parts (schema + the SMS-fallback simulation, which needs
-- no external dependency).
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_own" on public.push_subscriptions
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Simulated SMS fallback (spec: "push notifications + SMS fallback for
-- low-connectivity areas"). No real gateway — just a visible log for admins.
create table public.sms_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_phone text not null,
  body text not null,
  related_notification_id uuid references public.notifications (id) on delete set null,
  status text not null default 'simulated_sent',
  created_at timestamptz not null default now()
);

alter table public.sms_outbox enable row level security;

create policy "sms_outbox_select_admin" on public.sms_outbox
  for select using (
    public.current_role() = 'admin'
    and exists (
      select 1 from public.notifications n
      join public.profiles p on p.id = n.recipient_id
      where n.id = related_notification_id and p.school_id = public.current_school_id()
    )
  );

create or replace function public.queue_sms_fallback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
begin
  if new.type in ('boarding', 'alighting', 'sos', 'mismatch', 'announcement') then
    select phone into v_phone from public.profiles where id = new.recipient_id;
    if v_phone is not null then
      insert into public.sms_outbox (recipient_phone, body, related_notification_id)
      values (v_phone, new.title || ': ' || coalesce(new.body, ''), new.id);
    end if;
  end if;
  return new;
end;
$$;

create trigger on_notification_queue_sms
  after insert on public.notifications
  for each row execute function public.queue_sms_fallback();
