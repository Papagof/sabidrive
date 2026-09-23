#!/usr/bin/env bash
# Redeploy both apps on the VPS: pull latest main, reinstall, rebuild, and
# gracefully reload both pm2 processes (zero-downtime — pm2 reload starts
# the new process before stopping the old one). Run manually over SSH after
# every push to main; see deploy/README.md for first-time setup.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Pulling latest main"
git pull --ff-only origin main

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

echo "==> Building family"
pnpm --filter family build

echo "==> Building admin"
pnpm --filter admin build

echo "==> Reloading pm2 processes"
pm2 reload deploy/ecosystem.config.cjs

echo "==> Done. Status:"
pm2 status
