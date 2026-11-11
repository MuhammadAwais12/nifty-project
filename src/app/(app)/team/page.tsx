'use client';
import { useState } from 'react';
import { Crown, Link2, Mail, MessageSquare, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { act, toast, useQ } from '@/lib/api';
import { Avatar, ROLE_BLURB, ROLE_LABEL, fmtDateTime, useApp, type Role } from '@/components/ui';
import { GRANTABLE, InviteModal } from '@/components/InviteModal';

export default function Team() {
  const router = useRouter();
  const { me, users, canManage, isAdmin } = useApp();
  const [open, setOpen] = useState(false);
  const { data: pending, mutate } = useQ<any[]>(canManage ? 'invite.list' : null);

  const team = users.filter((u) => u.role !== 'guest');
  const guests = users.filter((u) => u.role === 'guest');
  const roles = GRANTABLE[me.role] || [];

  async function transfer(u: any) {
    if (!window.confirm(`Make ${u.name} the workspace owner? You become an admin and cannot undo this yourself.`)) return;
    await act('team.transfer', { id: u.id });
  }
  async function message(u: any) {
    const res = await act('dm.open', { userIds: [u.id] });
    if (res) router.push(`/chat?c=${res.id}`);
  }

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h-page">Team</h1>
          <p className="mt-1 text-sm text-fg/55">
            {team.filter((u) => u.active).length} team {team.filter((u) => u.active).length === 1 ? 'member' : 'members'} and {guests.filter((u) => u.active).length} {guests.filter((u) => u.active).length === 1 ? 'guest' : 'guests'}
            {pending?.length ? `, ${pending.length} invitation${pending.length === 1 ? '' : 's'} waiting to be accepted` : ''}.
          </p>
        </div>
        {canManage && <button className="btn-primary" onClick={() => setOpen(true)}><Mail size={15} /> Invite people</button>}
      </div>

      <div className="card mt-6 divide-y divide-line">
        {users.map((u) => {
          const editable = isAdmin && u.role !== 'owner' && u.id !== me.id;
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
              {u.id !== me.id && u.active && u.role !== 'guest' && me.role !== 'guest' && (
                <button className="btn-outline py-1" onClick={() => message(u)} title={`Message ${u.name}`}><MessageSquare size={14} /> Message</button>
              )}
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

        {/* people who have been invited but have not signed up yet */}
        {canManage && pending?.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center gap-3 bg-paper/60 px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-fg/25 text-fg/40"><Mail size={15} /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-fg/70">{i.email}</p>
              <p className="truncate text-xs text-fg/45">Invited {fmtDateTime(i.created_at)} · expires {new Date(i.expires_at).toLocaleDateString()} · they appear here properly once they accept</p>
            </div>
            <span className="chip bg-amber-500/15 text-amber-600">Invitation sent</span>
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

      <div className="card mt-6 p-5">
        <p className="font-bold">What each role can do</p>
        <ul className="mt-2 space-y-1.5 text-sm text-fg/60">
          {(['owner', 'admin', 'manager', 'member', 'guest'] as Role[]).map((r) => (
            <li key={r}><span className="font-semibold text-fg">{ROLE_LABEL[r]}:</span> {ROLE_BLURB[r]}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-fg/45">Every one of these limits is enforced on the server, not just hidden in the interface. Being on the team is separate from being on a project — add people to projects with the Members button inside each project.</p>
      </div>

      {open && <InviteModal onClose={() => { setOpen(false); mutate(); }} />}
    </div>
  );
}
