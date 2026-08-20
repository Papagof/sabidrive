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

**Both projects are Git-connected to `Papagof/tripme`** (production branch `main`) via the Vercel GitHub App — every push to `main` auto-deploys both `family` and `admin` in parallel, each building from its own Root Directory. No CLI step needed for normal deploys.

**Manual CLI redeploy** (fallback — e.g. to redeploy without a new commit): each app has its own `apps/*/​.vercel/project.json` (gitignored) from `vercel link`. Because of the Root-Directory-detection issue above, a manual deploy must happen with the **monorepo root as CWD**, using a `.vercel/project.json` at the repo root copied from the target app's — e.g. to redeploy family:
```
cp apps/family/.vercel/project.json .vercel/project.json
vercel deploy --prod --token=<VERCEL_TOKEN>   # run from the repo root
```
Swap in `apps/admin/.vercel/project.json` to redeploy admin instead.

**Environment variables** (set per-project in Vercel, `Production` scope — mirrors each app's `.env.local`):
- `family`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
- `admin`: the same two `NEXT_PUBLIC_*` vars, plus `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (server-only, used by `/api/invite-user`) and `FAMILY_APP_URL=https://family-six-theta.vercel.app` (so invite emails redirect to the deployed family app, not localhost).

**Manual step required**: add `https://family-six-theta.vercel.app/set-password` to Supabase's redirect-URL allow-list (Dashboard → Authentication → URL Configuration → Redirect URLs) — same requirement as the localhost one, needed before an invite sent from the deployed admin app will actually redirect correctly.

Not yet done: custom domain (both apps are on their `*.vercel.app` URLs).

## Native packaging (`apps/family-native`)

Capacitor shell around the **family app only** (parent/driver — the admin dashboard stays web-only, it's a desktop tool). It ships no web assets of its own: `capacitor.config.ts`'s `server.url` points the WebView straight at the live deployed site (`https://family-six-theta.vercel.app`), so every push to `main` that redeploys `family` shows up in the native app instantly, no app-store resubmission needed. `www/` is a required-but-unused placeholder Capacitor needs even in remote-URL mode.

- **App icon/splash**: generated via `npx capacitor-assets generate` from `assets/icon.png`/`assets/splash.png`, which `assets/generate-source-images.mjs` rasterizes from `apps/family/public/icons/icon.svg` (the one true source image — rerun the script + `generate` after changing it).
- **Camera permission** (driver QR scanning) is wired on both platforms: `android/app/src/main/AndroidManifest.xml` (`CAMERA` + optional `android.hardware.camera` feature) and `ios/App/App/Info.plist` (`NSCameraUsageDescription`).
- **Android**: fully buildable and verified on this machine (Java 21 + Android SDK already installed). `cd apps/family-native/android && ./gradlew.bat assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk`. Confirmed end-to-end: installed on an emulator (`adb install`), launched, and it correctly rendered the live login screen.
- **iOS**: scaffolded and configured (`ios/App`, Xcode project + Info.plist) but **not buildable in this environment** — no Mac available, and `xcodebuild`/CocoaPods need one. Building/signing/submitting needs either a real Mac or a cloud CI Mac runner (e.g. GitHub Actions' macOS runners, or a service like Codemagic) — not set up yet.
- **Known gap**: the existing Web Push implementation (`apps/family/public/push-worker.js`) is unreliable inside a native WebView, especially on iOS (WKWebView doesn't support the web Push API the way an installed-PWA Safari tab does). In-app Supabase Realtime notifications work regardless. Real native push would mean adding `@capacitor/push-notifications` (FCM/APNs) — not done.
- `appId` is `com.tripme.family` — a placeholder reverse-domain identifier, fine for development, but each store just needs it to be globally unique at actual submission time (doesn't require owning `tripme.com`).
- Not done: release signing (keystore generation), Play Console / App Store Connect submission, native push.

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
- SMS notifications: simulated via the `sms_outbox` table/trigger (Phase 2) — no real gateway. (Phone *verification* is the one exception — see "Phone verification & phone login" below, which uses real Twilio SMS by explicit product decision.)
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

## Phone verification & phone login (real SMS, manual step required)

Unlike the rest of this app's deliberately-simulated hardware (GPS/RFID/SMS notifications — see "Simulated hardware" below), phone verification sends a **real** SMS one-time code via Twilio, by explicit product decision. Phone login is still password-based — the phone number is only ever used server-side to look up which account's email to authenticate; there's no passwordless/OTP sign-in.

- `supabase/migrations/0021_phone_verification.sql` — adds `profiles.phone_verified` and a partial unique index on `profiles.phone` (so phone→account lookup at login is never ambiguous and one account can't claim a number another account already verified). A `before update on profiles` trigger (`protect_phone_verified`) forces `phone`/`phone_verified` back to their old values for any writer that isn't `service_role` — without it, `profiles_update_own` (`0003_rls_policies.sql`) would let a client just set `phone_verified = true` directly and skip the OTP entirely. (0021 also created a custom `phone_otp_codes` table for a self-rolled hashed-code approach; `0022_drop_phone_otp_codes.sql` dropped it after switching to Twilio Verify, which owns code state itself — see below.)
- `apps/family/src/app/api/phone/send-otp` and `.../verify-otp` — the family app's **first server-side code paths** (same bearer-token-verification pattern as the admin app's `invite-user`). Both call **Twilio Verify** (`verify.twilio.com/v2/Services/{TWILIO_VERIFY_SERVICE_SID}/...`), not the plain Messages API — Twilio Verify uses its own pre-approved message format, so unlike a custom SMS body it works on a Twilio **trial** account (trial accounts otherwise reject arbitrary message content with error 572006, and can only text numbers added as Verified Caller IDs, which defeats a real per-user verification flow). `send-otp` stages `profiles.phone` (unverified) and calls `POST .../Verifications`; `verify-otp` calls `POST .../VerificationCheck` and flips `phone_verified` only when Twilio reports `status: "approved"`.
- `apps/family/src/app/api/login-with-phone` — public (no bearer token, caller has no session yet). Looks up `profiles` by `phone` where `phone_verified = true` to get the account's email, then calls `signInWithPassword` server-side with an anon-key client. Never returns the resolved email to the client and gives the identical generic "Invalid phone number or password" message whether the phone doesn't exist or the password is wrong, so it can't be used to enumerate which phone numbers have accounts.
- `apps/family/src/app/account/page.tsx` — shared page for both parent and driver roles (linked as "Account" from both home screens) showing email-verified status (read from `auth.users.email_confirmed_at` — already true for every parent/driver account by construction, since accepting the admin's invite link *is* what confirms email) and the phone verify/change flow.

**Manual step required**: needs a real Twilio account — Account SID, Auth Token, and a **Verify Service** (Console → Verify → Services, or created once via `POST https://verify.twilio.com/v2/Services`; unlike the Messages API this needs no phone number of its own). Set as server-only env vars in `apps/family/.env.local` (and later Vercel's `family` project, Production scope): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` — plus `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, which the family app now needs for the first time (same names/values as `apps/admin/.env.local`). Works fine on a Twilio trial account (draws from the free trial credit, no upgrade or verified-caller-ID step needed) — confirmed live, code sent to and verified from a real phone.

## Home pickup/drop-off SMS codes

An alternative to QR scanning for the two "home end" check-ins — a student boarding at home on a pickup-direction trip, or alighting at home on a dropoff-direction trip. A parent requests a one-time SMS code (reusing the same Twilio Verify service as phone verification, above) from the child's page, and the driver types that code into the Scan screen instead of scanning the QR.

- `supabase/migrations/0026_pickup_sms_codes.sql` — adds `pickup_codes` (student_id, guardian_id, event_type, phone, status, expires_at) with RLS enabled and **no policies at all** — like `phone_verified`, it's only ever touched by service-role Route Handlers that re-validate authorization in code, so a bare client gets zero rows regardless of the table-level grants Supabase auto-applies to `anon`/`authenticated`. Also adds `'sms_code'` to `check_in_events.method`'s check constraint, and gives `check_in()` an optional trailing `p_method` param so a code-based check-in is recorded honestly instead of every row claiming `'qr'`.
  - **Overload trap hit live**: appending a defaulted trailing parameter to `check_in()` via `create or replace function` did **not** replace the original 3-arg function — Postgres treated the 4-arg version as a distinct overload, since exact argument-list match (not just satisfiability via defaults) is what makes `CREATE OR REPLACE` replace-in-place. With both signatures present, every existing 3-arg call became ambiguous (`function is not unique`) because the 4-arg overload's `p_method` default also satisfies a 3-arg call. Fixed by explicitly `drop function`-ing the old 3-arg signature. The new 4-arg function also started with a fresh **PUBLIC** default EXECUTE grant (this project's documented grant-lockdown gotcha, same as `0006`/`0007`/`0013`/`0014`/`0017`) rather than inheriting the original's `authenticated`-only grant — re-locked down explicitly and reverified via `has_function_privilege()`.
  - `purge_old_data()` (`0012_data_retention.sql`) extended to also drop `pickup_codes` rows older than 1 day — they're 10-minute-lived by design.
- `apps/family/src/app/api/pickup-code/request` — guardian-only (verified via `guardian_student_links`, service role), requires the caller's own `profiles.phone_verified`. A new request marks any other pending row for that phone+event as `expired` first, since a fresh Twilio Verification for the same phone number effectively supersedes whatever was pending before — without this, `/verify` could match a stale row Twilio itself no longer honors.
- `apps/family/src/app/api/pickup-code/verify` — called by the driver's Scan screen with a bare 6-digit code plus `tripId`/`eventType`; the code alone doesn't say which student it's for, so this narrows candidates to `pickup_codes` rows for students on *that trip's* roster (`attendance_expectations`) with a matching pending, unexpired row, then calls Twilio's `VerificationCheck` against each candidate's phone until one approves (roster sizes are small — a single bus manifest — so this stays cheap). On a match it calls `check_in(..., p_method: 'sms_code')` using a Supabase client scoped to the driver's own bearer token (`createUserScopedServerSupabaseClient`, `packages/supabase/src/server.ts`) so `auth.uid()` inside the RPC resolves to the real driver, then marks the `pickup_codes` row `consumed`.
- `apps/family/src/app/parent/[studentId]/page.tsx` — "Text pickup code" / "Text drop-off code" buttons (gated on `profile.phone_verified`, linking to Account if not); `apps/family/src/app/driver/trip/[tripId]/scan/page.tsx` — a code-entry field alongside the existing camera/manual-token options, scoped to whichever `eventType` (Boarding/Drop-off) toggle is currently selected.
- Verified live: full auth-guard coverage (missing token, non-guardian, unverified phone, wrong driver, unknown/not-in-progress trip, no matching candidate, wrong code against a real pending candidate) plus the `check_in(p_method='sms_code')` → `check_in_events`/`attendance_expectations`/notification-fan-out pipeline, all via a disposable synthetic school hitting the real Route Handlers over `pnpm --filter family dev`. The one leg not exercised by an automated test is an actual Twilio-approved code (needs a real phone reading a real SMS, same constraint phone verification/login-by-phone had) — that code path is otherwise identical to the already-live-verified `verify-otp` route.

## Admin-invited accounts (Phase 3)

The only way to create a driver/parent account is `scripts/seed.ts` (demo data) **or** an admin inviting them by email from the admin app (Buses/Students "+ Invite new…", or the dedicated Staff & Guardians page) — see below for how a school gets its *first* admin, which is the one account type this doesn't cover.

- `apps/admin/src/app/api/invite-user/route.ts` — the admin app's **first server-side code path**. Verifies the caller's bearer token, confirms `role === 'admin'` via their own `profiles` row (service-role client), then calls `auth.admin.inviteUserByEmail` with `role`/`school_id` taken **only** from the verified caller's profile — never from the request body, so this endpoint can't be used to invite a fake admin or into another school. Needs `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_URL` + `FAMILY_APP_URL` in `apps/admin/.env.local` (server-only — the pattern is the same as `scripts/seed.ts`, not a shift to SSR page rendering).
- `apps/family/src/app/set-password/page.tsx` — where the invite email's link lands; supabase-js auto-detects the session from the URL, then the user sets a password and gets redirected by role.
- `profiles.email` (added in `0019_profiles_email.sql`) is a denormalized copy of `auth.users.email`, kept in sync by `handle_new_user` — added because PostgREST can't expose the `auth` schema directly and the Staff page/dropdowns need it for display.

**Manual step required**: Supabase Auth requires `redirectTo` URLs to be on an allow-list (Dashboard → Authentication → URL Configuration → Redirect URLs) — no MCP tool manages this. Add the family app's `/set-password` URL (e.g. `http://localhost:3002/set-password` in dev) before testing the real email → click-link → set-password flow. Also: no custom SMTP is configured, so invites go through Supabase's default email service, which is rate-limited (hit this during verification) — fine for occasional testing, not for real invite volume.

## Self-service school signup

`apps/admin/src/app/signup/page.tsx` (linked from `/login`) is genuinely open/public — any new school creates its own account, no approval step. This is the one account-creation path that predates having any admin: `apps/admin/src/app/api/signup-school/route.ts` takes no bearer token, creates a new `schools` row and its first admin (`auth.admin.createUser`, direct password — not an email invite, avoids the same email rate limit noted above) in one call, with compensating cleanup (deletes the school row) if user creation fails so a rejected signup never leaves an orphan. Same safety rule as `invite-user`: role is hardcoded to `'admin'` and the school is always freshly created server-side, never client-supplied — verified live (a real signup, confirmed the new admin sees zero rows from any other school, and confirmed a duplicate-email attempt leaves no orphaned school behind).

**Address + device location are required at signup** (`0020_schools_address.sql` adds `schools.address`; `geofence_lat`/`geofence_lng` already existed). No paid geocoding API is wired in, so the coordinates come straight from the browser's own Geolocation API (`apps/admin/src/lib/geolocation.ts`) rather than being derived from the typed address — the signup page auto-prompts for location on mount, with a retry button, and the submit button stays disabled until both the address field is filled and a position is captured; `signup-school` re-validates both server-side (rejects a missing address or out-of-range/non-finite lat/lng) so the requirement holds even if the client check is bypassed. The admin dashboard's fleet map now centers on the school's own `address`/`geofence_lat`/`geofence_lng` (shown as a caption) instead of a hardcoded global default, falling back to that default only for schools that signed up before this shipped; Settings has a non-required "Use my current location" button using the same helper so admins can update it later.

## Multi-school & cross-role guardians

A parent whose children attend two different schools can use **one account** for both — but this isn't "one email registered twice." Supabase Auth requires email to be globally unique per project, so instead a second school's admin attaches the parent's *existing* account as a guardian of their student, rather than inviting a duplicate.

- The parent-facing read path (trips/buses/routes/stops/students/notifications) was already multi-school-safe before this shipped — everything is scoped through `guardian_student_links` → `students.school_id`, never through the guardian's own `profiles.school_id` (which just means "whichever school first invited them," now effectively vestigial for parents). `gsl_admin_crud` (`0003_rls_policies.sql`) only checks the *student's* school too, so an admin linking an existing cross-school guardian to a local student needed zero RLS changes.
- Two things did assume one school per parent, fixed in `0023_multi_school_parents.sql`: `create_announcement()`'s notification fan-out selected recipients by `profiles.school_id` (so a second school's announcements would never reach a parent whose `school_id` pointed elsewhere) — rewritten to join through `guardian_student_links`/`students` instead; and there was no RLS policy letting a parent read a `schools` row outside their own `school_id`, so even though they could already see a second school's students/buses, they couldn't look up its *name* for display — added `schools_select_parent_of_child`.
- `apps/admin/src/app/api/find-guardian-by-email/route.ts` — looks up an existing account by email regardless of role or school (service-role, since an admin's own RLS can't see cross-school profiles), returning only `{found, id, full_name}` — never phone, other children, or which other schools/roles they belong to. Wired into the Students page (`apps/admin/src/app/students/page.tsx`) as a "link a guardian who already has an account at another school" input next to the existing same-school dropdown and email-invite flow. Linking is immediate, no parent-side confirmation step — matching the trust this app already gives admins for same-school guardian linking.
- `apps/family/src/app/parent/page.tsx` groups a parent's children by school (via `getGuardianStudents`' now-embedded `schools(name)`) whenever they span more than one, so it's obvious which bus/route each child belongs to.

**Guardian status is independent of an account's primary role** (`0024_cross_role_guardians.sql`) — an admin or driver can also be a guardian of a child at another school with the *same login*, not just a parent-role account. `students_select_parent` always worked this way (`is_guardian_of(id)`, no role check); `can_view_trip()`, `routes_select_parent`, `stops_select_parent`, `buses_select_parent`, and `profiles_select_guardian_of_route_student` (`0015_driver_pickup_visibility.sql`) previously also required `current_role() = 'parent'` (or the target row's `role = 'parent'`) alongside the guardian check — dropped, since the guardian-link check is already the real authorization boundary and the role clause only served to incidentally block a legitimate cross-role guardian. On the family app, `useRequireGuardianAccess()` (`apps/family/src/lib/useRequireRole.ts`, used by `/parent`, `/parent/[studentId]`, `/parent/announcements`, `/account`) replaced the old `useRequireRole(["parent"])` gate, which would otherwise redirect a non-`'parent'`-role account back to `/parent` in an infinite loop — it now just requires a session, since RLS scopes the data and the pages' existing "no children linked" empty state handles an account with none. `/driver` is untouched and stays strictly role-gated — driving is an operational capability, not a guardian one. A guardian linked this way gets only read-only parent-level visibility into that one child; nothing about their own admin/driver privileges changes.
