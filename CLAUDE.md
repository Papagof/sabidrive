# Tripme

School bus tracking + child safety app. Full product spec: [SPEC.md](SPEC.md). Build plan and Phase 1/2 scope cut line: see the plan this repo was built from (ask the user if it's not in your context — it lays out what's deliberately deferred).

## Architecture

Two separate Next.js 14 (App Router, TypeScript) web apps sharing one Supabase backend:

- **`apps/family`** — parent + driver (+ stubbed student) roles. Installable PWA (`@ducanh2912/next-pwa`).
- **`apps/admin`** — school admin / transport coordinator. Plain web app, no PWA.
- **`packages/ui`** — shared components (`Button`, `Card`, `StatusPill`, `Banner`, `TripMap`/`FleetMap`/`ClickToAddMap`) and the calm-palette design tokens (`src/tokens/colors.ts`).
- **`packages/supabase`** — browser/server Supabase client factories, a `SupabaseProvider` context, realtime hooks (`useSession`, `useTripLocation`, `useNotifications`, `useFleetTrips`), and typed query/RPC wrappers under `src/queries/`.
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

- Provisioned via the Supabase MCP tools (`mcp__claude_ai_Supabase__*`), not the CLI.
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` go in `.env.local` in **both** `apps/family` and `apps/admin` (public, safe in the browser).
- `SUPABASE_SERVICE_ROLE_KEY` goes only in a root-level `.env.local` (read by `scripts/seed.ts` and `packages/gps-sim/src/run-local.ts`). Never import it into browser code.
- After any migration change, regenerate `packages/supabase/src/types.gen.ts` via the `generate_typescript_types` MCP tool and re-run `get_advisors` as a security/perf gate.

## Data model & RLS mental model

Tables and relationships are documented top-to-bottom in `supabase/migrations/0002_core_schema.sql`. The access-control shape (`0003_rls_policies.sql`):

- **Parent**: read-only, scoped to their children via `guardian_student_links`, plus their own `notifications`, plus the name/phone of the driver currently driving one of their children's buses.
- **Driver**: scoped to their assigned bus/route/stops/roster; can only act on a trip they own while it's `in_progress`.
- **Admin**: full CRUD scoped to `school_id`.
- **Cross-role writes never happen via raw client inserts.** Anything that fans out to *other* users' rows (notifications, alerts, check-ins, trip lifecycle) goes through `SECURITY DEFINER` RPCs — `start_trip` / `end_trip` / `check_in` in `0004_functions_rpc.sql` — which re-validate `auth.uid()` internally. The one exception is `packages/gps-sim`, a trusted service-role process that writes `trip_locations`/`trip_stop_etas`/alerts directly.

If you add a new cross-role write path, follow that RPC pattern rather than loosening an RLS policy.

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
- SMS/CCTV/background-check integrations: not built; see the build plan for what Phase 2 adds.

## Phase 1 scope

Auth + 3 roles (admin, driver, parent), live simulated tracking, QR check-in/out with parent notifications, parent live dashboard + notification timeline, admin fleet map + route/stop/bus/student management + attendance reconciliation. Single school assumed. Explicitly deferred: chat/announcements, real Web Push, SMS-fallback UI, speed/harsh-braking alerts, two-factor pickup authorization, incident-log triage workflow, multi-language, CCTV UI, driver background-check display, data-retention jobs, multi-school support.
