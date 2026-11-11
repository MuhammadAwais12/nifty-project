'use client';
import { useState } from 'react';
import { Check, Search } from 'lucide-react';
import { act } from '@/lib/api';
import { Avatar, Modal, ROLE_LABEL, useApp } from './ui';

/** Choose who can see and work on a project. */
export function MembersModal({ projectId, members, onClose }: { projectId: string; members: string[]; onClose: () => void }) {
  const { users, me } = useApp();
  const [q, setQ] = useState('');
  const list = users
    .filter((u) => u.active && u.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Number(members.includes(b.id)) - Number(members.includes(a.id)) || a.name.localeCompare(b.name));
  return (
    <Modal open onClose={onClose} title="Project members">
      <div className="p-5">
        <p className="mb-3 text-sm text-fg/55">Only members see this project. Admins and the owner can open every project. Guests are clients with view and comment access.</p>
        <div className="relative mb-2">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg/35" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" className="input pl-8" />
        </div>
        <div className="max-h-80 space-y-0.5 overflow-y-auto">
          {list.map((u) => {
            const on = members.includes(u.id);
            return (
              <button key={u.id} aria-pressed={on} onClick={() => act('member.set', { projectId, userId: u.id, on: !on })}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm ${on ? 'bg-ember/15 text-ember' : 'hover:bg-fg/5'}`}>
                <Avatar user={u} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{u.name} {u.id === me.id && <span className="font-medium text-fg/40">(you)</span>}</span>
                  <span className="block truncate text-xs text-fg/45">{ROLE_LABEL[u.role]}</span>
                </span>
                {on && <Check size={16} className="text-ember" />}
              </button>
            );
          })}
          {!list.length && <p className="px-2 py-4 text-sm text-fg/45">No one matches that search.</p>}
        </div>
        <div className="mt-4 flex justify-end">
          <button className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </Modal>
  );
}
