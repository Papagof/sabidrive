-- Commercial subscriptions: every school gets a 14-day free trial from
-- signup, then must pay (Paystack, per-student, per-term) to keep full
-- access. See CLAUDE.md's "School subscriptions & billing (Paystack)"
-- section for the full design writeup.
--
-- Existing schools are grandfathered straight to 'active' with no trial/
-- expiry below -- this ships without suddenly locking out real schools that
-- were already using the app for free.

alter table public.schools
  add column subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing', 'active', 'past_due')),
  add column trial_ends_at timestamptz default (now() + interval '14 days'),
  add column current_period_end timestamptz,
  add column paystack_customer_code text;

update public.schools set subscription_status = 'active', trial_ends_at = null;

-- Durable financial record, one row per Paystack transaction attempt.
-- Deliberately not added to purge_old_data() -- same "the point is
-- permanent retention, not cleanup" reasoning as audit_log.
create table public.billing_transactions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  paystack_reference text not null unique,
  amount_kobo bigint not null,
  student_count int not null,
  status text not null check (status in ('pending', 'success', 'failed')),
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now()
);

alter table public.billing_transactions enable row level security;

-- An admin can read their own school's payment history -- unlike
-- developer_messages/rate_limit_hits (which have no UI reading them at
-- all), this table backs a real page. Still zero insert/update/delete
-- policy -- every write is a service-role Route Handler
-- (apps/admin/src/app/api/billing/*), same "the server verifies and
-- writes, the client only ever reads" shape as audit_log.
create policy "billing_transactions_select_admin" on public.billing_transactions
  for select using (public.current_role() = 'admin' and school_id = public.current_school_id());

-- Privilege protection for the new billing columns, same shape as
-- protect_profile_privilege_columns (0048/0052) -- forces them back to
-- their old value for any writer that isn't service_role. Also folds in
-- schools.deactivated_at (0050), which schools_update_admin's
-- column-agnostic policy has left just as client-writable as these new
-- columns would be if left unguarded -- same class of gap, fixed here
-- while touching this exact trigger shape rather than in a separate
-- migration.
create or replace function public.protect_school_billing_columns()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if auth.role() <> 'service_role' then
    if new.subscription_status is distinct from old.subscription_status then
      new.subscription_status := old.subscription_status;
    end if;
    if new.trial_ends_at is distinct from old.trial_ends_at then
      new.trial_ends_at := old.trial_ends_at;
    end if;
    if new.current_period_end is distinct from old.current_period_end then
      new.current_period_end := old.current_period_end;
    end if;
    if new.paystack_customer_code is distinct from old.paystack_customer_code then
      new.paystack_customer_code := old.paystack_customer_code;
    end if;
    if new.deactivated_at is distinct from old.deactivated_at then
      new.deactivated_at := old.deactivated_at;
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_school_billing_columns_trigger
  before update on public.schools
  for each row execute function public.protect_school_billing_columns();

revoke execute on function public.protect_school_billing_columns() from public;
revoke execute on function public.protect_school_billing_columns() from anon;
revoke execute on function public.protect_school_billing_columns() from authenticated;

-- Daily expiry sweep. Pure SQL, no external HTTP call -- v1 has no
-- auto-recharge (the admin re-initiates checkout manually each term via
-- /billing), so there's nothing to call out to here, unlike
-- dispatch_push_notification's pg_net pattern.
create or replace function public.expire_stale_subscriptions()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.schools set subscription_status = 'past_due'
    where subscription_status = 'trialing' and trial_ends_at < now();
  update public.schools set subscription_status = 'past_due'
    where subscription_status = 'active' and current_period_end < now();
end;
$$;

revoke execute on function public.expire_stale_subscriptions() from public;
revoke execute on function public.expire_stale_subscriptions() from anon;
revoke execute on function public.expire_stale_subscriptions() from authenticated;

select cron.schedule('expire-stale-subscriptions-daily', '0 1 * * *', 'select public.expire_stale_subscriptions();');

-- audit_log (0041, extended by 0050) gains two more action types for the
-- Paystack activation route (apps/admin/src/lib/billing.ts) and, later,
-- the expiry sweep -- same drop/recreate-constraint pattern as 0050.
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check check (action in (
  'route_deleted', 'bus_deleted', 'bus_retired', 'bus_restored',
  'guardian_removed', 'driver_deactivated', 'driver_reactivated', 'user_invited',
  'school_deactivated', 'school_reactivated',
  'subscription_activated', 'subscription_expired'
));
