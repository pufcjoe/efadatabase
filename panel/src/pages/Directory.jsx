import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, flag, topRole } from '../api';

export default function Directory() {
    const nav = useNavigate();
    const [search, setSearch] = useState('');
    const [role, setRole] = useState('');
    const [page, setPage] = useState(0);
    const [data, setData] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        const t = setTimeout(() => {
            api.players({ search, role, page })
                .then(setData)
                .catch(e => setError(e.message));
        }, 250);
        return () => clearTimeout(t);
    }, [search, role, page]);

    const pages = data ? Math.ceil(data.total / data.pageSize) : 0;

    return (
        <>
            <h1>Players</h1>
            <div className="toolbar">
                <input className="input" placeholder="Search username…" value={search}
                    onChange={e => { setSearch(e.target.value); setPage(0); }} />
                <select className="input" value={role} onChange={e => { setRole(e.target.value); setPage(0); }}>
                    <option value="">All roles</option>
                    <option value="owner">Owner</option>
                    <option value="board">Board</option>
                    <option value="developer">Developer</option>
                    <option value="staff">Staff</option>
                    <option value="am">Assistant Manager</option>
                    <option value="banned">Banned</option>
                </select>
            </div>

            {error && <div className="notice error">{error}</div>}

            <div className="sheet">
                <table>
                    <thead>
                        <tr>
                            <th></th><th>Player</th><th>Team</th><th>Role</th><th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data?.players.map(p => (
                            <tr key={p.user_id}
                                className={p.is_banned ? 'banned' : (p.is_staff || p.is_board || p.is_owner) ? 'staffed' : ''}
                                style={{ cursor: 'pointer' }}
                                onClick={() => nav(`/players/${p.user_id}`)}>
                                <td style={{ width: 40, fontSize: 20 }}>{flag(p.country)}</td>
                                <td>
                                    <div className="uname">{p.username || 'Unknown'}</div>
                                    <div className="uid">{p.user_id}</div>
                                </td>
                                <td>{p.team}</td>
                                <td><span className="chip">{topRole(p)}</span></td>
                                <td>
                                    {p.is_banned && <span className="chip bad">Banned</span>}
                                    {p.has_stadium_pass && <span className="chip on" style={{ marginLeft: 6 }}>Stadium pass</span>}
                                </td>
                            </tr>
                        ))}
                        {data && data.players.length === 0 && (
                            <tr><td colSpan={5} style={{ color: 'var(--muted)', textAlign: 'center', padding: 30 }}>
                                No players match — try a different search.
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {pages > 1 && (
                <div className="pager">
                    <button className="btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
                    <span>Page {page + 1} of {pages}</span>
                    <button className="btn" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>Next</button>
                </div>
            )}
        </>
    );
}
