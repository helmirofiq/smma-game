# SMMA Kahoot-Style Game

Real-time game with:
- `MAIN_GAME_PAGE` at `/host`
- `AUDIENCE_PAGE` at `/audience`

## Features implemented
- Uses extracted JSON question bank with fields: `name`, `businessUnit`, `fact1`, `fact2`, `fictive`.
- Host page shows QR code for audience join URL.
- AI-style phase flow: selecting name -> question -> result -> leaderboard pause.
- Audience can join with their own display name.
- Per-round timed answers (default 30 seconds).
- Score formula: correct answer gets `10 x remaining_seconds`.
- Leaderboard updates each round.
- Configurable round count (default 10, max available from CSV).
- Final leaderboard with simple podium animation for top 1/2/3.

## Run
```bash
npm install
npm run build:data
npm start
```
Open:
- Host: [http://localhost:3000/host](http://localhost:3000/host)
- Audience: [http://localhost:3000/audience](http://localhost:3000/audience)

## CSV source path
Server checks CSV in this order:
1. `CSV_PATH` env var
2. `./data/responses.csv`
3. `/Users/helmi/Downloads/Order Form (Responses) - Form Responses 1.csv`

Example:
```bash
CSV_PATH="/absolute/path/your.csv" npm start
```

## Data stability
- Questions are now served from [data/questions.json](/Users/helmi/www/smma-game/data/questions.json) for stable gameplay.
- Build/update JSON from CSV:
```bash
npm run build:data
```
- The builder extracts only: `Nama`, `Business Unit`, `Fakta 1`, `Fakta 2`, `Fiktif 1`.

## Notes
- Host start button now waits for socket connection and shows explicit server response (started / error), so click feedback is visible.
- This project keeps game state in server memory (no database), suitable for one-time event sessions.

## Vercel
- Pure in-memory real-time multiplayer with Socket.IO is not reliable on Vercel serverless functions because instances are ephemeral.
- For Vercel deployment, use an external realtime broker (for example Ably or Pusher) while still keeping no database.
- If you want a single-process deployment without external services, deploy this exact app to Railway/Render/Fly instead of Vercel.
