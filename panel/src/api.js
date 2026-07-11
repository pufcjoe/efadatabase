// Empty = same domain as the panel (single-domain deploy, or Vite dev proxy).
// Set VITE_API_URL only if the API is hosted separately.
const BASE = import.meta.env.VITE_API_URL || '';

async function request(path, options = {}) {
    let res;
    try {
        res = await fetch(`${BASE}${path}`, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
            ...options
        });
    } catch {
        // Network-level failure — most commonly the free-tier API waking from sleep
        throw new Error('Could not reach the API — it may be waking up. Retry in a few seconds.');
    }

    // Session died mid-use (expired/rotated): bounce back to login
    // instead of leaving pages half-broken. /auth/me handles its own 401.
    if (res.status === 401 && path !== '/auth/me') {
        window.dispatchEvent(new Event('efa:unauthorized'));
    }

    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
    return body;
}

export const api = {
    me: () => request('/auth/me'),
    logout: () => request('/auth/logout', { method: 'POST' }),
    players: (params) => request(`/panel/players?${new URLSearchParams(params)}`),
    player: (id) => request(`/panel/players/${id}`),
    updatePlayer: (id, patch) => request(`/panel/players/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    ban: (id, reason) => request(`/panel/players/${id}/ban`, { method: 'POST', body: JSON.stringify({ reason }) }),
    unban: (id) => request(`/panel/players/${id}/unban`, { method: 'POST' }),
    teams: () => request('/panel/teams'),
    createTeam: (t) => request('/panel/teams', { method: 'POST', body: JSON.stringify(t) }),
    updateTeam: (id, t) => request(`/panel/teams/${id}`, { method: 'PATCH', body: JSON.stringify(t) }),
    deleteTeam: (id) => request(`/panel/teams/${id}`, { method: 'DELETE' }),
    audit: (page = 0) => request(`/panel/audit?page=${page}`)
};

export const loginUrl = (provider) => `${BASE}/auth/${provider}`;
export const linkDiscordUrl = () => `${BASE}/auth/discord/link`;

// "GB" → 🇬🇧
export function flag(code) {
    if (!code || code === 'None' || code.length !== 2) return '·';
    return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export const ROLE_LABELS = {
    is_owner: 'Owner',
    is_board: 'Board',
    is_developer: 'Developer',
    is_staff: 'Staff',
    is_manager: 'Manager'
};

export function topRole(p) {
    if (p.is_owner) return 'Owner';
    if (p.is_board) return 'Board';
    if (p.is_developer) return 'Developer';
    if (p.is_staff) return 'Staff';
    if (p.is_manager) return 'AM';
    return 'Player';
}
