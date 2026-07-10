// ============================================================
// Auth — "Sign in with Roblox" (primary) and Discord (linked)
// ============================================================
// Roblox OAuth is the identity source: it proves the visitor owns
// that Roblox account, so permissions come straight off their DB row.
// Discord login only works after the account has been linked
// (log in with Roblox once → "Link Discord" on your profile).

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { supabase } = require('../database/db');
const { issueSession, clearSession, requireAuth } = require('../middleware/session');
const { roleOf } = require('../lib/permissions');

const ROBLOX_AUTH = 'https://apis.roblox.com/oauth/v1/authorize';
const ROBLOX_TOKEN = 'https://apis.roblox.com/oauth/v1/token';
const ROBLOX_USERINFO = 'https://apis.roblox.com/oauth/v1/userinfo';

const DISCORD_AUTH = 'https://discord.com/oauth2/authorize';
const DISCORD_TOKEN = 'https://discord.com/api/oauth2/token';
const DISCORD_ME = 'https://discord.com/api/users/@me';

// Empty default = relative redirects, i.e. the panel lives on THIS domain.
// Set PANEL_URL only when the panel is hosted separately (or for Vite dev).
const PANEL_URL = () => process.env.PANEL_URL || '';

// ---- helpers ------------------------------------------------

function b64url(buf) {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function setStateCookie(res, name, value) {
    res.cookie(name, value, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000 });
}

async function upsertRobloxPlayer(userId, username) {
    // Never touches role fields — new players get schema defaults,
    // existing players only get their username refreshed.
    const { data: existing } = await supabase
        .from('players').select('user_id').eq('user_id', userId).maybeSingle();

    if (existing) {
        await supabase.from('players').update({ username }).eq('user_id', userId);
    } else {
        await supabase.from('players').insert({ user_id: userId, username });
    }
}

// ---- Roblox login -------------------------------------------

router.get('/roblox', (req, res) => {
    const state = b64url(crypto.randomBytes(16));
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());

    setStateCookie(res, 'efa_oauth_state', state);
    setStateCookie(res, 'efa_pkce', verifier);

    const params = new URLSearchParams({
        client_id: process.env.ROBLOX_CLIENT_ID,
        redirect_uri: process.env.ROBLOX_REDIRECT_URI,
        response_type: 'code',
        scope: 'openid profile',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256'
    });
    res.redirect(`${ROBLOX_AUTH}?${params}`);
});

router.get('/roblox/callback', async (req, res) => {
    try {
        const { code, state } = req.query;
        if (!code || state !== req.cookies.efa_oauth_state) {
            return res.redirect(`${PANEL_URL()}/login?error=state`);
        }

        const tokenRes = await fetch(ROBLOX_TOKEN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: process.env.ROBLOX_REDIRECT_URI,
                client_id: process.env.ROBLOX_CLIENT_ID,
                client_secret: process.env.ROBLOX_CLIENT_SECRET,
                code_verifier: req.cookies.efa_pkce
            })
        });
        if (!tokenRes.ok) throw new Error(`Roblox token exchange failed: ${tokenRes.status}`);
        const tokens = await tokenRes.json();

        const infoRes = await fetch(ROBLOX_USERINFO, {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        });
        if (!infoRes.ok) throw new Error(`Roblox userinfo failed: ${infoRes.status}`);
        const info = await infoRes.json(); // { sub, preferred_username, ... }

        await upsertRobloxPlayer(info.sub, info.preferred_username);
        issueSession(res, info.sub);
        res.redirect(PANEL_URL() || '/');
    } catch (err) {
        console.error('[EFA] Roblox callback error:', err);
        res.redirect(`${PANEL_URL()}/login?error=roblox`);
    }
});

// ---- Discord login / linking --------------------------------

function discordRedirect(res, mode) {
    const state = `${mode}.${b64url(crypto.randomBytes(16))}`;
    setStateCookie(res, 'efa_oauth_state', state);
    const params = new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
        response_type: 'code',
        scope: 'identify',
        state
    });
    res.redirect(`${DISCORD_AUTH}?${params}`);
}

// login with an already-linked Discord account
router.get('/discord', (req, res) => discordRedirect(res, 'login'));

// link Discord to the currently logged-in (Roblox-authed) player
router.get('/discord/link', requireAuth, (req, res) => {
    setStateCookie(res, 'efa_link_uid', String(req.player.user_id));
    discordRedirect(res, 'link');
});

router.get('/discord/callback', async (req, res) => {
    try {
        const { code, state } = req.query;
        if (!code || state !== req.cookies.efa_oauth_state) {
            return res.redirect(`${PANEL_URL()}/login?error=state`);
        }
        const mode = String(state).split('.')[0];

        const tokenRes = await fetch(DISCORD_TOKEN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: process.env.DISCORD_REDIRECT_URI,
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET
            })
        });
        if (!tokenRes.ok) throw new Error(`Discord token exchange failed: ${tokenRes.status}`);
        const tokens = await tokenRes.json();

        const meRes = await fetch(DISCORD_ME, {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        });
        if (!meRes.ok) throw new Error(`Discord /users/@me failed: ${meRes.status}`);
        const me = await meRes.json(); // { id, username, ... }

        if (mode === 'link') {
            const uid = req.cookies.efa_link_uid;
            if (!uid) return res.redirect(`${PANEL_URL()}/login?error=link`);
            const { error } = await supabase
                .from('players').update({ discord_id: me.id }).eq('user_id', uid);
            if (error) {
                // unique violation → that Discord is linked to someone else
                return res.redirect(`${PANEL_URL()}/me?error=discord_taken`);
            }
            return res.redirect(`${PANEL_URL()}/me?linked=1`);
        }

        // mode === 'login'
        const { data: player } = await supabase
            .from('players').select('user_id').eq('discord_id', me.id).maybeSingle();

        if (!player) return res.redirect(`${PANEL_URL()}/login?error=not_linked`);
        issueSession(res, player.user_id);
        res.redirect(PANEL_URL() || '/');
    } catch (err) {
        console.error('[EFA] Discord callback error:', err);
        res.redirect(`${PANEL_URL()}/login?error=discord`);
    }
});

// ---- session ------------------------------------------------

router.get('/me', requireAuth, (req, res) => {
    res.json({ player: req.player, role: roleOf(req.player) });
});

router.post('/logout', (req, res) => {
    clearSession(res);
    res.json({ success: true });
});

module.exports = router;
