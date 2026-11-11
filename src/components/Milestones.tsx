'use client';
import { useState } from 'react';
import { Flag, Plus } from 'lucide-react';
import { act } from '@/lib/api';
import { COLORS, ColorPicker, Empty, Modal, Progress, addDays, confirmDelete, daysBetween, fmtDate, parseYmd, today, useApp, ymd } from './ui';

function MilestoneForm({ projectId, milestone, onClose }: { projectId: string; milestone?: any; onClose: () => void }) {
  const [form, setForm] = useState({
    name: milestone?.name || '',
    description: milestone?.description || '',
    start_date: milestone?.start_date || today(),
    end_date: milestone?.end_date || addDays(today(), 14),
    color: milestone?.color || COLORS[1],
  });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ok = milestone ? await act('milestone.update', { id: milestone.id, ...form }) : await act('milestone.create', { projectId, ...form });
    if (ok) onClose();
  }
  return (
    <Modal open onClose={onClose} title={milestone ? 'Edit milestone' : 'New milestone'}>
      <form onSubmit={submit} className="space-y-4 p-5">
        <div>
          <label className="label" htmlFor="m-name">Name</label>
          <input id="m-name" className="input" autoFocus required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Site audit delivered" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="m-start">Start</label>
            <input id="m-start" type="date" className="input" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="m-end">End</label>
            <input id="m-end" type="date" className="input" required min={form.start_date} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="m-desc">Notes</label>
          <textarea id="m-desc" className="input min-h-[60px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <span className="label">Color</span>
          <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
        </div>
        <div className="flex items-center gap-2 pt-1">
          {milestone && (
            <button type="button" className="btn-danger" onClick={async () => { if (confirmDelete(`the milestone "${milestone.name}"`)) { await act('milestone.delete', { id: milestone.id }); onClose(); } }}>
              Delete
            </button>
          )}
          <span className="flex-1" />
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary">{milestone ? 'Save' : 'Add milestone'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function Milestones({ data }: { data: any }) {
  const { canEdit } = useApp();
  const [editing, setEditingRaw] = useState<any | null | 'new'>(null);
  const setEditing = (v: any | null | 'new') => (canEdit || v === null) && setEditingRaw(v);
  const list: any[] = data.milestones;

  if (!list.length) {
    return (
      <div className="p-4 sm:p-6">
        <Empty icon={<Flag size={32} />} title="No milestones yet" hint="Milestones mark the big delivery dates. Link tasks to them and progress updates on its own."
          action={canEdit ? <button className="btn-primary" onClick={() => setEditing('new')}><Plus size={14} /> Add milestone</button> : undefined} />
        {editing && <MilestoneForm projectId={data.project.id} onClose={() => setEditing(null)} />}
      </div>
    );
  }

  // timeline range: first day of the earliest month to last day of the latest month
  const min = list.reduce((a, m) => (m.start_date < a ? m.start_date : a), list[0].start_date);
  const max = list.reduce((a, m) => (m.end_date > a ? m.end_date : a), list[0].end_date);
  const first = parseYmd(min); first.setDate(1);
  const last = parseYmd(max); last.setMonth(last.getMonth() + 1, 0);
  const rangeStart = ymd(first);
  const total = daysBetween(rangeStart, ymd(last)) + 1;
  const months: { label: string; left: number; width: number }[] = [];
  for (let d = new Date(first); d <= last; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    months.push({
      label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      left: (daysBetween(rangeStart, ymd(d)) / total) * 100,
      width: ((daysBetween(ymd(d), ymd(end)) + 1) / total) * 100,
    });
  }
  const todayPos = (daysBetween(rangeStart, today()) + 0.5) / total * 100;
  const minWidth = Math.max(640, months.length * 150);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold tracking-tight">Roadmap</h2>
        {canEdit && <button className="btn-primary" onClick={() => setEditing('new')}><Plus size={14} /> Add milestone</button>}
      </div>

      <div className="card overflow-x-auto">
        <div style={{ minWidth }} className="relative">
          <div className="relative h-8 border-b border-line">
            {months.map((m) => (
              <div key={m.label} className="absolute top-0 flex h-full items-center border-l border-line px-2 text-[11px] font-bold uppercase tracking-wide text-fg/45" style={{ left: `${m.left}%`, width: `${m.width}%` }}>
                {m.label}
              </div>
            ))}
          </div>
          <div className="relative py-2">
            {months.map((m) => (
              <div key={m.label} className="absolute bottom-0 top-0 border-l border-line/70" style={{ left: `${m.left}%` }} />
            ))}
            {todayPos >= 0 && todayPos <= 100 && (
              <div className="absolute bottom-0 top-0 z-10 w-px bg-ember" style={{ left: `${todayPos}%` }}>
                <span className="absolute -top-0.5 left-1 rounded bg-ember px-1 text-[9px] font-bold uppercase text-white">Today</span>
              </div>
            )}
            {list.map((m) => {
              const left = (daysBetween(rangeStart, m.start_date) / total) * 100;
              const width = ((daysBetween(m.start_date, m.end_date) + 1) / total) * 100;
              const pct = m.task_count ? Math.round((m.done_count / m.task_count) * 100) : 0;
              return (
                <div key={m.id} className="relative h-11">
                  <button
                    onClick={() => setEditing(m)}
                    title={`${m.name}: ${fmtDate(m.start_date)} to ${fmtDate(m.end_date)}`}
                    className="absolute top-1.5 h-8 overflow-hidden rounded-lg text-left shadow-card transition-transform hover:scale-y-105"
                    style={{ left: `${left}%`, width: `${width}%`, minWidth: 28, background: `${m.color}33` }}
                  >
                    <span className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: m.color }} />
                    <span className="relative block truncate px-2 text-xs font-bold leading-8 text-fg">{m.name}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((m) => {
          const pct = m.task_count ? Math.round((m.done_count / m.task_count) * 100) : 0;
          const late = m.end_date < today() && pct < 100;
          return (
            <button key={m.id} onClick={() => setEditing(m)} className="card p-4 text-left hover:border-fg/25">
              <div className="flex items-start gap-2">
                <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: m.color }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{m.name}</p>
                  <p className={`text-xs font-semibold ${late ? 'text-red-600' : 'text-fg/50'}`}>
                    {fmtDate(m.start_date)} – {fmtDate(m.end_date)} {late && '· overdue'}
                  </p>
                </div>
                <span className="text-sm font-extrabold tabular-nums">{pct}%</span>
              </div>
              <Progress value={pct} color={m.color} className="mt-3" />
              <p className="mt-2 text-xs text-fg/50">
                {m.task_count ? `${m.done_count} of ${m.task_count} tasks complete` : 'No tasks linked yet. Set a task’s milestone to track progress.'}
              </p>
              {m.description && <p className="mt-2 line-clamp-2 text-sm text-fg/65">{m.description}</p>}
            </button>
          );
        })}
      </div>

      {editing && <MilestoneForm projectId={data.project.id} milestone={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
