// pm2 process config for self-hosting both apps on one VPS. Each app's
// existing `start` script (apps/family/package.json, apps/admin/package.json)
// already runs `next start -p <port>` — this just runs that script under pm2
// with `cwd` set per app, no new scripts needed anywhere.
//
// Usage (from the repo root on the VPS):
//   pm2 start deploy/ecosystem.config.cjs
//   pm2 reload deploy/ecosystem.config.cjs   # zero-downtime redeploy
//   pm2 startup && pm2 save                  # persist across reboots
//
// See deploy/README.md for the full setup runbook.
module.exports = {
  apps: [
    {
      name: "sabidrive-family",
      cwd: "apps/family",
      script: "pnpm",
      args: "start",
      env: { NODE_ENV: "production" }
    },
    {
      name: "sabidrive-admin",
      cwd: "apps/admin",
      script: "pnpm",
      args: "start",
      env: { NODE_ENV: "production" }
    }
  ]
};
