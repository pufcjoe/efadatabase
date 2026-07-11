# EFA — Database API + Website Panel

Replaces the old ARFA API + Discord bot. Two apps:

- **`api/`** — Node/Express backend. Serves the Roblox game (same `GET /data/:userId` + `POST /submit/data` shape as ARFA) and the website panel (OAuth sessions, role-gated edits, audit log).
- **`panel/`** — React/Vite website. Players and staff sign in with Roblox (or a linked Discord) to view and edit.

## Player fields

`user_id`, `username`, `country`, `team`, `has_stadium_pass`, `is_banned`, `is_staff`, `is_board`, `is_developer`, `is_owner`, `is_manager` — plus `discord_id` for Discord login.

## Permission model

Rank: **owner > board > developer > staff > Manager > player**. You can never edit someone of equal or higher rank. Every panel write hits the audit log.

| Field | Who can edit |
|---|---|
| country | self, staff+ |
| team | staff+; Managers can sign to / release from their own team |
| has_stadium_pass | developer, board, owner |
| is_banned (+ ban/unban) | staff, board, owner |
| is_manager, is_staff | board, owner |
| is_developer, is_board, is_owner | owner only |

The **game can never write roles** — `POST /submit/data` only accepts `robloxId`, `username`, `country`. An owner can't remove their own owner flag (lockout guard).

## Setup

### 1. Database (Supabase)
Create a project, open the SQL Editor, run `api/src/database/migrate.sql`.
Then seed yourself as owner:
```sql
INSERT INTO players (user_id, username, is_owner) VALUES (YOUR_ROBLOX_USERID, 'yourname', true);
```

### 2. Roblox OAuth app
[create.roblox.com](https://create.roblox.com) → Credentials → OAuth 2.0 → new app.
Scopes: `openid`, `profile`. Redirect URI: `https://<your-api>/auth/roblox/callback`.

### 3. Discord OAuth app
[discord.com/developers](https://discord.com/developers) → New Application → OAuth2.
Redirect URI: `https://<your-api>/auth/discord/callback`. Scope used: `identify`.

### 4. API
```bash
cd api
cp .env.example .env   # fill everything in
npm install
npm run dev
```

### 5. Panel
```bash
cd panel
cp .env.example .env   # VITE_API_URL = your API URL
npm install
npm run dev
```

### 6. Roblox game
Use `api/EFA_ROBLOX_MIGRATION.lua` — enable HTTP requests in game settings and set `API_URL` / `API_KEY`.

## Deploying (single domain — recommended)

One service hosts both: Express serves the built panel from `panel/dist` whenever it exists, so the game API, panel API, and website all live on one URL. No CORS, no cookie domain issues.

On Render/Railway, point the service at the repo root and use:

- **Build command:** `cd panel && npm ci && npm run build && cd ../api && npm ci`
- **Start command:** `node api/src/index.js`
- **Env vars:** everything from `api/.env.example` EXCEPT `PANEL_URL` — leave it unset in single-domain mode. Set `NODE_ENV=production` so the session cookie is Secure.
- OAuth redirect URIs (Roblox + Discord apps) point at this one domain: `https://<domain>/auth/roblox/callback` etc.
- Roblox `API_URL` in the game script is the same domain too.

`GET /health` is the health-check route (also handy as an uptime-monitor ping target if you're on a free tier that sleeps).

### Local dev
Run `npm run dev` in both `api/` and `panel/` — the Vite dev server proxies API paths to `localhost:3000`, so dev is same-origin too. No env needed beyond `api/.env`.

### Split hosting (optional)
If you ever want the panel on Vercel/Netlify separately: set `VITE_API_URL` in the panel env, set `PANEL_URL` in the API env (enables CORS + absolute login redirects), and either use subdomains of one domain or switch the session cookie to `sameSite: 'none'`.

## How Discord login works

Discord can't prove which Roblox account you own, so it's a *linked* login:
1. Sign in with Roblox once.
2. On your profile, hit **Link** next to Discord.
3. From then on, "Sign in with Discord" works directly.
