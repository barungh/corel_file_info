#!/usr/bin/env bash
# ============================================================
#  CDR Analyzer — Oracle Cloud Deployment Script
#  Run as: bash deploy.sh
# ============================================================
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/YOUR_USERNAME/corel_file_info.git}"
APP_DIR="${APP_DIR:-/opt/cdr-analyzer}"
GREEN="\033[0;32m"; YELLOW="\033[1;33m"; NC="\033[0m"

log()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $*"; }

# ── 1. System prerequisites ───────────────────────────────────────────────────
log "Installing prerequisites..."
sudo apt-get update -y && sudo apt-get install -y git curl docker.io docker-compose-v2 iptables

sudo systemctl enable --now docker
sudo usermod -aG docker "$USER" || true

# ── 2. Clone / update repo ────────────────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
  log "Updating existing repo at $APP_DIR..."
  git -C "$APP_DIR" pull
else
  log "Cloning repo to $APP_DIR..."
  sudo git clone "$REPO_URL" "$APP_DIR"
  sudo chown -R "$USER:$USER" "$APP_DIR"
fi

cd "$APP_DIR"

# ── 3. Open firewall ports (Oracle Linux uses iptables) ───────────────────────
log "Opening ports 80 and 8000 in iptables..."

# Port 80 (HTTP for frontend)
sudo iptables -I INPUT -p tcp --dport 80  -j ACCEPT || warn "Port 80 rule may already exist"
# Port 8000 (FastAPI direct access / health checks)
sudo iptables -I INPUT -p tcp --dport 8000 -j ACCEPT || warn "Port 8000 rule may already exist"

# Persist rules across reboots
if command -v netfilter-persistent &>/dev/null; then
  sudo netfilter-persistent save
elif command -v iptables-save &>/dev/null; then
  sudo sh -c "iptables-save > /etc/iptables/rules.v4" || true
fi

warn "========================================================"
warn "IMPORTANT: Also open these ports in Oracle Cloud Console:"
warn "  Networking → VCN → Security List → Ingress Rules"
warn "  Add TCP port 80  (Source CIDR: 0.0.0.0/0)"
warn "  Add TCP port 8000 (Source CIDR: 0.0.0.0/0)"
warn "========================================================"

# ── 4. Start Ollama (if not already running on host) ──────────────────────────
if ! systemctl is-active --quiet ollama 2>/dev/null; then
  warn "Ollama is not running as a service."
  warn "Install it with: curl -fsSL https://ollama.com/install.sh | sh"
  warn "Then run:        ollama pull print-expert"
  warn "Continuing — backend will retry Ollama connections at request time."
fi

# ── 5. Build and start containers ─────────────────────────────────────────────
log "Building and starting containers..."
docker compose pull --ignore-pull-failures || true
docker compose up -d --build

log "Waiting for services to be healthy..."
sleep 5

# ── 6. Health check ───────────────────────────────────────────────────────────
BACKEND_HEALTH=$(curl -sf http://localhost:8000/ | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null || echo "unreachable")
log "Backend status: $BACKEND_HEALTH"

PUBLIC_IP=$(curl -sf https://ifconfig.me || echo "unknown")

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  CDR Analyzer is live!${NC}"
echo -e "${GREEN}  Frontend : http://${PUBLIC_IP}${NC}"
echo -e "${GREEN}  Backend  : http://${PUBLIC_IP}:8000/docs${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
