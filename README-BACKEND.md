# Instagram Bot Backend - Deploy on Render

## Setup

1. Create a new **Web Service** on [render.com](https://render.com)
2. Upload these files: `server.js`, `package.json`
3. Set Build Command: `npm install`
4. Set Start Command: `npm start`
5. Add Environment Variables:
   - `IG_USERNAME` - Your Instagram username
   - `IG_PASSWORD` - Your Instagram password
   - `PORT` - (optional, Render sets this automatically)

## Connect Frontend

1. Copy your Render service URL (e.g. `https://ig-bot-xxxx.onrender.com`)
2. Paste it in the Dashboard → Backend Connection field
3. Click Login with your SESSION_ID
4. Click Start Bot

## API Endpoints

- `GET /` - Health check
- `GET /status` - Bot status
- `POST /login` - Login with SESSION_ID
- `POST /start` - Start bot
- `POST /stop` - Stop bot
- `GET /logs` - Get logs
- `GET /leaderboard` - Get leaderboard
- `GET/POST /features` - Manage features
- `GET/POST /messages` - Manage message templates
- `GET/POST/DELETE /admins` - Manage admins
