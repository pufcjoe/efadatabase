import { loginUrl } from '../api';

const ERRORS = {
    not_linked: "That Discord account isn't linked yet. Sign in with Roblox first, then link Discord from your profile.",
    state: 'Login expired — try again.',
    roblox: 'Roblox sign-in failed — try again.',
    discord: 'Discord sign-in failed — try again.',
    link: 'Linking session expired — sign in and try again.'
};

export default function Login() {
    const error = new URLSearchParams(window.location.search).get('error');

    return (
        <div className="login-wrap">
            <div className="login-card">
                <div className="wordmark">E<span>F</span>A</div>
                <div className="sub">League panel</div>
                {error && <div className="notice error">{ERRORS[error] || 'Sign-in failed.'}</div>}
                <button className="btn primary" onClick={() => window.location.href = loginUrl('roblox')}>
                    Sign in with Roblox
                </button>
                <button className="btn" onClick={() => window.location.href = loginUrl('discord')}>
                    Sign in with Discord
                </button>
                <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 14 }}>
                    Discord sign-in works once you've linked it from your profile.
                </p>
            </div>
        </div>
    );
}
