import { useState } from 'react';
import { getConfigStatus } from './lib/env.js';
import { isOwnerUser } from './lib/owner.js';
import { useAuthSession } from './lib/useAuthSession.js';
import { signInWithPassword, signOut } from './lib/supabaseClient.js';
import { EditorShell } from './components/EditorShell.jsx';
import './App.css';

const INITIAL_FORM = {
  email: '',
  password: '',
};

export default function App() {
  const configStatus = getConfigStatus();
  const { session, user, loading, error: sessionError } = useAuthSession(configStatus.ready);
  const [form, setForm] = useState(INITIAL_FORM);
  const [authError, setAuthError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const ownerCheck = user ? isOwnerUser(user) : { allowed: false, reason: 'No user session.' };

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setAuthError('');

    try {
      await signInWithPassword(form.email, form.password);
      setForm(INITIAL_FORM);
    } catch (error) {
      setAuthError(error.message || 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    setSubmitting(true);
    setAuthError('');

    try {
      await signOut();
    } catch (error) {
      setAuthError(error.message || 'Unable to sign out.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!configStatus.ready) {
    return (
      <main className="page">
        <section className="hero">
          <div>
            <p className="eyebrow">Configuration required</p>
            <h1>Mushy Level Editor</h1>
            <p>Add the missing environment variables before starting the editor.</p>
          </div>
        </section>
        <section className="card" style={{ marginTop: 22 }}>
          <h2>Missing env vars</h2>
          <ul className="workspace-list">
            {configStatus.missing.map((name) => (
              <li key={name}>
                <strong>{name}</strong>
                <span>Set this in `.env.local` for local development or in Vercel for deployment.</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    );
  }

  if (loading) return <div className="loading">Loading editor session</div>;

  const isOwner = user && ownerCheck.allowed;

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Owner workspace</p>
          <h1>Mushy Level Editor</h1>
          <p>
            Author daily levels, prepare asset object keys, and manage runtime access for the
            Mushy game catalog.
          </p>
        </div>
        <span className="session-pill">{user ? user.email : 'Signed out'}</span>
      </section>

      {isOwner && (
        <EditorShell
          session={session}
          signingOut={submitting}
          user={user}
          onSignOut={handleSignOut}
        />
      )}

      {isOwner && sessionError && <div className="alert">{sessionError}</div>}
      {isOwner && authError && <div className="alert">{authError}</div>}

      {!isOwner && (
      <section className="grid">
        <article className="card">
          {!user ? (
            <>
              <h2>Sign in</h2>
              <p>
                Use the creator account that was manually created in the editor-owned Supabase
                project.
              </p>
              <form className="login-form" onSubmit={handleSubmit}>
                <label className="field">
                  <span>Email</span>
                  <input
                    autoComplete="email"
                    name="email"
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))}
                    required
                    type="email"
                    value={form.email}
                  />
                </label>
                <label className="field">
                  <span>Password</span>
                  <input
                    autoComplete="current-password"
                    name="password"
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      password: event.target.value,
                    }))}
                    required
                    type="password"
                    value={form.password}
                  />
                </label>
                <div className="button-row">
                  <button className="button" disabled={submitting} type="submit">
                    {submitting ? 'Signing in...' : 'Sign in'}
                  </button>
                </div>
              </form>
            </>
          ) : ownerCheck.allowed ? (
            <>
              <h2>Editor ready</h2>
              <p>
                Owner authorization passed. The next milestone can add the Levels, Assets, and
                Service Tokens panels behind this gate.
              </p>
              <div className="success">
                Signed in as an owner. User ID: {user.id}
              </div>
              <div className="button-row">
                <button className="button secondary" disabled={submitting} onClick={handleSignOut}>
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <>
              <h2>Owner access required</h2>
              <p>
                Your Supabase session is valid, but this account is not in the level-editor owner
                allowlist.
              </p>
              <div className="alert">{ownerCheck.reason}</div>
              <div className="button-row">
                <button className="button secondary" disabled={submitting} onClick={handleSignOut}>
                  Sign out
                </button>
              </div>
            </>
          )}

          {sessionError && <div className="alert">{sessionError}</div>}
          {authError && <div className="alert">{authError}</div>}
        </article>

        <aside className="card">
          <h2>Foundation checklist</h2>
          <ul className="workspace-list">
            <li>
              <strong>Levels</strong>
              <span>Calendar and Word-Guess authoring will land after the schema milestone.</span>
            </li>
            <li>
              <strong>Assets</strong>
              <span>Levels will store object keys and resolve short-lived URLs only when needed.</span>
            </li>
            <li>
              <strong>Service tokens</strong>
              <span>Owner-created runtime tokens will replace password-based service access.</span>
            </li>
          </ul>
          {session && (
            <p className="meta">
              Session expires at {new Date(session.expires_at * 1000).toLocaleString()}
            </p>
          )}
        </aside>
      </section>
      )}
    </main>
  );
}
