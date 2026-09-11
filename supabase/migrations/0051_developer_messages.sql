-- Durable record of emails a developer sends to a school's admin via the
-- Developer schools page, same "log every attempt unconditionally"
-- philosophy as rate_limit_hits (0037). RLS enabled with zero client
-- policies -- same "service-role/developer-route only" shape as
-- rate_limit_hits/pickup_codes, since a developer may have no profiles row
-- to scope a policy against anyway. Not surfaced in a dedicated UI yet
-- (accountability record, matching audit_log's own reasoning), just written
-- by the message Route Handler.
create table public.developer_messages (
  id bigint generated always as identity primary key,
  school_id uuid not null references public.schools (id) on delete cascade,
  sender_email text not null,
  recipient_email text not null,
  subject text not null,
  body text not null,
  resend_message_id text,
  status text not null check (status in ('sent', 'failed')),
  created_at timestamptz not null default now()
);

alter table public.developer_messages enable row level security;
