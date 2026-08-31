-- The on-time/late/early deviation threshold used by the admin Reports
-- page's on-time-performance card and the parent trip-history page was a
-- hardcoded 5-minute default. Making it a per-school setting -- every
-- existing school keeps the current behavior via the default, no backfill
-- needed. The check guards against a nonsensical zero/negative value, which
-- would silently corrupt on-time classification rather than fail loudly.
alter table public.schools add column on_time_threshold_minutes integer not null default 5
  check (on_time_threshold_minutes > 0);
