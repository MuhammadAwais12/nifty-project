'use client';
import { useEffect, useState } from 'react';
import { Copy, Mail, RefreshCw, Send } from 'lucide-react';
import { act, toast, useQ } from '@/lib/api';
import { Modal, ROLE_BLURB, ROLE_LABEL, useApp, type Role } from './ui';

/** Which roles each role is allowed to hand out. Mirrors the server's CAN_GRANT. */
export const GRANTABLE: Record<string, Role[]> = {
  owner: ['admin', 'manager', 'member', 'guest'],
  admin: ['manager', 'member', 'guest'],
  manager: ['member', 'guest'],
};

export function InviteForm({ defaultRole = 'member', lockProject, onDone }: { defaultRole?: Role; lockProject?: string; onDone?: () => void }) {
  const { me, projects } = useApp();
  const roles = GRANTABLE[me.role] || [];
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>(roles.includes(defaultRole) ? defaultRole : roles[0] || 'member');
  const [projectIds, setProjectIds] = useState<string[]>(lockProject ? [lockProject] : []);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<any>(null);
  const open = projects.filter((p: any) => !p.archived);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await act('invite.create', { email, role, projectIds, origin: location.origin });
    setBusy(false);
    if (!res) return;
    setSent(res);
    setEmail('');
    onDone?.();
  }

  const link = sent ? `${location.origin}/join/${sent.token}` : '';

  return (
    <form onSubmit={submit} className="space-y-4 p-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label className="label" htmlFor="inv-email">Email address</label>
          <input id="inv-email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@company.com" autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="inv-role">Role</label>
          <select id="inv-role" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
      </div>
      <p className="-mt-1 text-xs text-fg/50">{ROLE_BLURB[role]}</p>

      {!!open.length && (
        <div>
          <span className="label">Add to projects (optional)</span>
          <div className="flex flex-wrap gap-1.5">
            {open.map((p: any) => {
              const on = projectIds.includes(p.id);
              return (
                <button key={p.id} type="button" aria-pressed={on}
                  onClick={() => setProjectIds(on ? projectIds.filter((x) => x !== p.id) : [...projectIds, p.id])}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${on ? 'bg-ember/15 text-ember ring-ember/50' : 'ring-line hover:bg-fg/5'}`}>
                  <span className="h-2 w-2 rounded-[3px]" style={{ background: p.color }} /> {p.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button className="btn-primary" disabled={busy}><Send size={14} /> {busy ? 'Sending…' : 'Send invitation'}</button>

      {sent && (
        <div className="rounded-xl border border-line bg-paper p-3">
          <p className="text-sm font-bold">{sent.sent ? `Invitation emailed to ${sent.email}` : `Invitation ready for ${sent.email}`}</p>
          <p className="mt-0.5 text-xs text-fg/55">
            {sent.sent ? 'They can also use this link directly.' : 'Email sending is not set up, so send them this link yourself. It only works for their address.'}
          </p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={link} aria-label="Invitation link" className="input font-mono text-xs" onFocus={(e) => e.target.select()} />
            <button type="button" className="btn-outline shrink-0" onClick={() => navigator.clipboard.writeText(link).then(() => toast('Invitation link copied'), () => toast('Copy failed'))}>
              <Copy size={14} /> Copy
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

export function SharedLinks() {
  const { data } = useQ('team.invite', {});
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(location.origin), []);
  const copy = (v: string) => navigator.clipboard.writeText(v).then(() => toast('Link copied'), () => toast('Copy failed'));
  async function regenerate(kind: 'member' | 'guest') {
    if (!window.confirm('Create a new link? The current one stops working.')) return;
    await act('team.invite', { regenerate: kind });
  }
  const link = data ? `${origin}/login?invite=${data.code}` : '';
  const guestLink = data ? `${origin}/login?invite=${data.guestCode}` : '';
  return (
    <div className="space-y-4 p-5">
      <p className="text-sm text-fg/55">Shared links let anyone who has them join without a personal invitation. Handy for onboarding a whole team at once.</p>
      {[
        { title: 'Team member link', value: link, hint: 'Joins as a Member.', kind: 'member' as const },
        { title: 'Client guest link', value: guestLink, hint: 'Joins as a Guest: view and comment only.', kind: 'guest' as const },
      ].map((row) => (
        <div key={row.kind}>
          <p className="text-sm font-bold">{row.title}</p>
          <p className="text-xs text-fg/50">{row.hint}</p>
          <div className="mt-1.5 flex gap-2">
            <input readOnly value={row.value} aria-label={row.title} className="input font-mono text-xs" onFocus={(e) => e.target.select()} />
            <button className="btn-outline shrink-0" onClick={() => copy(row.value)} disabled={!row.value}><Copy size={14} /></button>
            <button className="btn-outline shrink-0" onClick={() => regenerate(row.kind)} title="Replace link"><RefreshCw size={14} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** The whole invite dialog: by email, or the shared links. */
export function InviteModal({ onClose, defaultRole, lockProject, title = 'Invite people' }: { onClose: () => void; defaultRole?: Role; lockProject?: string; title?: string }) {
  const { isAdmin } = useApp();
  const [tab, setTab] = useState<'invite' | 'links'>('invite');
  return (
    <Modal open onClose={onClose} title={<span className="flex items-center gap-2"><Mail size={16} /> {title}</span>} wide>
      <div className="border-b border-line px-5">
        <nav className="-mb-px flex gap-1">
          <button onClick={() => setTab('invite')} className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab === 'invite' ? 'border-ember text-fg' : 'border-transparent text-fg/50 hover:text-fg'}`}>By email</button>
          {isAdmin && (
            <button onClick={() => setTab('links')} className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab === 'links' ? 'border-ember text-fg' : 'border-transparent text-fg/50 hover:text-fg'}`}>Shared links</button>
          )}
        </nav>
      </div>
      {tab === 'invite' ? <InviteForm defaultRole={defaultRole} lockProject={lockProject} /> : <SharedLinks />}
    </Modal>
  );
}
