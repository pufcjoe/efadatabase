import { useEffect, useState } from 'react';
import { api } from '../api';

export default function AuditPage() {
    const [page, setPage] = useState(0);
    const [data, setData] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        api.audit(page).then(setData).catch(e => setError(e.message));
    }, [page]);

    const pages = data ? Math.ceil(data.total / data.pageSize) : 0;

    return (
        <>
            <h1>Audit log</h1>
            {error && <div className="notice error">{error}</div>}
            <div className="sheet">
                <table>
                    <thead><tr><th>When</th><th>Action</th><th>Target</th><th>By</th><th>Details</th></tr></thead>
                    <tbody>
                        {data?.entries.map(e => (
                            <tr key={e.id}>
                                <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.created_at).toLocaleString()}</td>
                                <td><span className="chip">{e.action}</span></td>
                                <td className="uid">{e.target_user_id || '—'}</td>
                                <td className="uid">{e.performed_by}</td>
                                <td style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 380, overflowWrap: 'anywhere' }}>
                                    {e.details ? JSON.stringify(e.details) : '—'}
                                </td>
                            </tr>
                        ))}
                        {data && data.entries.length === 0 && (
                            <tr><td colSpan={5} style={{ color: 'var(--muted)', textAlign: 'center', padding: 30 }}>
                                Nothing logged yet.
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
