#!/usr/bin/env bash
# Deploy workflow for this backend: pull latest code, install/build, then
# restart the pm2 process ("prodhouse") so the new build actually goes live.
#
# Setup (run once):
#   chmod +x scripts/deploy.sh
#
# Usage (from the server, inside the backend directory):
#   ./scripts/deploy.sh
#
# What it does, in order:
#   1. git pull -- pulls whatever's been pushed to this branch.
#   2. npm ci -- clean install from package-lock.json (faster + safer than
#      `npm install` for deploys -- fails loudly if lockfile is out of sync
#      instead of silently changing it).
#   3. npm run build -- compiles to dist/.
#   4. pm2 restart prodhouse -- picks up the new dist/ build. Falls back to
#      `pm2 start` if the process isn't already running under that name yet
#      (first deploy on a fresh server).

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PM2_NAME="${PM2_NAME:-prodhouse}"

cd "$APP_DIR"

echo "[$(date)] Pulling latest code..."
git pull

echo "[$(date)] Installing dependencies..."
npm ci

echo "[$(date)] Building..."
npm run build

echo "[$(date)] Restarting pm2 process '$PM2_NAME'..."
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME"
else
  echo "[$(date)] '$PM2_NAME' not running under pm2 yet -- starting it."
  pm2 start dist/main.js --name "$PM2_NAME"
fi

echo "[$(date)] Deploy done."
