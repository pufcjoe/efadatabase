const jwt = require('jsonwebtoken');
const { supabase } = require('../database/db');

const COOKIE_NAME = 'efa_session';

function issueSession(res, userId) {
    const token = jwt.sign({ uid: String(userId) }, process.env.JWT_SECRET, { expiresIn: '7d' });
    // Split hosting (PANEL_URL set, e.g. panel on Vercel + API on Render/Railway)
    // is cross-site, so the cookie needs SameSite=None; Secure.
    const crossSite = !!process.env.PANEL_URL && process.env.NODE_ENV === 'production';
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: crossSite || process.env.NODE_ENV === 'production',
        sameSite: crossSite ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
}

function clearSession(res) {
    res.clearCookie(COOKIE_NAME);
}

// Attaches req.player (fresh row from DB, so role changes apply instantly)
async function requireAuth(req, res, next) {
    try {
        const token = req.cookies[COOKIE_NAME];
        if (!token) return res.status(401).json({ error: 'Not logged in' });

        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const { data, error } = await supabase
            .from('players')
            .select('*')
            .eq('user_id', payload.uid)
            .single();

        if (error || !data) return res.status(401).json({ error: 'Session player not found' });
        if (data.is_banned) return res.status(403).json({ error: 'You are banned' });

        req.player = data;
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid or expired session' });
    }
}

module.exports = { issueSession, clearSession, requireAuth, COOKIE_NAME };
