# Deploy to Railway

## One-time setup
1. Open Railway dashboard.
2. Click `New Project` -> `Deploy from GitHub repo`.
3. Select: `helmirofiq/smma-game`.
4. Ensure service has **1 replica only** (important, game state is in-memory).

## Config
Railway uses `railway.json` in repo:
- Build command: `npm install && npm run build:data`
- Start command: `npm start`

## Environment variables
Set in Railway service variables:
- `NODE_ENV=production`

Optional:
- `CSV_PATH` only if you want to rebuild from a custom CSV path in runtime.

## Run and test
After deploy is successful:
- Host page: `https://<your-railway-domain>/host`
- Audience page: `https://<your-railway-domain>/audience`

## Important
- Keep this service on a single instance (`Replicas = 1`).
- Use the Host page `Restart Session` button between rounds/events.
