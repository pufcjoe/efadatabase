-- ============================================================
-- EFA Database Schema
-- Run this in the Supabase SQL Editor to create all tables
-- ============================================================

-- =====================
-- PLAYERS
-- =====================
-- Identity + roles only. Roles are NEVER writable by the game —
-- only through the panel API with a logged-in session.

CREATE TABLE IF NOT EXISTS players (
    user_id BIGINT PRIMARY KEY,              -- Roblox UserId (identity anchor)
    username TEXT,                           -- Roblox username (synced from game / OAuth)
    discord_id TEXT UNIQUE,                  -- linked Discord account (for Discord login)

    country TEXT DEFAULT 'None',             -- country code for flag display
    team TEXT DEFAULT 'None',                -- team name

    has_stadium_pass BOOLEAN DEFAULT FALSE,
    is_banned BOOLEAN DEFAULT FALSE,

    -- role flags (a player can hold several; highest wins for rank)
    is_manager BOOLEAN DEFAULT FALSE,             -- Manager
    is_staff BOOLEAN DEFAULT FALSE,
    is_developer BOOLEAN DEFAULT FALSE,
    is_board BOOLEAN DEFAULT FALSE,
    is_owner BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS players_updated_at ON players;
CREATE TRIGGER players_updated_at
    BEFORE UPDATE ON players
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_players_team ON players(team);
CREATE INDEX IF NOT EXISTS idx_players_banned ON players(is_banned);
CREATE INDEX IF NOT EXISTS idx_players_username ON players(username);

-- =====================
-- TEAMS
-- =====================

CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    short_name TEXT,                          -- e.g. "SPA"
    logo_asset_id TEXT,                       -- Roblox decal ID
    manager_user_id BIGINT REFERENCES players(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS teams_updated_at ON teams;
CREATE TRIGGER teams_updated_at
    BEFORE UPDATE ON teams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- =====================
-- BANS (history — is_banned on players is the live flag)
-- =====================

CREATE TABLE IF NOT EXISTS bans (
    id SERIAL PRIMARY KEY,
    player_user_id BIGINT REFERENCES players(user_id) ON DELETE CASCADE,
    reason TEXT,
    issued_by BIGINT,                         -- Roblox UserId of the staff member
    issued_at TIMESTAMPTZ DEFAULT NOW(),
    lifted_by BIGINT,
    lifted_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_bans_player ON bans(player_user_id);
CREATE INDEX IF NOT EXISTS idx_bans_active ON bans(is_active);

-- =====================
-- AUDIT LOG — every panel edit lands here
-- =====================

CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    action TEXT NOT NULL,                     -- "edit", "ban", "unban", "team_create", ...
    target_user_id BIGINT,
    performed_by BIGINT,                      -- Roblox UserId of the session that did it
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target_user_id);
