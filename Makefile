# ═══════════════════════════════════════════════════════════════════════════════
#  LinkedIn Post Generator API — Makefile
#  Production : VPS 84.247.160.53 — PM2 (no Docker on server)
#  Development: Docker Compose (API + Redis)
#  Domain     : https://impalia-server.a3s-securite.com
# ═══════════════════════════════════════════════════════════════════════════════

# ── Variables ──────────────────────────────────────────────────────────────────
APP_NAME   = impalia-api
VPS_HOST   = 84.247.160.53
VPS_USER   = amadou
VPS_DIR    = /home/amadou/impalia/api
DOMAIN     = impalia-server.a3s-securite.com

RED    = \033[0;31m
GREEN  = \033[0;32m
YELLOW = \033[1;33m
BLUE   = \033[0;34m
NC     = \033[0m

.PHONY: help
.PHONY: dev-up dev-down dev-restart dev-logs dev-shell dev-test
.PHONY: build lint test test-e2e
.PHONY: vps-setup vps-nginx vps-ssl vps-ssl-renew
.PHONY: ship vps-deploy vps-redeploy vps-app-restart vps-app-reload
.PHONY: vps-status vps-logs vps-health vps-tail
.PHONY: status clean
.DEFAULT_GOAL := help

# ─────────────────────────────────────────────────────────────────────────────
help: ## Show this help
	@echo "$(BLUE)════════════════════════════════════════════════════$(NC)"
	@echo "$(BLUE)       LinkedIn Post Generator API — Commands        $(NC)"
	@echo "$(BLUE)════════════════════════════════════════════════════$(NC)"
	@echo ""
	@echo "$(YELLOW)Development (Docker):$(NC)"
	@grep -E '^dev-[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-26s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(YELLOW)Local build & test:$(NC)"
	@grep -E '^(build|lint|test[a-zA-Z_-]*):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-26s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(YELLOW)VPS provisioning (run once):$(NC)"
	@grep -E '^vps-(setup|nginx|ssl)[a-zA-Z_-]*:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-26s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(YELLOW)VPS deployment:$(NC)"
	@grep -E '^(ship|vps-(deploy|redeploy|app-[a-zA-Z_-]+)):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-26s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(YELLOW)VPS monitoring:$(NC)"
	@grep -E '^vps-(status|logs|health|tail):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-26s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(YELLOW)Utilities:$(NC)"
	@grep -E '^(status|clean):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-26s$(NC) %s\n", $$1, $$2}'

# ═══════════════════════════════════════════════════════════════════════════════
#  DEVELOPMENT — Docker Compose (API hot-reload + Redis)
# ═══════════════════════════════════════════════════════════════════════════════

dev-up: ## Start the development environment (API + Redis)
	@echo "$(YELLOW)🚀 Starting dev environment...$(NC)"
	docker compose up -d
	@echo "$(GREEN)✅ Dev environment started$(NC)"
	@echo "  🌐 API:   http://localhost:3000/api/v1"
	@echo "  📖 Docs:  http://localhost:3000/docs"
	@echo "  🔴 Redis: localhost:6379"

dev-down: ## Stop the development environment
	docker compose down

dev-restart: ## Restart the development environment
	docker compose down
	docker compose up -d

dev-logs: ## Follow API logs (Docker)
	docker compose logs -f api

dev-shell: ## Open a shell in the API container
	docker compose exec api sh

dev-test: ## Run all tests inside Docker
	docker compose exec api pnpm test
	docker compose exec api pnpm test:e2e

# ═══════════════════════════════════════════════════════════════════════════════
#  LOCAL — build, lint, test (without Docker)
# ═══════════════════════════════════════════════════════════════════════════════

build: ## Compile TypeScript → dist/
	pnpm build

lint: ## Run ESLint
	pnpm lint

test: ## Run unit tests
	pnpm test --no-coverage

test-e2e: ## Run E2E tests
	pnpm test:e2e --no-coverage

# ═══════════════════════════════════════════════════════════════════════════════
#  VPS PROVISIONING — run once to prepare the server
#  Workflow: vps-setup → vps-nginx → vps-ssl → ship → vps-deploy
# ═══════════════════════════════════════════════════════════════════════════════

vps-setup: ## Install Node 24, pnpm, Redis, Nginx, PM2, Certbot on the VPS (run once)
	@echo "$(YELLOW)🔧 Provisioning VPS $(VPS_HOST)...$(NC)"
	@scp scripts/vps-setup.sh $(VPS_USER)@$(VPS_HOST):~/vps-setup.sh
	@ssh -t $(VPS_USER)@$(VPS_HOST) "bash ~/vps-setup.sh && rm ~/vps-setup.sh"
	@echo "$(GREEN)✅ VPS provisioned$(NC)"

vps-nginx: ## Deploy Nginx config for $(DOMAIN) and reload Nginx
	@echo "$(YELLOW)🌐 Installing Nginx config for $(DOMAIN)...$(NC)"
	@ssh $(VPS_USER)@$(VPS_HOST) "mkdir -p $(VPS_DIR)/nginx $(VPS_DIR)/scripts"
	@scp nginx/$(DOMAIN).conf          $(VPS_USER)@$(VPS_HOST):$(VPS_DIR)/nginx/$(DOMAIN).conf
	@scp scripts/vps-nginx-install.sh  $(VPS_USER)@$(VPS_HOST):$(VPS_DIR)/scripts/vps-nginx-install.sh
	@ssh -t $(VPS_USER)@$(VPS_HOST) "bash $(VPS_DIR)/scripts/vps-nginx-install.sh"
	@echo "$(GREEN)✅ Nginx configured for http://$(DOMAIN)$(NC)"

vps-ssl: ## Obtain Let's Encrypt SSL certificate for $(DOMAIN)
	@echo "$(YELLOW)🔒 Obtaining SSL certificate for $(DOMAIN)...$(NC)"
	@ssh -t $(VPS_USER)@$(VPS_HOST) "\
		sudo certbot --nginx -d $(DOMAIN) \
		  --non-interactive --agree-tos \
		  --email amadou@impalia.com \
		  --redirect \
		  --keep-until-expiring \
	"
	@ssh -t $(VPS_USER)@$(VPS_HOST) "bash $(VPS_DIR)/scripts/vps-nginx-install.sh"
	@echo "$(GREEN)✅ SSL enabled — https://$(DOMAIN)$(NC)"

vps-ssl-renew: ## Dry-run SSL certificate renewal
	@ssh $(VPS_USER)@$(VPS_HOST) "sudo certbot renew --dry-run"

# ═══════════════════════════════════════════════════════════════════════════════
#  VPS DEPLOYMENT
# ═══════════════════════════════════════════════════════════════════════════════

ship: ## Sync source code to the VPS via rsync (excludes node_modules, dist, .env)
	@echo "$(YELLOW)📦 Syncing code → $(VPS_USER)@$(VPS_HOST):$(VPS_DIR)...$(NC)"
	@ssh $(VPS_USER)@$(VPS_HOST) "mkdir -p $(VPS_DIR)/scripts $(VPS_DIR)/nginx"
	@rsync -az --delete \
		--exclude='.git/' \
		--exclude='node_modules/' \
		--exclude='dist/' \
		--exclude='logs/' \
		--exclude='*.log' \
		--exclude='.env' \
		--exclude='.env.development*' \
		--exclude='.env.test*' \
		--filter='protect .env.production' \
		$(PWD)/ $(VPS_USER)@$(VPS_HOST):$(VPS_DIR)/
	@echo "$(GREEN)✅ Code synced to $(VPS_USER)@$(VPS_HOST):$(VPS_DIR)$(NC)"

vps-deploy: ship ## Sync code + install deps + build + PM2 reload (full deploy)
	@echo "$(YELLOW)🚀 Deploying to VPS...$(NC)"
	@ssh -t $(VPS_USER)@$(VPS_HOST) "bash $(VPS_DIR)/scripts/vps-deploy.sh"
	@echo "$(GREEN)✅ Deployed → https://$(DOMAIN)$(NC)"

vps-redeploy: ## Build + PM2 reload on the VPS without re-syncing code
	@echo "$(YELLOW)🔄 Redeploying (no rsync)...$(NC)"
	@ssh -t $(VPS_USER)@$(VPS_HOST) "bash $(VPS_DIR)/scripts/vps-deploy.sh"
	@echo "$(GREEN)✅ Redeployed$(NC)"

vps-app-restart: ## Cold-restart the PM2 process (drops in-flight requests)
	@ssh $(VPS_USER)@$(VPS_HOST) "pm2 restart $(APP_NAME) --update-env && pm2 save"

vps-app-reload: ## Zero-downtime reload via PM2 cluster mode
	@ssh $(VPS_USER)@$(VPS_HOST) "pm2 reload $(APP_NAME) --update-env && pm2 save"

# ═══════════════════════════════════════════════════════════════════════════════
#  VPS MONITORING
# ═══════════════════════════════════════════════════════════════════════════════

vps-status: ## Show PM2 status + Redis + Nginx on the VPS
	@echo "$(YELLOW)🔍 VPS status ($(VPS_HOST))...$(NC)"
	@ssh $(VPS_USER)@$(VPS_HOST) " \
		echo '--- PM2 ---'     && pm2 list 2>/dev/null || echo '  PM2 not running' ; \
		echo '--- Redis ---'   && (systemctl is-active redis-server 2>/dev/null | grep -q active && echo '  Redis: active') || echo '  Redis: inactive' ; \
		echo '--- Nginx ---'   && (systemctl is-active nginx 2>/dev/null | grep -q active && echo '  Nginx: active') || echo '  Nginx: inactive' \
	"

vps-health: ## Check the API health endpoint on the VPS
	@echo "$(YELLOW)🏥 Health check...$(NC)"
	@ssh $(VPS_USER)@$(VPS_HOST) "curl -sf https://$(DOMAIN)/api/v1/health | python3 -m json.tool || echo FAIL"

vps-logs: ## Show the last 50 PM2 log lines from the VPS
	@ssh $(VPS_USER)@$(VPS_HOST) "pm2 logs $(APP_NAME) --lines 50 --nostream 2>&1"

vps-tail: ## Follow PM2 logs in real time on the VPS
	@ssh -t $(VPS_USER)@$(VPS_HOST) "pm2 logs $(APP_NAME) --lines 30"

# ═══════════════════════════════════════════════════════════════════════════════
#  UTILITIES
# ═══════════════════════════════════════════════════════════════════════════════

status: ## Local Docker container status
	@docker compose ps

clean: ## Remove unused Docker images and volumes
	@echo "$(YELLOW)🧹 Cleaning Docker...$(NC)"
	docker system prune -f
	docker image prune -f
	@echo "$(GREEN)✅ Done$(NC)"
