# Self-hosting SabiDrive on a Hostinger VPS

Runbook for moving both apps off Vercel onto one Ubuntu 22.04/24.04 VPS, replacing Vercel's auto-deploy/HTTPS/env-var management with: Node 22 + pnpm (pinned to the exact version in `package.json`), pm2 as the process manager, nginx as the reverse proxy, and certbot for TLS. No Docker — unnecessary for two small Next.js apps with no scaling need.

Run every command yourself over your own SSH session — nothing here runs automatically. Do the phases **in order**; skipping ahead (especially pushing the URL-rename commit in Phase 8 before Phase 6 is confirmed working) will break invite/password-reset links for real users on the still-live Vercel deployment.

## Prerequisites

- A Hostinger VPS (Ubuntu 22.04 or 24.04), with its public IPv4 address and root/sudo SSH access.
- `sabidrive.com` registered at Hostinger, with access to its DNS zone.
- This repo cloneable from the VPS — either it's public, or you have a deploy key / personal access token ready (`ssh-keygen`, add the public key as a GitHub deploy key on `Papagof/sabidrive`, or use an HTTPS remote with a token).
- Every environment variable currently set in the `family` and `admin` Vercel projects' Production scope (Vercel dashboard → each project → Settings → Environment Variables) — copy the actual current values from there, not from CLAUDE.md's documentation of them, since they may have drifted.

## Phase 1 — VPS base setup

SSH in as root (or a sudo-capable user), then:

```bash
# System packages
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx ufw

# Node 22.x (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # confirm v22.x

# corepack + the exact pnpm version this repo pins (package.json's
# "packageManager" field) -- avoids the version-mismatch error a mismatched
# global pnpm would otherwise hit
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm -v   # confirm 9.15.0

# pm2, global
sudo npm install -g pm2

# certbot (nginx plugin)
sudo apt install -y certbot python3-certbot-nginx

# Firewall -- allow SSH, HTTP, HTTPS only
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# A dedicated, non-root user to own the app and run pm2
sudo adduser --disabled-password --gecos "" sabidrive
sudo usermod -aG sudo sabidrive   # optional, only if you want it to sudo too
```

From here on, run commands **as the `sabidrive` user** (`sudo -iu sabidrive` or a fresh SSH login as `sabidrive`), except where marked `sudo` for nginx/system-level steps.

## Phase 2 — Repo config (already committed)

This repo already has `deploy/ecosystem.config.cjs` (pm2), `deploy/nginx/sabidrive.conf` (nginx), and `deploy/deploy.sh` (redeploy script) — nothing to create, just use them below.

## Phase 3 — Clone, configure, build, verify locally

As the `sabidrive` user:

```bash
git clone <your-remote-url> ~/sabidrive
cd ~/sabidrive
pnpm install
```

Create `apps/family/.env.local` and `apps/admin/.env.local`, each populated with every value from the matching Vercel project's Production environment variables (see Prerequisites above). `NEXT_PUBLIC_*` vars must be present now, since Next.js inlines them into the client bundle at build time.

```bash
pnpm --filter family build
pnpm --filter admin build

# Sanity check both apps run standalone before wiring up nginx/pm2
pnpm --filter family start &   # port 3000
pnpm --filter admin start &    # port 3001
sleep 3
curl -I http://localhost:3000   # expect HTTP/1.1 200
curl -I http://localhost:3001   # expect HTTP/1.1 200
kill %1 %2   # stop both background processes, pm2 takes over next
```

## Phase 4 — nginx + DNS cutover

```bash
sudo cp ~/sabidrive/deploy/nginx/sabidrive.conf /etc/nginx/sites-available/sabidrive.conf
sudo ln -s /etc/nginx/sites-available/sabidrive.conf /etc/nginx/sites-enabled/
# If a "default" site is still enabled and conflicts, remove it:
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Then in Hostinger's DNS panel for `sabidrive.com`, point these at the VPS's IPv4 (replacing whatever pointed at Vercel before — delete the old records rather than leaving both, to avoid an ambiguous/flapping resolution):

| Type | Name | Value |
|---|---|---|
| A | `@` (bare domain) | `<your VPS IPv4>` |
| A | `www` | `<your VPS IPv4>` |
| A | `family` | `<your VPS IPv4>` |
| A | `admin` | `<your VPS IPv4>` |

Wait for propagation (`dig +short family.sabidrive.com` from your own machine should return the VPS IP), then confirm:

```bash
curl -I http://family.sabidrive.com   # from any machine, not just the VPS
curl -I http://admin.sabidrive.com
```

## Phase 5 — TLS

Only once Phase 4's `curl` checks succeed (Let's Encrypt validates via a real HTTP request to these hostnames):

```bash
sudo certbot --nginx -d sabidrive.com -d www.sabidrive.com -d family.sabidrive.com -d admin.sabidrive.com
```

certbot rewrites `/etc/nginx/sites-available/sabidrive.conf` in place to add HTTPS server blocks and HTTP→HTTPS redirects, and installs its own renewal timer (`sudo systemctl status certbot.timer` to confirm it's active).

## Phase 6 — pm2

```bash
cd ~/sabidrive
pm2 start deploy/ecosystem.config.cjs
pm2 status   # both sabidrive-family and sabidrive-admin should show "online"
pm2 startup  # prints a sudo command -- run exactly what it prints
pm2 save
```

Verify end to end:

```bash
curl -I https://sabidrive.com
curl -I https://family.sabidrive.com
curl -I https://admin.sabidrive.com
```

All three should return `200` with a valid cert (no `-k` needed).

## Phase 7 — External dashboards (manual, do these yourself)

- **Supabase**: Dashboard → Authentication → URL Configuration → Redirect URLs → add `https://family.sabidrive.com/set-password`.
- **Paystack**: if you haven't already registered a webhook for the billing feature, set it to `https://admin.sabidrive.com/api/billing/webhook` directly (no need for an interim Vercel URL).

## Phase 8 — The URL-rename commit

Once Phases 4–7 are all confirmed working, tell me (Claude) to proceed — I'll update the four hardcoded `*.vercel.app` references (`apps/family/src/app/login/page.tsx`, `apps/family/src/app/set-password/page.tsx`, `apps/admin/src/app/login/page.tsx`, plus `.env.example`'s comment) to the new hostnames and push. You'll also need to update `apps/admin/.env.local`'s `FAMILY_APP_URL` on the VPS to `https://family.sabidrive.com` (env var, not code — not touched by the push).

After the push lands:

```bash
cd ~/sabidrive
./deploy/deploy.sh
```

## Phase 9 — Native app (separate, not urgent)

`apps/family-native/capacitor.config.ts`'s `server.url` still points at the old Vercel URL — update it to `https://family.sabidrive.com` and rebuild the APK (`cd apps/family-native/android && ./gradlew.bat assembleDebug`, or `bundleRelease` for a Play Store update). Unlike the web apps, an already-installed native app won't pick this up until it's reinstalled/updated — no rush unless the Vercel deployment is being removed on a specific timeline.

## Phase 10 — Decommission Vercel

Once everything above is verified: remove the custom domains from (or delete) both Vercel projects in the Vercel dashboard. `sabidrive.com` should keep resolving and serving correctly afterward — that's the proof nginx/pm2 on this VPS are now the only thing serving it.

## Ongoing deploys

For every future push to `main`, SSH in as `sabidrive` and run:

```bash
cd ~/sabidrive && ./deploy/deploy.sh
```

No auto-deploy-on-push is set up in this version (Vercel's git integration doesn't carry over) — a small webhook receiver or a polling cron job would be a reasonable later addition if manual redeploys become annoying.
