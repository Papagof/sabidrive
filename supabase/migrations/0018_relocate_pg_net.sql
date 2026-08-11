-- Security advisor: pg_net was installed in the public schema by 0016's
-- `create extension if not exists pg_net`, and pg_net doesn't support
-- `ALTER EXTENSION ... SET SCHEMA`. Drop and recreate it registered under
-- the conventional `extensions` schema (matches pgcrypto/pg_stat_statements/
-- uuid-ossp on this project) — pg_net's own functions still live in its
-- fixed `net` schema (net.http_post, used schema-qualified by
-- dispatch_push_notification) regardless of where the extension itself is
-- registered, so this doesn't affect the trigger.
drop extension pg_net;
create extension pg_net with schema extensions;
