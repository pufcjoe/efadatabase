import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api, flag, linkDiscordUrl, ROLE_LABELS, topRole } from '../api';
import { useAuth } from '../App';
import { PageState } from '../ui';

function Toggle({ on, disabled, onChange }) {
    return (
        <button
            className={`toggle ${on ? 'on' : ''}`}
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange(!on)}
        />
    );
}

export default function PlayerPage() {
    const { userId } = useParams();
    const { me } = useAuth();
    const [data, setData] = useState(null);
    const [teams, setTeams] = useState([]);
    const [msg, setMsg] = useState(null); // { kind, text }
    const [loadError, setLoadError] = useState('');
    const [banReason, setBanReason] = useState('');

    const load = useCallback(() => {
        setLoadError('');
        api.player(userId).then(setData).catch(e => setLoadError(e.message));
        api.teams().then(r => setTeams(r.teams)).catch(() => {});
    }, [userId]);

    useEffect(() => {
        load();
        const q = new URLSearchParams(window.location.search);
        if (q.get('linked')) setMsg({ kind: 'ok', text: 'Discord linked.' });
        if (q.get('error') === 'discord_taken') setMsg({ kind: 'error', text: 'That Discord account is already linked to another player.' });
    }, [load]);

    if (!data) {
        return <PageState loading={!loadError} error={loadError} onRetry={load}><span /></PageState>;
    }

    const { player, editable, banHistory } = data;
    const isSelf = me.player.user_id === player.user_id;
    const can = f => editable.includes(f);

    const save = async patch => {
        setMsg(null);
        try {
            await api.updatePlayer(player.user_id, patch);
            setMsg({ kind: 'ok', text: 'Saved.' });
            load();
        } catch (e) {
            setMsg({ kind: 'error', text: e.message });
        }
    };

    const doBan = async () => {
        setMsg(null);
        try {
            await api.ban(player.user_id, banReason || 'No reason given');
            setBanReason('');
            setMsg({ kind: 'ok', text: 'Player banned.' });
            load();
        } catch (e) { setMsg({ kind: 'error', text: e.message }); }
    };

    const doUnban = async () => {
        setMsg(null);
        try {
            await api.unban(player.user_id);
            setMsg({ kind: 'ok', text: 'Ban lifted.' });
            load();
        } catch (e) { setMsg({ kind: 'error', text: e.message }); }
    };

    return (
        <>
            <div className="squad-card">
                <div className="name"><span className="flag">{flag(player.country)}</span>{player.username || 'Unknown'}</div>
                <div className="meta">
                    <span>ID <b>{player.user_id}</b></span>
                    <span>Team <b>{player.team}</b></span>
                    <span>Role <b>{topRole(player)}</b></span>
                    {player.is_banned && <span className="chip bad">Banned</span>}
                </div>
            </div>

            {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}

            <div className="section-title">Profile</div>
            <div className="grid">
                <div className={`field-card ${can('country') ? '' : 'locked'}`}>
                    <div>
                        <div className="label">Country</div>
                        <div className="value">{flag(player.country)} {player.country}</div>
                    </div>
                    {can('country') && (
                        <input className="input" style={{ width: 70 }} maxLength={2}
                            placeholder="GB"
                            onKeyDown={e => {
                                if (e.key === 'Enter' && e.target.value.length === 2) {
                                    save({ country: e.target.value.toUpperCase() });
                                    e.target.value = '';
                                }
                            }} />
                    )}
                </div>

                <div className={`field-card ${can('team') ? '' : 'locked'}`}>
                    <div>
                        <div className="label">Team</div>
                        <div className="value">{player.team}</div>
                    </div>
                    {can('team') && (
                        <select className="input" value={player.team}
                            onChange={e => save({ team: e.target.value })}>
                            <option value="None">None</option>
                            {teams.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                        </select>
                    )}
                </div>

                <div className={`field-card ${can('has_stadium_pass') ? '' : 'locked'}`}>
                    <div>
                        <div className="label">Stadium pass</div>
                        <div className="value">{player.has_stadium_pass ? 'Active' : 'None'}</div>
                    </div>
                    <Toggle on={player.has_stadium_pass} disabled={!can('has_stadium_pass')}
                        onChange={v => save({ has_stadium_pass: v })} />
                </div>

                <div className="field-card">
                    <div>
                        <div className="label">Discord</div>
                        <div className="value">{player.discord_id ? 'Linked' : 'Not linked'}</div>
                    </div>
                    {isSelf && !player.discord_id && (
                        <button className="btn" onClick={() => window.location.href = linkDiscordUrl()}>Link</button>
                    )}
                </div>
            </div>

            <div className="section-title">Roles</div>
            <div className="grid">
                {Object.entries(ROLE_LABELS).map(([field, label]) => (
                    <div key={field} className={`field-card ${can(field) ? '' : 'locked'}`}>
                        <div>
                            <div className="label">{label}</div>
                            <div className="value">{player[field] ? 'Yes' : 'No'}</div>
                        </div>
                        <Toggle on={player[field]} disabled={!can(field)}
                            onChange={v => save({ [field]: v })} />
                    </div>
                ))}
            </div>

            {can('is_banned') && (
                <>
                    <div className="section-title">Discipline</div>
                    {player.is_banned ? (
                        <button className="btn" onClick={doUnban}>Lift ban</button>
                    ) : (
                        <div className="toolbar">
                            <input className="input" style={{ flex: 1, maxWidth: 420 }}
                                placeholder="Ban reason"
                                value={banReason}
                                onChange={e => setBanReason(e.target.value)} />
                            <button className="btn danger" onClick={doBan}>Ban player</button>
                        </div>
                    )}
                    {banHistory.length > 0 && (
                        <div className="sheet" style={{ marginTop: 14 }}>
                            <table>
                                <thead><tr><th>Reason</th><th>By</th><th>Issued</th><th>Status</th></tr></thead>
                                <tbody>
                                    {banHistory.map(b => (
                                        <tr key={b.id}>
                                            <td>{b.reason}</td>
                                            <td className="uid">{b.issued_by}</td>
                                            <td>{new Date(b.issued_at).toLocaleDateString()}</td>
                                            <td>{b.is_active
                                                ? <span className="chip bad">Active</span>
                                                : <span className="chip">Lifted</span>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </>
    );
}
