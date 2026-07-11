import { useEffect, useState, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { api } from './api';
import Login from './pages/Login';
import Directory from './pages/Directory';
import PlayerPage from './pages/PlayerPage';
import TeamsPage from './pages/TeamsPage';
import AuditPage from './pages/AuditPage';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

function Shell({ children }) {
    const { me, refresh } = useAuth();
    const isStaff = ['staff', 'developer', 'board', 'owner'].includes(me.role);

    return (
        <div className="shell">
            <nav className="rail">
                <div className="wordmark">E<span>F</span>A</div>
                <div className="tagline">League panel</div>
                <NavLink to="/players" className={({ isActive }) => isActive ? 'active' : ''}>Players</NavLink>
                <NavLink to="/teams" className={({ isActive }) => isActive ? 'active' : ''}>Teams</NavLink>
                {isStaff && <NavLink to="/audit" className={({ isActive }) => isActive ? 'active' : ''}>Audit log</NavLink>}
                <NavLink to={`/players/${me.player.user_id}`} end className={({ isActive }) => isActive ? 'active' : ''}>My profile</NavLink>
                <div className="session">
                    <div className="who">{me.player.username}</div>
                    <div className="role">{me.role}</div>
                    <button className="btn" style={{ marginTop: 10, width: '100%' }}
                        onClick={async () => { await api.logout(); refresh(); }}>
                        Log out
                    </button>
                </div>
            </nav>
            <main className="main">{children}</main>
        </div>
    );
}

export default function App() {
    const [me, setMe] = useState(undefined); // undefined = loading, null = logged out

    const refresh = () => api.me().then(setMe).catch(() => setMe(null));
    useEffect(() => { refresh(); }, []);

    // Any API call returning 401 (expired/rotated session) sends us
    // back to the login screen instead of half-broken pages.
    useEffect(() => {
        const onDead = () => setMe(null);
        window.addEventListener('efa:unauthorized', onDead);
        return () => window.removeEventListener('efa:unauthorized', onDead);
    }, []);

    if (me === undefined) return null;

    return (
        <AuthCtx.Provider value={{ me, refresh }}>
            <BrowserRouter>
                {me === null ? (
                    <Routes>
                        <Route path="*" element={<Login />} />
                    </Routes>
                ) : (
                    <Shell>
                        <Routes>
                            <Route path="/players" element={<Directory />} />
                            <Route path="/players/:userId" element={<PlayerPage />} />
                            <Route path="/teams" element={<TeamsPage />} />
                            <Route path="/audit" element={<AuditPage />} />
                            <Route path="*" element={<Navigate to="/players" replace />} />
                        </Routes>
                    </Shell>
                )}
            </BrowserRouter>
        </AuthCtx.Provider>
    );
}
