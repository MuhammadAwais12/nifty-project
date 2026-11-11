'use client';
import { useEffect, useState } from 'react';
import { Copy, Crown, Link2, Mail, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { act, rpc, toast, useQ } from '@/lib/api';
import { Avatar, Modal, ROLE_BLURB, ROLE_LABEL, RANK, Spinner, fmtDateTime, useApp, type Role } from '@/components/ui';

const GRANTABLE: Record<string, Role[]> = {
  owner: ['admin', 'manager', 'member', 'guest'],
  admin: ['manager', 'member', 'guest'],
  manager: ['member', 'guest'],
};

function InviteForm({ onDone }: { onDone: () => void }) {
  const { me, projects } = useApp();
  const roles = GRANTABLE[me.role] || [];
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [projectIds, setProjectIds] = useState<string[]>([]);
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
    setProjectIds([]);
    onDone();
  }

  const link = sent ? `${location.origin}/join/${sent.token}` : '';

  return (
    <form onSubmit={submit} className="space-y-4 p-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label className="label" htmlFor="inv-email">Email address</label>
          <input id="inv-email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@company.com" />
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

function SharedLinks() {
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

export default function Team() {
  const { me, users, canManage, isAdmin } = useApp();
  const [tab, setTab] = useState<'invite' | 'links'>('invite');
  const [open, setOpen] = useState(false);
  const { data: pending, mutate } = useQ<any[]>(canManage ? 'invite.list' : null);

  const team = users.filter((u) => u.role !== 'guest');
  const guests = users.filter((u) => u.role === 'guest');

  async function transfer(u: any) {
    if (!window.confirm(`Make ${u.name} the workspace owner? You become an admin and cannot undo this yourself.`)) return;
    await act('team.transfer', { id: u.id });
  }

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h-page">Team</h1>
          <p className="mt-1 text-sm text-fg/55">
            {team.filter((u) => u.active).length} team {team.filter((u) => u.active).length === 1 ? 'member' : 'members'} and {guests.filter((u) => u.active).length} {guests.filter((u) => u.active).length === 1 ? 'guest' : 'guests'}.
          </p>
        </div>
        {canManage && <button className="btn-primary" onClick={() => { setTab('invite'); setOpen(true); }}><Mail size={15} /> Invite people</button>}
      </div>

      {canManage && !!pending?.length && (
        <div className="card mt-6">
          <p className="border-b border-line px-4 py-2.5 text-sm font-bold">Pending invitations</p>
          <div className="divide-y divide-line">
            {pending.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <Mail size={16} className="text-fg/35" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{i.email}</span>
                  <span className="block text-xs text-fg/45">Invited {fmtDateTime(i.created_at)} · expires {new Date(i.expires_at).toLocaleDateString()}</span>
                </span>
                <span className="chip bg-fg/5 text-fg/60">{ROLE_LABEL[i.role as Role]}</span>
                <button className="btn-outline py-1" onClick={() => navigator.clipboard.writeText(`${location.origin}/join/${i.token}`).then(() => toast('Invitation link copied'), () => toast('Copy failed'))}>
                  <Link2 size={14} /> Link
                </button>
                <button className="btn-danger py-1" onClick={async () => { if (window.confirm(`Cancel the invitation to ${i.email}?`)) { await act('invite.revoke', { id: i.id }); mutate(); } }}>
                  <X size={14} /> Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card mt-6 divide-y divide-line">
        {users.map((u) => {
          const editable = isAdmin && u.role !== 'owner' && u.id !== me.id;
          const roles = GRANTABLE[me.role] || [];
          return (
            <div key={u.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${u.active ? '' : 'opacity-50'}`}>
              <Avatar user={u} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">
                  {u.name} {u.id === me.id && <span className="font-medium text-fg/40">(you)</span>}
                  {u.role === 'owner' && <Crown size={13} className="ml-1 inline text-ember" />}
                </p>
                <p className="truncate text-sm text-fg/50">{u.email}</p>
              </div>
              {!u.active && <span className="chip bg-fg/10 text-fg/60">Deactivated</span>}
              {editable ? (
                <>
                  <select aria-label={`Role for ${u.name}`} className="input w-auto py-1.5" value={u.role} onChange={(e) => act('team.update', { id: u.id, role: e.target.value })}>
                    {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                  {me.role === 'owner' && u.active && u.role !== 'guest' && (
                    <button className="btn-outline py-1" title="Make this person the workspace owner" onClick={() => transfer(u)}><Crown size={14} /></button>
                  )}
                  <button className={u.active ? 'btn-danger' : 'btn-outline'}
                    onClick={() => (u.active ? window.confirm(`Deactivate ${u.name}? They will no longer be able to sign in.`) : true) && act('team.update', { id: u.id, active: !u.active })}>
                    {u.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </>
              ) : (
                <span className="chip bg-fg/5 text-fg/60">{ROLE_LABEL[u.role]}</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="card mt-6 p-5">
        <p className="font-bold">What each role can do</p>
        <ul className="mt-2 space-y-1.5 text-sm text-fg/60">
          {(['owner', 'admin', 'manager', 'member', 'guest'] as Role[]).map((r) => (
            <li key={r}><span className="font-semibold text-fg">{ROLE_LABEL[r]}:</span> {ROLE_BLURB[r]}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-fg/45">Every one of these limits is enforced on the server, not just hidden in the interface.</p>
      </div>

      {open && (
        <Modal open onClose={() => setOpen(false)} title="Invite people" wide>
          <div className="border-b border-line px-5">
            <nav className="-mb-px flex gap-1">
              {([['invite', 'By email'], ['links', 'Shared links']] as const).map(([id, label]) => (
                (id === 'links' && !isAdmin) ? null : (
                  <button key={id} onClick={() => setTab(id)} className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab === id ? 'border-ember text-fg' : 'border-transparent text-fg/50 hover:text-fg'}`}>{label}</button>
                )
              ))}
            </nav>
          </div>
          {tab === 'invite' ? <InviteForm onDone={() => mutate()} /> : <SharedLinks />}
        </Modal>
      )}
    </div>
  );
}
