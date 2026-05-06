#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  vps-setup.sh — First-time VPS provisioning
#  Installs: Node.js 24, pnpm, Redis, Nginx, PM2, Certbot
#  VPS: 84.247.160.53  |  Ubuntu 22.04 LTS
#
#  Run ONCE on the VPS:
#    bash scripts/vps-setup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

step() { echo -e "\n${YELLOW}▶ $*${NC}"; }
ok()   { echo -e "${GREEN}✅ $*${NC}"; }

# ── 1. System packages ────────────────────────────────────────────────────────
step "Updating system packages..."
sudo apt-get update -q
sudo apt-get install -y -q curl gnupg unzip git build-essential

# ── 2. Node.js 24 (NodeSource) ───────────────────────────────────────────────
step "Installing Node.js 24..."
if ! command -v node &>/dev/null || [[ "$(node -v)" != v24* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
ok "Node.js $(node -v)"

# ── 3. pnpm (via corepack) ────────────────────────────────────────────────────
step "Installing pnpm..."
sudo corepack enable
sudo corepack prepare pnpm@10.33.0 --activate
ok "pnpm $(pnpm -v)"

# ── 4. PM2 ───────────────────────────────────────────────────────────────────
step "Installing PM2..."
sudo npm install -g pm2
pm2 startup | tail -1 | sudo bash || true
ok "PM2 $(pm2 -v)"

# ── 5. Redis 7 ───────────────────────────────────────────────────────────────
step "Installing Redis..."
if ! command -v redis-server &>/dev/null; then
  sudo apt-get install -y redis-server
fi
sudo systemctl enable redis-server
sudo systemctl start redis-server
ok "Redis $(redis-server --version | awk '{print $3}')"

# ── 6. Nginx ─────────────────────────────────────────────────────────────────
step "Installing Nginx..."
if ! command -v nginx &>/dev/null; then
  sudo apt-get install -y nginx
fi
sudo systemctl enable nginx
sudo systemctl start nginx
ok "Nginx $(nginx -v 2>&1 | awk -F/ '{print $2}')"

# ── 7. Certbot (Let's Encrypt) ────────────────────────────────────────────────
step "Installing Certbot..."
if ! command -v certbot &>/dev/null; then
  sudo apt-get install -y certbot python3-certbot-nginx
fi
ok "Certbot $(certbot --version 2>&1)"

# ── 8. Application directory ─────────────────────────────────────────────────
step "Creating application directory..."
mkdir -p /home/amadou/impalia/api
mkdir -p /home/amadou/impalia/logs
ok "Directories created: /home/amadou/impalia/{api,logs}"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  VPS setup complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo "  Next steps:"
echo "  1. make ship          → sync code to VPS"
echo "  2. make vps-nginx     → install Nginx config"
echo "  3. make vps-ssl       → obtain SSL certificate"
echo "  4. make vps-deploy    → first deployment"
echo ""
