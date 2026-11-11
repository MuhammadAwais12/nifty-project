'use client';
import { useEffect, useState } from 'react';
import { rpc } from '@/lib/api';
import { Logo } from './Logo';
import { ROLE_LABEL, type Role } from './ui';

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.8-2 5.1-4.4 6.7v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.4z" />
      <path fill="#34A853" d="M24 46c6 0 11-2 14.6-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.6-3.9-12.4-9.1H4.3v5.7C7.9 41.1 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.6 28.1c-.4-1.3-.7-2.7-.7-4.1s.3-2.8.7-4.1V14H4.3A22 22 0 0 0 2 24c0 3.5.8 6.9 2.3 9.9l7.3-5.8z" />
      <path fill="#EA4335" d="M24 10.6c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 4.1 30 2 24 2 15.4 2 7.9 6.9 4.3 14l7.3 5.8c1.8-5.2 6.6-9.2 12.4-9.2z" />
    </svg>
  );
}

const BULLETS = [
  'Kanban, list, calendar, timeline and swimlane views',
  'Milestones on a roadmap, with task dependencies',
  'Project chat, discussions, docs and files beside the work',
  'Time tracking, reports and role-based access',
];

/** Sign in, sign up, and accept an invitation — one form for all three. */
export function AuthForm({ token = '' }: { token?: string }) {
  const [mode, setMode] = useState<'login' | 'signup' | null>(null);
  const [first, setFirst] = useState(false);
  const [google, setGoogle] = useState(false);
  const [invite, setInvite] = useState<{ email: string; role: Role } | null>(null);
  const [badToken, setBadToken] = useState(false);
  const [code, setCode] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get('error');
    if (urlError) setError(urlError);
    const linkCode = params.get('invite') || '';
    setCode(linkCode);
    rpc('auth.status', { token })
      .then((s) => {
        setFirst(!s.hasUsers);
        setGoogle(!!s.google);
        if (token) {
          if (s.invite) {
            setInvite(s.invite);
            setForm((f) => ({ ...f, email: s.invite.email }));
          } else setBadToken(true);
        }
        setMode(!s.hasUsers || token || linkCode ? 'signup' : 'login');
      })
      .catch((e) => {
        setError(e.message);
        setMode('login');
      });
  }, [token]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await rpc(mode === 'signup' ? 'auth.signup' : 'auth.login', { ...form, token, inviteCode: code });
      window.location.href = '/'; // full reload so no cached signed-out state survives
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  const heading = mode === 'signup' ? (first ? 'Create your workspace' : invite ? 'Accept your invitation' : 'Join the workspace') : 'Welcome back';
  const sub = mode === 'signup'
    ? first
      ? 'The first account becomes the workspace owner.'
      : invite
        ? `You were invited as ${ROLE_LABEL[invite.role]}. Set a password, or continue with Google.`
        : 'Create your account with the invite link from your admin.'
    : 'Sign in to pick up where you left off.';

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden border-r border-white/10 bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo />
        <div>
          <h1 className="max-w-md text-4xl font-extrabold leading-tight tracking-tight">
            Every client, every deadline, <span className="text-ember">one workspace.</span>
          </h1>
          <ul className="mt-8 space-y-3 text-white/70">
            {BULLETS.map((t) => (
              <li key={t} className="flex items-center gap-3"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ember" /> {t}</li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-white/40">Built for the Teqnite team</p>
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-ember/20 blur-3xl" />
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo dark /></div>
          <h2 className="text-2xl font-extrabold tracking-tight">{heading}</h2>
          <p className="mt-1 text-sm text-fg/55">{sub}</p>

          {badToken && (
            <p role="alert" className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              This invitation has expired or was already used. Ask your admin for a new one.
            </p>
          )}

          {google && (
            <>
              <a href={`/api/auth/google${token ? `?invite=${encodeURIComponent(token)}` : ''}`}
                className="btn-outline mt-6 w-full py-2.5 text-[15px]">
                <GoogleMark /> Continue with Google
              </a>
              <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-fg/35">
                <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          <form onSubmit={submit}>
            <div className={`space-y-4 ${google ? '' : 'mt-6'}`}>
              {mode === 'signup' && (
                <div>
                  <label className="label" htmlFor="name">Full name</label>
                  <input id="name" className="input" value={form.name} onChange={set('name')} autoComplete="name" required />
                </div>
              )}
              <div>
                <label className="label" htmlFor="email">Work email</label>
                <input id="email" type="email" className="input" value={form.email} onChange={set('email')} autoComplete="email" required readOnly={!!invite} />
                {invite && <p className="mt-1 text-xs text-fg/45">This invitation only works for {invite.email}.</p>}
              </div>
              <div>
                <label className="label" htmlFor="password">Password</label>
                <input id="password" type="password" className="input" value={form.password} onChange={set('password')} minLength={mode === 'signup' ? 8 : undefined}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required />
                {mode === 'signup' && <p className="mt-1 text-xs text-fg/45">At least 8 characters.</p>}
              </div>
              {mode === 'signup' && !first && !invite && (
                <div>
                  <label className="label" htmlFor="invite">Invite code</label>
                  <input id="invite" className="input" value={code} onChange={(e) => setCode(e.target.value)} required />
                  <p className="mt-1 text-xs text-fg/45">From the shared invite link your admin sent you.</p>
                </div>
              )}
            </div>

            {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}

            <button className="btn-primary mt-6 w-full py-2.5" disabled={busy || !mode}>
              {busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </form>

          {!first && mode && !invite && (
            <p className="mt-5 text-center text-sm text-fg/55">
              {mode === 'login' ? 'Have an invite link?' : 'Already have an account?'}{' '}
              <button type="button" className="font-semibold text-ember hover:underline" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>
                {mode === 'login' ? 'Create an account' : 'Sign in'}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
