'use client';
import { useState } from 'react';
import { useQ } from '@/lib/api';
import { Avatar, Spinner, addDays, fmtDate, fmtDur, today, useApp, ymd } from '@/components/ui';

const RANGES: Record<string, { label: string; get: () => [string, string] }> = {
  week: { label: 'This week', get: () => { const d = new Date(); const s = new Date(d); s.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [ymd(s), today()]; } },
  month: { label: 'This month', get: () => { const d = new Date(); return [ymd(new Date(d.getFullYear(), d.getMonth(), 1)), today()]; } },
  last30: { label: 'Last 30 days', get: () => [addDays(today(), -29), today()] },
  last90: { label: 'Last 90 days', get: () => [addDays(today(), -89), today()] },
};

function Bars({ rows }: { rows: { key: string; label: React.ReactNode; seconds: number; color: string }[] }) {
  const top = Math.max(1, ...rows.map((r) => r.seconds));
  if (!rows.length) return <p className="text-sm text-fg/45">No time logged in this period.</p>;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-3 text-sm">
          <span className="flex w-40 min-w-0 items-center gap-2 font-semibold">{r.label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-fg/10"><div className="h-full rounded-full" style={{ width: `${(r.seconds / top) * 100}%`, background: r.color }} /></div>
          <span className="w-16 text-right font-bold tabular-nums">{fmtDur(r.seconds)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Reports() {
  const { users, projects } = useApp();
  const [range, setRange] = useState('month');
  const [from, to] = RANGES[range].get();
  const { data } = useQ('report.summary', { from, to });
  if (!data) return <Spinner />;

  const byUser: Record<string, number> = {};
  const byProject: Record<string, number> = {};
  let total = 0;
  for (const r of data.time) {
    byUser[r.user_id] = (byUser[r.user_id] || 0) + r.seconds;
    byProject[r.project_id] = (byProject[r.project_id] || 0) + r.seconds;
    total += r.seconds;
  }
  const userRows = Object.entries(byUser).sort((a, b) => b[1] - a[1]).map(([id, seconds]) => {
    const u = users.find((x) => x.id === id);
    return { key: id, seconds, color: u?.color || '#999', label: <><Avatar user={u} size={22} /><span className="truncate">{u?.name || 'Former member'}</span></> };
  });
  const projectRows = Object.entries(byProject).sort((a, b) => b[1] - a[1]).map(([id, seconds]) => {
    const p = projects.find((x) => x.id === id);
    return { key: id, seconds, color: p?.color || '#999', label: <><span className="h-2.5 w-2.5 shrink-0 rounded-[4px]" style={{ background: p?.color }} /><span className="truncate">{p?.name || 'Deleted project'}</span></> };
  });
  const workload = [...data.workload].sort((a: any, b: any) => b.open - a.open);
  const maxOpen = Math.max(1, ...workload.map((w: any) => w.open));
  const completed = workload.reduce((a: number, w: any) => a + w.completed, 0);

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h-page">Reports</h1>
          <p className="mt-1 text-sm text-fg/55">{fmtDate(from)} – {fmtDate(to)}</p>
        </div>
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {Object.entries(RANGES).map(([k, r]) => (
            <button key={k} onClick={() => setRange(k)} className={`rounded-md px-2.5 py-1 text-sm font-semibold ${range === k ? 'bg-ink text-white' : 'text-fg/60 hover:text-fg'}`}>{r.label}</button>
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card p-4"><p className="label">Time logged</p><p className="text-3xl font-extrabold tabular-nums tracking-tight">{fmtDur(total)}</p></div>
        <div className="card p-4"><p className="label">Tasks completed</p><p className="text-3xl font-extrabold tabular-nums tracking-tight">{completed}</p></div>
        <div className="card col-span-2 p-4 sm:col-span-1"><p className="label">Open tasks now</p><p className="text-3xl font-extrabold tabular-nums tracking-tight">{projects.filter((p) => !p.archived).reduce((a, p) => a + p.task_count - p.done_count, 0)}</p></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5"><h2 className="mb-4 font-bold">Time by member</h2><Bars rows={userRows} /></div>
        <div className="card p-5"><h2 className="mb-4 font-bold">Time by project</h2><Bars rows={projectRows} /></div>
      </div>

      <div className="card mt-4 overflow-x-auto p-5">
        <h2 className="mb-1 font-bold">Team workload</h2>
        <p className="mb-4 text-sm text-fg/55">Open tasks per person right now, and what they finished in this period.</p>
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-bold uppercase tracking-wide text-fg/45">
              <th className="py-2">Member</th><th className="py-2">Open tasks</th><th className="py-2 text-right">Overdue</th><th className="py-2 text-right">Completed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {workload.map((w: any) => {
              const u = users.find((x) => x.id === w.user_id);
              return (
                <tr key={w.user_id}>
                  <td className="py-2.5"><span className="flex items-center gap-2 font-semibold"><Avatar user={u} size={24} /> {u?.name}</span></td>
                  <td className="py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-40 overflow-hidden rounded-full bg-fg/10"><span className="block h-full rounded-full bg-ink" style={{ width: `${(w.open / maxOpen) * 100}%` }} /></span>
                      <span className="font-bold tabular-nums">{w.open}</span>
                    </span>
                  </td>
                  <td className={`py-2.5 text-right font-bold tabular-nums ${w.overdue ? 'text-red-600' : 'text-fg/35'}`}>{w.overdue}</td>
                  <td className="py-2.5 text-right font-bold tabular-nums text-emerald-700">{w.completed}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
