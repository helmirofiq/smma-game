# Deploy to AWS Lightsail

## 1) Create instance
- Blueprint: Ubuntu 22.04 LTS
- Plan: at least 1 GB RAM for event usage
- Open Lightsail networking ports: `22`, `80`, `443`

## 2) SSH into server
```bash
ssh ubuntu@<LIGHTSAIL_PUBLIC_IP>
```

## 3) Upload project
Option A (git clone):
```bash
sudo mkdir -p /var/www && sudo chown -R ubuntu:ubuntu /var/www
cd /var/www
git clone <YOUR_REPO_URL> smma-game
cd smma-game
```

Option B (scp from local):
```bash
scp -r /Users/helmi/www/smma-game ubuntu@<LIGHTSAIL_PUBLIC_IP>:/home/ubuntu/
ssh ubuntu@<LIGHTSAIL_PUBLIC_IP>
cd /home/ubuntu/smma-game
```

## 4) Put CSV on server (optional if already inside repo)
Copy your latest CSV to:
```bash
/home/ubuntu/Order Form (Responses) - Form Responses 1.csv
```

## 5) Run bootstrap
```bash
cd /var/www/smma-game
./scripts/lightsail-bootstrap.sh /var/www/smma-game
```

This will:
- install Node.js + PM2 + Nginx
- install app dependencies
- build `data/questions.json`
- start app on PM2
- setup Nginx reverse proxy for Socket.IO

## 6) Verify app
```bash
pm2 status
curl -I http://127.0.0.1:3000
curl -I http://<LIGHTSAIL_PUBLIC_IP>
```

## 7) Add HTTPS (recommended)
Point your domain DNS A record to Lightsail public IP, then:
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <YOUR_DOMAIN>
```

## Update deploy later
```bash
cd /var/www/smma-game
git pull
npm ci || npm install
npm run build:data
pm2 restart smma-game
```

## Useful logs
```bash
pm2 logs smma-game
sudo tail -f /var/log/nginx/error.log
```
