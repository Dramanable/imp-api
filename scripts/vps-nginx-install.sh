#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  vps-nginx-install.sh — Deploy Nginx config + reload
#  Copies the site config, tests the config, and reloads Nginx.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="/home/amadou/impalia/api"
DOMAIN="impalia-server.a3s-securite.com"
NGINX_AVAILABLE="/etc/nginx/sites-available"
NGINX_ENABLED="/etc/nginx/sites-enabled"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

step() { echo -e "\n${YELLOW}▶ $*${NC}"; }
ok()   { echo -e "${GREEN}✅ $*${NC}"; }

# ── 1. Copy config ────────────────────────────────────────────────────────────
step "Installing Nginx config for $DOMAIN..."
sudo cp "$APP_DIR/nginx/$DOMAIN.conf" "$NGINX_AVAILABLE/$DOMAIN"

# ── 2. Enable site ────────────────────────────────────────────────────────────
step "Enabling site..."
sudo ln -sf "$NGINX_AVAILABLE/$DOMAIN" "$NGINX_ENABLED/$DOMAIN"

# ── 3. Remove default site if it exists ──────────────────────────────────────
if [ -f "$NGINX_ENABLED/default" ]; then
  sudo rm -f "$NGINX_ENABLED/default"
  ok "Default site removed"
fi

# ── 4. Test + reload ─────────────────────────────────────────────────────────
step "Testing Nginx configuration..."
sudo nginx -t

step "Reloading Nginx..."
sudo systemctl reload nginx
ok "Nginx reloaded — site active at http://$DOMAIN"
