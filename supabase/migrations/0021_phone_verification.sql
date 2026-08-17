-- Real phone verification (via Twilio SMS, unlike the rest of this app's
-- deliberately-simulated hardware) + phone-number login. Phone login still
-- authenticates with the account's real password -- the phone number is
-- only ever used to look up which email it belongs to.

alter table public.profiles add column phone_verified boolean not null default false;

-- Makes phone -> account lookup at login unambiguous and stops one account
-- from claiming a number that already belongs to someone else.
create unique index profiles_phone_unique_idx on public.profiles (phone) where phone is not null;

-- profiles_update_own (0003_rls_policies.sql) lets a user update any column
-- on their own row, including phone/phone_verified. Without this trigger a
-- client could just set phone_verified = true directly and skip the OTP
-- entirely, or silently keep phone_verified = true after changing the
-- number. Only the service-role-backed OTP routes may flip these fields.
create or replace function public.protect_phone_verified()
returns trigger
language plpgsql
as $$
begin
  if auth.role() <> 'service_role' then
    if new.phone_verified is distinct from old.phone_verified then
      new.phone_verified := old.phone_verified;
    end if;
    if new.phone is distinct from old.phone then
      new.phone := old.phone;
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_phone_verified
  before update on public.profiles
  for each row execute function public.protect_phone_verified();

-- Short-lived OTP codes. RLS enabled with no policies -- only the
-- service-role client (the phone/send-otp and phone/verify-otp routes)
-- ever touches this table.
create table public.phone_otp_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);
create index phone_otp_codes_user_id_created_at_idx on public.phone_otp_codes (user_id, created_at desc);

alter table public.phone_otp_codes enable row level security;
