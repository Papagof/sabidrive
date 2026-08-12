# Tripme

School bus tracking + child safety app. Full product spec: [SPEC.md](SPEC.md). Build plan and Phase 1/2 scope cut line: see the plan this repo was built from (ask the user if it's not in your context — it lays out what's deliberately deferred).

## Architecture

Two separate Next.js 14 (App Router, TypeScript) web apps sharing one Supabase backend:

- **`apps/family`** — parent + driver (+ stubbed student) roles. Installable PWA (`@ducanh2912/next-pwa`).
- **`apps/admin`** — school admin / transport coordinator. Plain web app, no PWA.
- **`packages/ui`** — shared components (`Button`, `Card`, `StatusPill`, `Banner`, `TripMap`/`FleetMap`/`ClickToAddMap`) and the calm-palette design tokens (`src/tokens/colors.ts`).
- **`packages/supabase`** — browser/server Supabase client factories, a `SupabaseProvider` context, realtime hooks (`useSession`, `useTripLocation`, `useNotifications`, `useFleetTrips`), and typed query/RPC wrappers under `src/queries/` (`trips`, `students`, `admin`, `push`).
- **`packages/gps-sim`** — pure route-interpolation + geofence math (`src/engine.ts`, `src/route-utils.ts`) and the local dev ticker (`src/run-local.ts`) that simulates bus GPS movement.
- **`supabase/migrations`** — schema, RLS policies, and RPCs, applied in numeric order.
- **`scripts/seed.ts`** — creates one demo school, a route+stops, a bus, students, guardian links, and one auth account per role.

Workspace-internal packages (`@tripme/ui`, `@tripme/supabase`, `@tripme/config`) are consumed as TypeScript source directly (no build step) — both apps list them in `next.config.mjs`'s `transpilePackages`.

## Commands

```
pnpm install              # from repo root
pnpm dev                  # both apps via turbo (family :3000, admin :3001)
pnpm --filter family dev  # just the family app
pnpm --filter admin dev   # just the admin app
pnpm sim:dev              # local GPS ticker — needed for any trip to actually move
pnpm db:seed              # seed demo data (needs .env.local at repo root)
pnpm lint / pnpm typecheck / pnpm build
```

Running the app for real requires **three processes**: `pnpm --filter family dev`, `pnpm --filter admin dev`, and `pnpm sim:dev` — a driver's "Start Trip" does nothing visible without the simulator running.

## Supabase project

- Project ref `ubslfmtqebuuxujohksd` (org "Matombo Agency"), URL `https://ubslfmtqebuuxujohksd.supabase.co`. Provisioned via the Supabase MCP tools (`mcp__claude_ai_Supabase__*`), not the CLI.
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` go in `.env.local` in **both** `apps/family` and `apps/admin` (public, safe in the browser).
- `SUPABASE_SERVICE_ROLE_KEY` goes only in a root-level `.env.local` (read by `scripts/seed.ts` and `packages/gps-sim/src/run-local.ts`). Never import it into browser code.
- After any migration change, regenerate `packages/supabase/src/types.gen.ts` via the `generate_typescript_types` MCP tool and re-run `get_advisors` as a security/perf gate.

## Deployment (Vercel)

Two separate Vercel projects under the `godfrey5` team, one per app — matches the two-app architecture, not one project with two output dirs:

- **`family`** → https://family-six-theta.vercel.app
- **`admin`** → https://admin-nine-tau-50.vercel.app

Each project's **Root Directory** is set (via the Vercel API/dashboard, `Settings → General → Root Directory`) to `apps/family` / `apps/admin` respectively — required for Vercel to correctly detect the pnpm workspace and run `pnpm install` at the true monorepo root rather than treating the subfolder as an isolated project (a plain `vercel deploy` run *from inside* `apps/family` uploads only that subfolder and fails with `npm install` errors — confirmed the hard way).

**Redeploying via CLI** (no GitHub integration is connected — these are CLI-linked, not auto-deploy-on-push): each app has its own `apps/*/​.vercel/project.json` (gitignored) from `vercel link`. Because of the Root-Directory-detection issue above, deploying must happen with the **monorepo root as CWD**, using a `.vercel/project.json` at the repo root that's a copy of the target app's — e.g. to redeploy family:
```
cp apps/family/.vercel/project.json .vercel/project.json
vercel deploy --prod --token=<VERCEL_TOKEN>   # run from the repo root
```
Swap in `apps/admin/.vercel/project.json` to redeploy admin instead. (A proper GitHub-connected Vercel project wouldn't need this workaround — worth switching to if this becomes a frequent pain point.)

**Environment variables** (set per-project in Vercel, `Production` scope — mirrors each app's `.env.local`):
- `family`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
- `admin`: the same two `NEXT_PUBLIC_*` vars, plus `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (server-only, used by `/api/invite-user`) and `FAMILY_APP_URL=https://family-six-theta.vercel.app` (so invite emails redirect to the deployed family app, not localhost).

**Manual step required**: add `https://family-six-theta.vercel.app/set-password` to Supabase's redirect-URL allow-list (Dashboard → Authentication → URL Configuration → Redirect URLs) — same requirement as the localhost one, needed before an invite sent from the deployed admin app will actually redirect correctly.

Not yet done: custom domain (both apps are on their `*.vercel.app` URLs), native Android/iOS packaging (Capacitor, planned as the next phase).

## Data model & RLS mental model

Tables and relationships are documented top-to-bottom in `supabase/migrations/0002_core_schema.sql`. The access-control shape (`0003_rls_policies.sql`):

- **Parent**: read-only, scoped to their children via `guardian_student_links`, plus their own `notifications`, plus the name/phone/verification status of the driver currently driving one of their children's buses.
- **Driver**: scoped to their assigned bus/route/stops/roster; can only act on a trip they own while it's `in_progress`. Also has read access to `guardian_student_links`/`profiles` (guardian names) and `pickup_overrides` for students on their route, needed for two-factor pickup authorization at drop-off — added in `0015_driver_pickup_visibility.sql` after a live end-to-end test caught the gap.
- **Admin**: full CRUD scoped to `school_id`, plus update rights on their school's driver profiles (to set `verification_status`) and on their own `schools` row (Settings page).
- **Cross-role writes never happen via raw client inserts.** Anything that fans out to *other* users' rows (notifications, alerts, check-ins, trip lifecycle, announcements) goes through `SECURITY DEFINER` RPCs — `start_trip` / `end_trip` / `check_in` (`0004_functions_rpc.sql`), `create_announcement` (`0010_announcements.sql`) — which re-validate `auth.uid()` internally. The one exception is `packages/gps-sim`, a trusted service-role process that writes `trip_locations`/`trip_stop_etas`/alerts directly.

If you add a new cross-role write path, follow that RPC pattern rather than loosening an RLS policy.

**Grant-lockdown gotcha** (bit us twice, see `0006`/`0007`/`0013`/`0014`/`0017`): revoking `EXECUTE` from `anon`/`authenticated` on a **newly created** function often does nothing, because Postgres/Supabase grants a default `EXECUTE` to the bare `PUBLIC` pseudo-role at creation time, which every role inherits regardless of role-specific revokes. `REVOKE ... FROM PUBLIC` is what actually clears it. The security advisor (`get_advisors`) also caches — after a grant fix, verify with a direct query instead of trusting the advisor's next call:
```sql
select r.rolname, has_function_privilege(r.rolname, 'public.fn_name(arg_types)'::regprocedure, 'EXECUTE')
from (values ('anon'), ('authenticated')) as r(rolname);
```

## Coding conventions

- TypeScript strict, no `any`.
- Data reads/writes go through `packages/supabase/src/queries/*.ts` (typed wrappers) rather than ad-hoc `.from(...)` calls scattered in components, where practical.
- Tailwind: use the calm-palette tokens (`brand`, `calm`, `neutral`, `caution`, `critical`) from `packages/ui/src/tokens/colors.ts` via the shared preset — **`critical`/red is reserved for true SOS/emergency states only**, never routine warnings (use `caution`/amber for those).
- Controls should stay large/high-contrast (`min-h-control` = 2.75rem) per the spec's accessibility guidance for time-sensitive pickup/drop-off moments.
- Auth is client-side only in Phase 1 (no `@supabase/ssr` cookie plumbing) — acceptable for the MVP demo, a documented Phase 2 improvement if SSR-protected routes are needed.

## Simulated hardware (Phase 1 stubs)

Per the fixed build decisions, these are deliberately simulated, not real:

- GPS: `packages/gps-sim` interpolates position along a route polyline instead of reading a real tracker.
- RFID/NFC: replaced by `qrcode.react`-generated student QR codes (admin → Students → Manage) scanned via `@yudiel/react-qr-scanner` in the driver's Scan screen (with a manual token-entry fallback for camera-less environments).
- SMS: simulated via the `sms_outbox` table/trigger (Phase 2) — no real gateway.
- CCTV/background-check integrations: still not built.

## Phase 1 scope

Auth + 3 roles (admin, driver, parent), live simulated tracking, QR check-in/out with parent notifications, parent live dashboard + notification timeline, admin fleet map + route/stop/bus/student management + attendance reconciliation. Single school assumed.

## Phase 2 scope (built)

- **Speed & harsh-braking alerts**: `packages/gps-sim/src/telemetry.ts` layers randomized instantaneous speed on top of the constant average `advanceTrip` uses for position math, and `run-local.ts` raises `speeding`/`harsh_brake` alerts (60s per-trip cooldown) when it crosses a threshold.
- **Driver verification badge**: `profiles.verification_status` (`pending`/`verified`/`rejected`), settable by admin on the Buses page, shown to parents on the driver-contact card.
- **Two-factor pickup authorization**: `pickup_overrides` table for same-day overrides (admin → Students → Manage); the driver's Scan screen, on a drop-off scan, looks up authorized guardians + today's overrides (`studentQueries.getPickupInfo`) and requires an explicit confirm tap before the `alight` check-in RPC fires.
- **Alert/incident triage**: `alerts.assigned_to`/`alerts.notes` columns; admin Alerts page has severity filters, "Assign to me", and resolution notes.
- **Announcements**: `announcements` table + `create_announcement` RPC (admin → Announcements) fans out a `type='announcement'` notification to every parent in the school; family app has a dedicated Announcements feed (not tied to a specific child).
- **SMS-fallback outbox**: `sms_outbox` table, populated by an `AFTER INSERT ON notifications` trigger (`queue_sms_fallback`) for `boarding`/`alighting`/`sos`/`mismatch`/`announcement` types where the recipient has a `profiles.phone` on file. Purely simulated — admin → SMS log just reads the outbox, no real gateway.
- **Data retention**: `purge_old_data()` (deletes `trip_locations` >14 days, read `notifications` >90 days) on a nightly `pg_cron` schedule (`0012_data_retention.sql`).
- **Multi-school hardening**: admin Settings page (school name/timezone/geofence, via the existing `schools_update_admin` policy). Isolation was verified live — a second school+admin created via the service-role client saw zero rows across buses/students/alerts/trips belonging to school 1.
- **Real Web Push**: see the dedicated section below — built and wired end-to-end, but blocked on a manual dashboard step.

## Web Push setup (manual step required)

The push pipeline (`notifications` insert → `dispatch_push_notification` trigger → `pg_net.http_post` → `push-dispatch` edge function → `web-push` → browser) is fully deployed and confirmed firing (check `supabase/functions/push-dispatch` logs or `select * from net._http_response`), but returns 500 until these **Edge Function secrets** are set via the Supabase dashboard (Project Settings → Edge Functions → `push-dispatch` → Secrets) — the Supabase MCP tools have no way to set them:

- `VAPID_PUBLIC_KEY` = `BKRyj0_Lo1kgE5Lt0geo4_X3rl3ldVqk6zixrxLa-F3jkZhjxqJVFW22U0eyz6CQTksSpsU3mw4q8zfZYL-NReA` (also in `apps/family/.env.local` as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — must match)
- `VAPID_PRIVATE_KEY` = `HxLmgZZX9MOtkrOvsYi6JCPoZ0EkEZ7ViH0RNiBijp4`
- `VAPID_SUBJECT` = `mailto:admin@tripme.dev` (or any contact URI)
- `PUSH_DISPATCH_SECRET` = `f0b475bff10d901a6a4de081c4a16ca2df77e8cd11a4d0e997c34b1e66054e3b` (must match the Vault secret named `push_dispatch_secret` set in `0016_push_dispatch_trigger.sql` — if you ever rotate it, update both sides via `select vault.update_secret(...)`)

Once set, subscribe from the family app (Parent or Driver home → "Enable notifications" — note `next-pwa`'s own service worker is dev-disabled, but `public/push-worker.js` is a separate, always-active registration) and trigger any notification (e.g. an admin announcement) to see a real push.

(Status: the user has added these Edge Function secrets — not yet re-verified end-to-end in this session.)

## Admin-invited accounts (Phase 3)

The only way to create a driver/parent account is now `scripts/seed.ts` (demo data) **or** an admin inviting them by email from the admin app (Buses/Students "+ Invite new…", or the dedicated Staff & Guardians page). No public signup.

- `apps/admin/src/app/api/invite-user/route.ts` — the admin app's **first server-side code path**. Verifies the caller's bearer token, confirms `role === 'admin'` via their own `profiles` row (service-role client), then calls `auth.admin.inviteUserByEmail` with `role`/`school_id` taken **only** from the verified caller's profile — never from the request body, so this endpoint can't be used to invite a fake admin or into another school. Needs `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_URL` + `FAMILY_APP_URL` in `apps/admin/.env.local` (server-only — the pattern is the same as `scripts/seed.ts`, not a shift to SSR page rendering).
- `apps/family/src/app/set-password/page.tsx` — where the invite email's link lands; supabase-js auto-detects the session from the URL, then the user sets a password and gets redirected by role.
- `profiles.email` (added in `0019_profiles_email.sql`) is a denormalized copy of `auth.users.email`, kept in sync by `handle_new_user` — added because PostgREST can't expose the `auth` schema directly and the Staff page/dropdowns need it for display.

**Manual step required**: Supabase Auth requires `redirectTo` URLs to be on an allow-list (Dashboard → Authentication → URL Configuration → Redirect URLs) — no MCP tool manages this. Add the family app's `/set-password` URL (e.g. `http://localhost:3002/set-password` in dev) before testing the real email → click-link → set-password flow. Also: no custom SMTP is configured, so invites go through Supabase's default email service, which is rate-limited (hit this during verification) — fine for occasional testing, not for real invite volume.
