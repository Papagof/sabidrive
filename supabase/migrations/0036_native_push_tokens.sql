-- Native push (Android/FCM this round -- iOS needs a real Apple Developer
-- account + APNs key and isn't buildable in this environment at all, so
-- it's untouched here). Web Push (push_subscriptions, 0011_push_and_sms.sql)
-- is unreliable inside the Capacitor WebView, especially iOS, per CLAUDE.md's
-- own documented gap -- this is the real fix for Android.
--
-- Mirrors push_subscriptions_own's exact RLS shape -- same authorization
-- pattern, no new reasoning needed. platform intentionally only allows
-- 'android' right now, truthful to what's actually wired; extended by a
-- future migration if/when iOS lands, same pattern as every other
-- type-list extension in this project.
create table public.native_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('android')),
  token text not null unique,
  created_at timestamptz not null default now()
);

alter table public.native_push_tokens enable row level security;

create policy "native_push_tokens_own" on public.native_push_tokens
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());
