// Shared page-state helpers: every page gets a loading spinner,
// a readable error, and a Retry button — no more silent blanks.
import { useEffect, useState, useCallback } from 'react';

export function useLoad(fn, deps) {
    const [state, set] = useState({ loading: true, data: null, error: null });

    const run = useCallback(() => {
        set(s => ({ ...s, loading: true, error: null }));
        fn().then(data => set({ loading: false, data, error: null }))
            .catch(e => set({ loading: false, data: null, error: e.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    useEffect(() => { run(); }, [run]);
    return { ...state, retry: run };
}

export function PageState({ loading, error, onRetry, children }) {
    if (loading) {
        return (
            <div className="page-state">
                <div className="spinner" />
                <span>Loading…</span>
            </div>
        );
    }
    if (error) {
        return (
            <div className="page-state">
                <div className="notice error" style={{ marginBottom: 0 }}>{error}</div>
                <button className="btn" onClick={onRetry}>Retry</button>
            </div>
        );
    }
    return children;
}
