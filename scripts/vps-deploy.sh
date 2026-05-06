#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  vps-deploy.sh — Build + PM2 reload
#  Runs on the VPS after code has been synced via rsync (make ship).
#
#  Steps:
#   1. Install production dependencies
#   2. Compile TypeScript
#   3. Reload PM2 (zero-downtime via cluster mode) or start fresh
#   4. Persist PM2 process list
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="/home/amadou/impalia/api"
APP_NAME="impalia-api"
LOG_DIR="/home/amadou/impalia/logs"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

step() { echo -e "\n${YELLOW}▶ $*${NC}"; }
ok()   { echo -e "${GREEN}✅ $*${NC}"; }
err()  { echo -e "${RED}❌ $*${NC}"; exit 1; }

cd "$APP_DIR" || err "Directory $APP_DIR not found. Run make vps-setup first."

# ── 0. Pre-flight: verify OPENAI_API_KEY is available ────────────────────────
step "Pre-flight checks..."
# The key may come from .env or from the calling environment.
if [ -z "${OPENAI_API_KEY:-}" ]; then
  if [ -f "$APP_DIR/.env" ] && grep -q '^OPENAI_API_KEY=' "$APP_DIR/.env"; then
    export OPENAI_API_KEY
    OPENAI_API_KEY=$(grep '^OPENAI_API_KEY=' "$APP_DIR/.env" | cut -d= -f2-)
    ok "OPENAI_API_KEY loaded from .env"
  else
    err "OPENAI_API_KEY is not set and not found in $APP_DIR/.env.\n   Create $APP_DIR/.env with OPENAI_API_KEY=sk-... before deploying."
  fi
else
  ok "OPENAI_API_KEY present in environment"
fi
step "Installing dependencies..."
pnpm install --frozen-lockfile --prod=false
ok "Dependencies installed"

# ── 2. Build ──────────────────────────────────────────────────────────────────
step "Building TypeScript..."
pnpm build
ok "Build complete → dist/"

# ── 3. Install prod-only deps to trim node_modules ───────────────────────────
step "Pruning dev dependencies..."
pnpm prune --prod
ok "Dev dependencies pruned"

# ── 4. PM2 reload / start ────────────────────────────────────────────────────
step "Starting / reloading PM2..."
mkdir -p "$LOG_DIR"

if pm2 describe "$APP_NAME" &>/dev/null; then
  pm2 reload "$APP_NAME" --update-env
  ok "PM2 reloaded (zero-downtime)"
else
  pm2 start ecosystem.vps.json --env production
  ok "PM2 started"
fi

pm2 save
ok "PM2 process list saved"

# ── 5. Health check ───────────────────────────────────────────────────────────
step "Health check..."
sleep 3
if curl -sf http://127.0.0.1:3000/api/v1/health > /dev/null; then
  ok "API is healthy at http://127.0.0.1:3000/api/v1/health"
else
  echo -e "${YELLOW}⚠️  Health check failed — check logs:${NC}"
  pm2 logs "$APP_NAME" --lines 20 --nostream
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deployment complete!${NC}"
echo -e "${GREEN}  https://impalia-server.a3s-securite.com/api/v1${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
