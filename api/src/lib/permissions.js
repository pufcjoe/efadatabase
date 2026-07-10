// ============================================================
// EFA role & permission model
// ============================================================
// Rank order (highest flag on a player wins):
//   owner > board > developer > staff > am > player
//
// Rules:
//   - You can never edit someone of equal or higher rank
//     (except editing yourself where a rule allows self-edit,
//     and owners can edit other owners' non-role fields).
//   - An owner can never remove their own is_owner flag
//     (lockout guard).
//   - The game API can never write role fields — only the panel.

const ROLE_RANK = {
    player: 0,
    am: 1,
    staff: 2,
    developer: 3,
    board: 4,
    owner: 5
};

function roleOf(player) {
    if (!player) return 'player';
    if (player.is_owner) return 'owner';
    if (player.is_board) return 'board';
    if (player.is_developer) return 'developer';
    if (player.is_staff) return 'staff';
    if (player.is_am) return 'am';
    return 'player';
}

function rankOf(player) {
    return ROLE_RANK[roleOf(player)];
}

// Per-field rules:
//   roles: roles allowed to edit this field on others
//   self:  whether a player may edit this field on themselves
//   amOwnTeam: AMs may set this field to their own team's name,
//              or back to 'None' if the target is currently on their team
const FIELD_RULES = {
    country:          { roles: ['staff', 'board', 'owner'], self: true },
    team:             { roles: ['staff', 'board', 'owner'], amOwnTeam: true },
    has_stadium_pass: { roles: ['developer', 'board', 'owner'] },
    is_banned:        { roles: ['staff', 'board', 'owner'] },
    is_am:            { roles: ['board', 'owner'] },
    is_staff:         { roles: ['board', 'owner'] },
    is_developer:     { roles: ['owner'] },
    is_board:         { roles: ['owner'] },
    is_owner:         { roles: ['owner'] }
    // username / user_id / discord_id are identity fields, synced — never hand-edited
};

/**
 * Can `actor` edit `field` on `target`?
 * `actorTeam` — team name the actor is AM of (or null).
 * Returns { ok, reason }
 */
function canEditField(actor, target, field, newValue, actorTeam) {
    const rule = FIELD_RULES[field];
    if (!rule) return { ok: false, reason: `Field "${field}" is not editable` };

    const isSelf = actor.user_id === target.user_id;
    const actorRole = roleOf(actor);

    // Lockout guard: an owner cannot strip their own owner flag
    if (isSelf && field === 'is_owner' && newValue === false) {
        return { ok: false, reason: 'You cannot remove your own owner role' };
    }

    // Self-edit path
    if (isSelf && rule.self) return { ok: true };

    // AM sign/release path for team
    if (rule.amOwnTeam && actorRole === 'am' && actorTeam) {
        const signing = newValue === actorTeam;
        const releasing = newValue === 'None' && target.team === actorTeam;
        if (signing || releasing) {
            // AMs still can't touch players ranked above them
            if (rankOf(target) >= rankOf(actor) && !isSelf) {
                return { ok: false, reason: 'Target outranks you' };
            }
            return { ok: true };
        }
        return { ok: false, reason: 'AMs can only sign players to their own team or release from it' };
    }

    // Role-list path
    if (!rule.roles.includes(actorRole)) {
        return { ok: false, reason: `Requires ${rule.roles.join(' / ')}` };
    }

    // Rank protection: can't edit equal/higher rank (owners may edit
    // other owners' non-role fields; role flags on an owner stay owner-only-self... 
    // in practice: owner rank ties are allowed for owners)
    if (!isSelf && rankOf(target) >= rankOf(actor) && actorRole !== 'owner') {
        return { ok: false, reason: 'Target outranks you' };
    }

    return { ok: true };
}

/**
 * List of fields `actor` could edit on `target` (used by the panel UI
 * to decide which controls to render).
 */
function editableFields(actor, target, actorTeam) {
    return Object.keys(FIELD_RULES).filter(field => {
        // probe with a representative value; for booleans use flip, for text use a marker
        const probe = typeof target[field] === 'boolean' ? !target[field] : (actorTeam || 'probe');
        return canEditField(actor, target, field, probe, actorTeam).ok;
    });
}

function requireMinRole(minRole) {
    return (req, res, next) => {
        if (ROLE_RANK[roleOf(req.player)] >= ROLE_RANK[minRole]) return next();
        res.status(403).json({ error: `Requires ${minRole} or above` });
    };
}

module.exports = { ROLE_RANK, roleOf, rankOf, FIELD_RULES, canEditField, editableFields, requireMinRole };
