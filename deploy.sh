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

# ── 1. Install Docker (from official repo, conflict-safe) ────────────────────
install_docker() {
  log "Installing Docker from official repo..."

  # Remove conflicting packages (docker.io ships its own containerd which
  # conflicts with containerd.io from Docker's official repo)
  for pkg in docker.io docker-doc docker-compose docker-compose-v2 \
              podman-docker containerd runc; do
    sudo apt-get remove -y "$pkg" 2>/dev/null || true
  done

  # Add Docker's official GPG key and repo
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
    https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

  sudo apt-get update -y
  sudo apt-get install -y \
    docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin

  sudo systemctl enable --now docker
  sudo usermod -aG docker "$USER" || true
  log "Docker installed: $(docker --version)"
}

# Only install Docker if it's not already present
if ! command -v docker &>/dev/null; then
  install_docker
else
  log "Docker already installed: $(docker --version)"
  # Ensure the compose plugin is available (may be missing on older installs)
  if ! docker compose version &>/dev/null; then
    log "Installing docker-compose-plugin..."
    sudo apt-get install -y docker-compose-plugin
  fi
fi

# ── 2. Other prerequisites ────────────────────────────────────────────────────
log "Installing prerequisites..."
sudo apt-get install -y git curl iptables

# ── 3. Clone / update repo ────────────────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
  log "Updating existing repo at $APP_DIR..."
  git -C "$APP_DIR" pull
else
  log "Cloning repo to $APP_DIR..."
  sudo git clone "$REPO_URL" "$APP_DIR"
  sudo chown -R "$USER:$USER" "$APP_DIR"
fi

cd "$APP_DIR"

# ── 4. Open firewall ports (Oracle Linux uses iptables) ───────────────────────
log "Opening ports 80 and 8000 in iptables..."

sudo iptables -I INPUT -p tcp --dport 80  -j ACCEPT 2>/dev/null || warn "Port 80 may already be open"
sudo iptables -I INPUT -p tcp --dport 8000 -j ACCEPT 2>/dev/null || warn "Port 8000 may already be open"

# Persist iptables rules
if command -v netfilter-persistent &>/dev/null; then
  sudo netfilter-persistent save
else
  sudo mkdir -p /etc/iptables
  sudo sh -c "iptables-save > /etc/iptables/rules.v4" || true
fi

warn "========================================================"
warn "ACTION REQUIRED: Open ports in Oracle Cloud Console:"
warn "  Networking → VCN → Security List → Ingress Rules"
warn "  Add TCP port 80  (Source CIDR: 0.0.0.0/0)"
warn "  Add TCP port 8000 (Source CIDR: 0.0.0.0/0)"
warn "========================================================"

# ── 5. Ollama check ───────────────────────────────────────────────────────────
if ! systemctl is-active --quiet ollama 2>/dev/null; then
  warn "Ollama is not running. Install it with:"
  warn "  curl -fsSL https://ollama.com/install.sh | sh"
  warn "  ollama pull print-expert"
  warn "Backend will return 503 until Ollama is available."
fi

# ── 6. Build and start containers ─────────────────────────────────────────────
log "Building and starting containers..."
docker compose up -d --build

log "Waiting for services to stabilize..."
sleep 6

# ── 7. Health check ───────────────────────────────────────────────────────────
BACKEND_STATUS=$(curl -sf http://localhost:8000/ \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" \
  2>/dev/null || echo "unreachable")
log "Backend status: $BACKEND_STATUS"

PUBLIC_IP=$(curl -sf --max-time 5 https://ifconfig.me || echo "<your-oracle-public-ip>")

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  CDR Analyzer is live!${NC}"
echo -e "${GREEN}  Frontend : http://${PUBLIC_IP}${NC}"
echo -e "${GREEN}  Backend  : http://${PUBLIC_IP}:8000/docs${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
