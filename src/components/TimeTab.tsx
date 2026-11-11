'use client';
import { useState } from 'react';
import { Clock, Play, Plus, Square, Trash2 } from 'lucide-react';
import { act, useQ } from '@/lib/api';
import { Avatar, Empty, Modal, Spinner, fmtDur, today, useApp, useNow, ymd } from './ui';

function LogForm({ projectId, tasks, onClose }: { projectId: string; tasks: any[]; onClose: () => void }) {
  const [form, setForm] = useState({ date: today(), hours: '1', minutes: '0', taskId: '', note: '' });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const minutes = (parseInt(form.hours, 10) || 0) * 60 + (parseInt(form.minutes, 10) || 0);
    if (await act('time.add', { projectId, taskId: form.taskId || null, date: form.date, minutes, note: form.note })) onClose();
  }
  return (
    <Modal open onClose={onClose} title="Log time">
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label" htmlFor="lt-date">Date</label>
            <input id="lt-date" type="date" className="input px-2" required max={today()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="lt-h">Hours</label>
            <input id="lt-h" type="number" min={0} max={24} className="input" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="lt-m">Minutes</label>
            <input id="lt-m" type="number" min={0} max={59} className="input" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="lt-task">Task (optional)</label>
          <select id="lt-task" className="input" value={form.taskId} onChange={(e) => setForm({ ...form, taskId: e.target.value })}>
            <option value="">General project time</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="lt-note">Note</label>
          <input id="lt-note" className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="What did you work on?" />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary">Log time</button>
        </div>
      </form>
    </Modal>
  );
}

export function TimeTab({ data }: { data: any }) {
  const { users, me, timer, isAdmin, openTask } = useApp();
  const projectId = data.project.id;
  const { data: entries } = useQ<any[]>('time.list', { projectId }, { refreshInterval: 30000 });
  const [logging, setLogging] = useState(false);
  const runningHere = timer?.project_id === projectId;
  const now = useNow(!!entries?.some((e) => !e.ended_at));

  if (!entries) return <Spinner />;
  const secs = (e: any) => (e.ended_at ? e.seconds : Math.max(0, (now - new Date(e.started_at).getTime()) / 1000));
  const total = entries.reduce((a, e) => a + secs(e), 0);
  const byUser: Record<string, number> = {};
  for (const e of entries) byUser[e.user_id] = (byUser[e.user_id] || 0) + secs(e);
  const top = Math.max(1, ...Object.values(byUser));

  return (
    <div className="h-full space-y-5 overflow-y-auto p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-extrabold tracking-tight">Time tracking</h2>
        <button className="btn-outline" onClick={() => setLogging(true)}><Plus size={14} /> Log time</button>
        {runningHere ? (
          <button className="btn bg-ember text-white" onClick={() => act('time.stop')}><Square size={12} fill="currentColor" /> Stop timer</button>
        ) : (
          <button className="btn-dark" onClick={() => act('time.start', { projectId })}><Play size={12} fill="currentColor" /> Start timer</button>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-[240px_1fr]">
        <div className="card p-4">
          <p className="label">Total logged</p>
          <p className="text-3xl font-extrabold tabular-nums tracking-tight">{fmtDur(total)}</p>
        </div>
        <div className="card space-y-2 p-4">
          <p className="label">By member</p>
          {Object.keys(byUser).length === 0 && <p className="text-sm text-fg/45">No time logged yet.</p>}
          {Object.entries(byUser).sort((a, b) => b[1] - a[1]).map(([uid, s]) => {
            const u = users.find((x) => x.id === uid);
            return (
              <div key={uid} className="flex items-center gap-2 text-sm">
                <Avatar user={u} size={22} />
                <span className="w-28 truncate font-semibold">{u?.name || 'Former member'}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-fg/10"><div className="h-full rounded-full" style={{ width: `${(s / top) * 100}%`, background: u?.color || '#999' }} /></div>
                <span className="w-16 text-right font-bold tabular-nums">{fmtDur(s)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {!entries.length ? (
        <Empty icon={<Clock size={32} />} title="No time entries yet" hint="Start a timer here or from any task, or log time after the fact." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-bold uppercase tracking-wide text-fg/45">
                <th className="px-4 py-2">Member</th><th className="px-2 py-2">Task</th><th className="px-2 py-2">Date</th><th className="px-2 py-2 text-right">Duration</th><th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {entries.map((e) => {
                const u = users.find((x) => x.id === e.user_id);
                return (
                  <tr key={e.id} className="group hover:bg-paper/70">
                    <td className="px-4 py-2"><span className="flex items-center gap-2"><Avatar user={u} size={22} /> <span className="font-semibold">{u?.name || 'Former member'}</span></span></td>
                    <td className="max-w-[280px] px-2 py-2">
                      {e.task_id ? <button className="block max-w-full truncate font-medium hover:text-ember" onClick={() => openTask(e.task_id)}>{e.task_title}</button> : <span className="text-fg/45">General project time</span>}
                      {e.note && <span className="block truncate text-xs text-fg/45">{e.note}</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-fg/60">{new Date(e.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: ymd(new Date(e.started_at)).slice(0, 4) === today().slice(0, 4) ? undefined : 'numeric' })}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-bold tabular-nums">
                      {!e.ended_at && <span className="chip mr-2 bg-ember/15 text-ember">Running</span>}
                      {fmtDur(secs(e))}
                    </td>
                    <td className="pr-2 text-right">
                      {(e.user_id === me.id || isAdmin) && (
                        <button className="icon-btn opacity-0 hover:text-red-600 group-hover:opacity-100 focus:opacity-100" aria-label="Delete time entry" onClick={() => window.confirm('Delete this time entry?') && act('time.delete', { id: e.id })}><Trash2 size={14} /></button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {logging && <LogForm projectId={projectId} tasks={data.tasks} onClose={() => setLogging(false)} />}
    </div>
  );
}
