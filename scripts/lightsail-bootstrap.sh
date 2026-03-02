#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/smma-game"
REPO_DIR="${1:-$PWD}"
CSV_PATH_DEFAULT="/home/ubuntu/Order Form (Responses) - Form Responses 1.csv"

echo "[1/7] Installing system packages..."
sudo apt-get update -y
sudo apt-get install -y nginx curl git build-essential

echo "[2/7] Installing Node.js 20 + PM2..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo npm install -g pm2

echo "[3/7] Syncing app to ${APP_DIR}..."
sudo mkdir -p /var/www
sudo rsync -a --delete --exclude node_modules --exclude .git "${REPO_DIR}/" "${APP_DIR}/"
sudo chown -R "$USER":"$USER" "${APP_DIR}"

cd "${APP_DIR}"

echo "[4/7] Installing dependencies..."
npm ci || npm install

echo "[5/7] Building question JSON..."
if [[ -f "$CSV_PATH_DEFAULT" ]]; then
  CSV_PATH="$CSV_PATH_DEFAULT" npm run build:data
else
  npm run build:data
fi

echo "[6/7] Starting app with PM2..."
pm2 start ecosystem.config.cjs --env production
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u "$USER" --hp "$HOME" | tail -n 1 | bash || true

echo "[7/7] Configuring Nginx reverse proxy..."
sudo cp deploy/lightsail/nginx-smmagame.conf /etc/nginx/sites-available/smma-game
sudo ln -sf /etc/nginx/sites-available/smma-game /etc/nginx/sites-enabled/smma-game
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

echo "Done. App should be reachable at: http://$(curl -s ifconfig.me)"
