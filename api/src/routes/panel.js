// ============================================================
// Panel routes (session auth). Every write is field-gated by
// lib/permissions.js and lands in the audit log.
// ============================================================

const express = require('express');
const router = express.Router();
const { supabase } = require('../database/db');
const { requireAuth } = require('../middleware/session');
const { canEditField, editableFields, requireMinRole, roleOf, FIELD_RULES } = require('../lib/permissions');

router.use(requireAuth);

async function managerTeamOf(player) {
    if (!player.is_manager) return null;
    const { data } = await supabase
        .from('teams').select('name').eq('manager_user_id', player.user_id).maybeSingle();
    return data ? data.name : null;
}

async function audit(action, targetUserId, performedBy, details) {
    await supabase.from('audit_log').insert({
        action, target_user_id: targetUserId, performed_by: performedBy, details
    });
}

// ---- players ------------------------------------------------

// GET /panel/players?search=&team=&role=&page=
router.get('/players', async (req, res) => {
    try {
        const page = Math.max(0, parseInt(req.query.page) || 0);
        const PAGE_SIZE = 25;

        let query = supabase
            .from('players')
            .select('user_id, username, country, team, has_stadium_pass, is_banned, is_manager, is_staff, is_developer, is_board, is_owner', { count: 'exact' })
            .order('username', { ascending: true })
            .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

        if (req.query.search) query = query.ilike('username', `%${req.query.search}%`);
        if (req.query.team) query = query.eq('team', req.query.team);
        if (req.query.role) {
            const col = `is_${req.query.role}`;
            if (['is_manager', 'is_staff', 'is_developer', 'is_board', 'is_owner', 'is_banned'].includes(col)) {
                query = query.eq(col, true);
            }
        }

        const { data, error, count } = await query;
        if (error) throw error;
        res.json({ players: data, total: count, pageSize: PAGE_SIZE });
    } catch (err) {
        console.error('[EFA] GET /panel/players error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /panel/players/:userId — profile + which fields YOU can edit on them
router.get('/players/:userId', async (req, res) => {
    try {
        const { data: target, error } = await supabase
            .from('players').select('*').eq('user_id', req.params.userId).single();
        if (error || !target) return res.status(404).json({ error: 'Player not found' });

        const team = await managerTeamOf(req.player);
        const { data: banHistory } = await supabase
            .from('bans').select('*')
            .eq('player_user_id', target.user_id)
            .order('issued_at', { ascending: false })
            .limit(10);

        res.json({
            player: target,
            editable: editableFields(req.player, target, team),
            banHistory: banHistory || [],
            viewerRole: roleOf(req.player)
        });
    } catch (err) {
        console.error('[EFA] GET /panel/players/:id error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PATCH /panel/players/:userId — { field: value, ... } gated per-field
router.patch('/players/:userId', async (req, res) => {
    try {
        const { data: target, error } = await supabase
            .from('players').select('*').eq('user_id', req.params.userId).single();
        if (error || !target) return res.status(404).json({ error: 'Player not found' });

        const team = await managerTeamOf(req.player);
        const patch = {};
        const changes = {};

        for (const [field, value] of Object.entries(req.body)) {
            const check = canEditField(req.player, target, field, value, team);
            if (!check.ok) {
                return res.status(403).json({ error: `${field}: ${check.reason}` });
            }
            // type guard: booleans stay booleans, text stays text
            const rule = FIELD_RULES[field];
            const isBoolField = field.startsWith('is_') || field.startsWith('has_');
            if (isBoolField && typeof value !== 'boolean') {
                return res.status(400).json({ error: `${field} must be a boolean` });
            }
            if (!isBoolField && typeof value !== 'string') {
                return res.status(400).json({ error: `${field} must be a string` });
            }
            patch[field] = value;
            changes[field] = { from: target[field], to: value };
        }

        if (!Object.keys(patch).length) return res.status(400).json({ error: 'No fields to update' });

        const { data: updated, error: upErr } = await supabase
            .from('players').update(patch).eq('user_id', target.user_id).select().single();
        if (upErr) throw upErr;

        await audit('edit', target.user_id, req.player.user_id, changes);
        res.json({ success: true, player: updated });
    } catch (err) {
        console.error('[EFA] PATCH /panel/players/:id error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /panel/players/:userId/ban { reason }
router.post('/players/:userId/ban', async (req, res) => {
    try {
        const { data: target, error } = await supabase
            .from('players').select('*').eq('user_id', req.params.userId).single();
        if (error || !target) return res.status(404).json({ error: 'Player not found' });

        const check = canEditField(req.player, target, 'is_banned', true, null);
        if (!check.ok) return res.status(403).json({ error: check.reason });

        await supabase.from('players').update({ is_banned: true }).eq('user_id', target.user_id);
        await supabase.from('bans').insert({
            player_user_id: target.user_id,
            reason: req.body.reason || 'No reason given',
            issued_by: req.player.user_id
        });
        await audit('ban', target.user_id, req.player.user_id, { reason: req.body.reason });
        res.json({ success: true });
    } catch (err) {
        console.error('[EFA] ban error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /panel/players/:userId/unban
router.post('/players/:userId/unban', async (req, res) => {
    try {
        const { data: target, error } = await supabase
            .from('players').select('*').eq('user_id', req.params.userId).single();
        if (error || !target) return res.status(404).json({ error: 'Player not found' });

        const check = canEditField(req.player, target, 'is_banned', false, null);
        if (!check.ok) return res.status(403).json({ error: check.reason });

        await supabase.from('players').update({ is_banned: false }).eq('user_id', target.user_id);
        await supabase.from('bans')
            .update({ is_active: false, lifted_by: req.player.user_id, lifted_at: new Date().toISOString() })
            .eq('player_user_id', target.user_id).eq('is_active', true);
        await audit('unban', target.user_id, req.player.user_id, {});
        res.json({ success: true });
    } catch (err) {
        console.error('[EFA] unban error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ---- teams --------------------------------------------------

router.get('/teams', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('teams')
            .select('*, manager:manager_user_id (username)')
            .order('name');
        if (error) throw error;
        res.json({ teams: data });
    } catch (err) {
        console.error('[EFA] GET /panel/teams error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/teams', requireMinRole('staff'), async (req, res) => {
    try {
        const { name, short_name, logo_asset_id, manager_user_id } = req.body;
        if (!name) return res.status(400).json({ error: 'Missing team name' });
        const { data, error } = await supabase
            .from('teams')
            .insert({ name, short_name, logo_asset_id, manager_user_id: manager_user_id || null })
            .select().single();
        if (error) throw error;
        await audit('team_create', null, req.player.user_id, { name });
        res.json({ success: true, team: data });
    } catch (err) {
        console.error('[EFA] POST /panel/teams error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.patch('/teams/:id', requireMinRole('staff'), async (req, res) => {
    try {
        const allowed = ['name', 'short_name', 'logo_asset_id', 'manager_user_id'];
        const patch = {};
        for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
        if (!Object.keys(patch).length) return res.status(400).json({ error: 'No fields to update' });

        const { data, error } = await supabase
            .from('teams').update(patch).eq('id', req.params.id).select().single();
        if (error) throw error;
        await audit('team_edit', null, req.player.user_id, { teamId: req.params.id, patch });
        res.json({ success: true, team: data });
    } catch (err) {
        console.error('[EFA] PATCH /panel/teams error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/teams/:id', requireMinRole('board'), async (req, res) => {
    try {
        const { error } = await supabase.from('teams').delete().eq('id', req.params.id);
        if (error) throw error;
        await audit('team_delete', null, req.player.user_id, { teamId: req.params.id });
        res.json({ success: true });
    } catch (err) {
        console.error('[EFA] DELETE /panel/teams error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ---- audit log (staff+) ------------------------------------

router.get('/audit', requireMinRole('staff'), async (req, res) => {
    try {
        const page = Math.max(0, parseInt(req.query.page) || 0);
        const PAGE_SIZE = 50;
        const { data, error, count } = await supabase
            .from('audit_log')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
        if (error) throw error;
        res.json({ entries: data, total: count, pageSize: PAGE_SIZE });
    } catch (err) {
        console.error('[EFA] GET /panel/audit error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
