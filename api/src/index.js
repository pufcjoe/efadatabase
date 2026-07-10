require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const gameRoutes = require('./routes/game');
const authRoutes = require('./routes/auth');
const panelRoutes = require('./routes/panel');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1); // Render/behind-proxy: correct IPs for rate limiting

app.use(helmet());

// CORS is only needed when the panel is served from a DIFFERENT origin
// (e.g. Vite dev server, or a separately hosted panel). Same-domain
// deploys don't hit this path at all.
if (process.env.PANEL_URL) {
    app.use(cors({ origin: process.env.PANEL_URL, credentials: true }));
}

app.use(express.json());
app.use(cookieParser());

app.use(rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    message: { error: 'Too many requests, slow down.' }
}));

// Health check
app.get('/health', (req, res) => res.json({ status: 'online', service: 'EFA API', version: '1.0.0' }));

// Roblox game routes (API-key gated per route inside game.js)
app.use('/', gameRoutes);

// Website panel (OAuth session cookie)
app.use('/auth', authRoutes);
app.use('/panel', panelRoutes);

// =============================================
// SINGLE-DOMAIN MODE
// If the panel has been built (panel/dist exists), serve it from
// this same server — one domain, no CORS, cookies just work.
// =============================================
const DIST = path.join(__dirname, '..', '..', 'panel', 'dist');
if (fs.existsSync(DIST)) {
    app.use(express.static(DIST));
    // SPA fallback: anything not matched above gets index.html
    app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html')));
    console.log('[EFA] Serving panel from', DIST);
} else {
    app.get('/', (req, res) => res.json({ status: 'online', service: 'EFA API', version: '1.0.0' }));
}

app.listen(PORT, () => console.log(`[EFA] API running on port ${PORT}`));
