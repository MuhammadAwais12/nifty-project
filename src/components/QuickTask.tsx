'use client';
import { useState } from 'react';
import { act } from '@/lib/api';
import { Avatar, Modal, useApp } from './ui';

/** Create a task from anywhere, without opening the project first. */
export function QuickTask({ onClose, projectId }: { onClose: () => void; projectId?: string }) {
  const { projects, users, openTask } = useApp();
  const open = projects.filter((p: any) => !p.archived);
  const [form, setForm] = useState({
    projectId: projectId || open[0]?.id || '',
    title: '',
    dueDate: '',
    assignees: [] as string[],
  });
  const [busy, setBusy] = useState(false);

  const project = open.find((p: any) => p.id === form.projectId);
  const people = users.filter((u) => u.active && u.role !== 'guest' && (project?.member_ids || []).includes(u.id));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await act('task.create', { ...form, dueDate: form.dueDate || null });
    setBusy(false);
    if (!res) return;
    onClose();
    openTask(res.id);
  }

  if (!open.length) {
    return (
      <Modal open onClose={onClose} title="New task">
        <p className="p-5 text-sm text-fg/60">Create a project first — tasks live inside projects.</p>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="New task">
      <form onSubmit={submit} className="space-y-4 p-5">
        <div>
          <label className="label" htmlFor="qt-title">Task</label>
          <input id="qt-title" className="input" autoFocus required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What needs doing?" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="qt-project">Project</label>
            <select id="qt-project" className="input" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value, assignees: [] })}>
              {open.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="qt-due">Due date</label>
            <input id="qt-due" type="date" className="input" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
        </div>
        <div>
          <span className="label">Assign to</span>
          {!people.length && <p className="text-sm text-fg/50">Nobody is on this project yet.</p>}
          <div className="flex flex-wrap gap-1.5">
            {people.map((u) => {
              const on = form.assignees.includes(u.id);
              return (
                <button key={u.id} type="button" aria-pressed={on}
                  onClick={() => setForm({ ...form, assignees: on ? form.assignees.filter((x) => x !== u.id) : [...form.assignees, u.id] })}
                  className={`inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-xs font-semibold ring-1 ${on ? 'bg-ember/15 text-ember ring-ember/50' : 'ring-line hover:bg-fg/5'}`}>
                  <Avatar user={u} size={20} ring={false} /> {u.name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy || !form.title.trim()}>Create task</button>
        </div>
      </form>
    </Modal>
  );
}
