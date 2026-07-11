import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../App';
import { useLoad, PageState } from '../ui';

export default function TeamsPage() {
    const { me } = useAuth();
    const [msg, setMsg] = useState(null);
    const [form, setForm] = useState({ name: '', short_name: '', manager_user_id: '' });
    const { loading, data, error, retry } = useLoad(() => api.teams(), []);
    const teams = data?.teams || [];
    const isStaff = ['staff', 'developer', 'board', 'owner'].includes(me.role);
    const isBoard = ['board', 'owner'].includes(me.role);

    const create = async () => {
        setMsg(null);
        try {
            await api.createTeam({
                name: form.name.trim(),
                short_name: form.short_name.trim() || null,
                manager_user_id: form.manager_user_id ? parseInt(form.manager_user_id) : null
            });
            setForm({ name: '', short_name: '', manager_user_id: '' });
            setMsg({ kind: 'ok', text: 'Team created.' });
            retry();
        } catch (e) { setMsg({ kind: 'error', text: e.message }); }
    };

    const remove = async (id, name) => {
        if (!window.confirm(`Delete ${name}? Players keep the team name until reassigned.`)) return;
        try { await api.deleteTeam(id); retry(); }
        catch (e) { setMsg({ kind: 'error', text: e.message }); }
    };

    return (
        <>
            <h1>Teams</h1>
            {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}

            {isStaff && (
                <div className="toolbar">
                    <input className="input" placeholder="Team name" value={form.name}
                        onChange={e => setForm({ ...form, name: e.target.value })} />
                    <input className="input" style={{ width: 90 }} placeholder="Short" maxLength={4} value={form.short_name}
                        onChange={e => setForm({ ...form, short_name: e.target.value.toUpperCase() })} />
                    <input className="input" style={{ width: 170 }} placeholder="Manager UserId (optional)" value={form.manager_user_id}
                        onChange={e => setForm({ ...form, manager_user_id: e.target.value.replace(/\D/g, '') })} />
                    <button className="btn primary" disabled={!form.name.trim()} onClick={create}>Create team</button>
                </div>
            )}

            <PageState loading={loading} error={error} onRetry={retry}>
                <div className="sheet">
                    <table>
                        <thead><tr><th>Team</th><th>Short</th><th>Manager</th>{isBoard && <th></th>}</tr></thead>
                        <tbody>
                            {teams.map(t => (
                                <tr key={t.id}>
                                    <td className="uname">{t.name}</td>
                                    <td>{t.short_name || '—'}</td>
                                    <td>{t.manager ? t.manager.username : <span style={{ color: 'var(--muted)' }}>Unassigned</span>}</td>
                                    {isBoard && (
                                        <td style={{ textAlign: 'right' }}>
                                            <button className="btn danger" onClick={() => remove(t.id, t.name)}>Delete</button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                            {teams.length === 0 && (
                                <tr><td colSpan={4} style={{ color: 'var(--muted)', textAlign: 'center', padding: 30 }}>
                                    No teams yet{isStaff ? ' — create the first one above.' : '.'}
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </PageState>
        </>
    );
}
