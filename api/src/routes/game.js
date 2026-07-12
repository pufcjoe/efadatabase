// ============================================================
// Game-facing routes (Roblox HttpService, x-api-key auth)
// Same URL shape as the old ARFA API:
//   GET  /data/:userId   — PlayerAdded reads roles/identity
//   POST /submit/data    — PlayerRemoving writes identity only
// Role fields are read-only from the game, by design.
// ============================================================

const express = require('express');
const router = express.Router();
const { supabase } = require('../database/db');
const { gameAuth } = require('../middleware/gameAuth');

const DEFAULTS = {
    username: null,
    country: 'None',
    teamName: 'None',
    hasStadiumPass: false,
    isBanned: false,
    isManager: false,
    isStaff: false,
    isDeveloper: false,
    isBoard: false,
    isMedia: false,
    isScout: false,
    honours: [],
    isOwner: false
};

router.get('/data/:userId', gameAuth, async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        if (isNaN(userId)) return res.status(400).json({ error: 'Invalid userId' });

        const { data, error } = await supabase
            .from('players').select('*').eq('user_id', userId).single();

        if (error && error.code === 'PGRST116') return res.json(DEFAULTS); // new player

        if (error) throw error;

        const { data: honourRows } = await supabase
            .from('honours').select('honour').eq('user_id', userId);

        res.json({
            username: data.username,
            country: data.country,
            teamName: data.team,
            hasStadiumPass: data.has_stadium_pass,
            isBanned: data.is_banned,
            isManager: data.is_manager,
            isStaff: data.is_staff,
            isDeveloper: data.is_developer,
            isBoard: data.is_board,
            isMedia: data.is_media, 
            isScout: data.is_scout, 
            honours: (honourRows || []).map(r => r.honour),
            isOwner: data.is_owner
        });
    } catch (err) {
        console.error('[EFA] GET /data error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/submit/data', gameAuth, async (req, res) => {
    try {
        const { robloxId, username, country } = req.body;
        if (!robloxId) return res.status(400).json({ error: 'Missing robloxId' });

        // Identity only — the game can never flip roles, bans, or passes.
        const { data: existing } = await supabase
            .from('players').select('user_id').eq('user_id', robloxId).maybeSingle();

        if (existing) {
            const patch = {};
            if (username) patch.username = username;
            if (country) patch.country = country;
            if (Object.keys(patch).length) {
                const { error } = await supabase
                    .from('players').update(patch).eq('user_id', robloxId);
                if (error) throw error;
            }
        } else {
            const { error } = await supabase.from('players').insert({
                user_id: robloxId,
                username: username || null,
                country: country || 'None'
            });
            if (error) throw error;
        }

        res.json({ success: true });
    } catch (err) {
        console.error('[EFA] POST /submit/data error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
