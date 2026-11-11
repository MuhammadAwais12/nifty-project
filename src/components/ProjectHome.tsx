'use client';
import { AlertTriangle, CheckCircle2, CircleDashed, Flag } from 'lucide-react';
import { Avatar, AvatarStack, Progress, fmtDate, fmtDateTime, isOverdue, today, useApp } from './ui';

export function ProjectHome({ data, goTo }: { data: any; goTo: (tab: string) => void }) {
  const { users, openTask } = useApp();
  const tasks: any[] = data.tasks;
  const done = tasks.filter((t) => t.completed_at).length;
  const open = tasks.length - done;
  const overdue = tasks.filter(isOverdue);
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const upcoming = tasks.filter((t) => !t.completed_at && t.due_date && t.due_date >= today()).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 6);
  const milestones = data.milestones.filter((m: any) => m.end_date >= today() || m.done_count < m.task_count).slice(0, 4);
  const memberIds: string[] = data.members || [];

  const stats = [
    { label: 'Open tasks', value: open, icon: CircleDashed, tone: 'text-fg' },
    { label: 'Completed', value: done, icon: CheckCircle2, tone: 'text-emerald-600' },
    { label: 'Overdue', value: overdue.length, icon: AlertTriangle, tone: overdue.length ? 'text-red-600' : 'text-fg/40' },
  ];

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="label">Project progress</p>
                <p className="text-4xl font-extrabold tabular-nums tracking-tight">{pct}%</p>
              </div>
              {memberIds.length > 0 && <AvatarStack ids={memberIds} size={28} max={6} />}
            </div>
            <Progress value={pct} color={data.project.color} className="mt-3 h-2" />
            {data.project.description && <p className="mt-4 text-sm leading-relaxed text-fg/65">{data.project.description}</p>}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {stats.map((s) => (
              <button key={s.label} onClick={() => goTo('tasks')} className="card p-4 text-left hover:border-fg/25">
                <s.icon size={18} className={s.tone} />
                <p className={`mt-2 text-2xl font-extrabold tabular-nums ${s.tone}`}>{s.value}</p>
                <p className="text-xs font-semibold text-fg/50">{s.label}</p>
              </button>
            ))}
          </div>

          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold">Due next</h3>
              <button className="text-sm font-semibold text-ember hover:underline" onClick={() => goTo('tasks')}>All tasks</button>
            </div>
            {[...overdue.slice(0, 4), ...upcoming].length === 0 && <p className="text-sm text-fg/45">Nothing scheduled. Add due dates to tasks to see them here.</p>}
            <div className="divide-y divide-line">
              {[...overdue.slice(0, 4), ...upcoming].map((t) => (
                <button key={t.id} onClick={() => openTask(t.id)} className="flex w-full items-center gap-3 py-2 text-left hover:text-ember">
                  <span className={`w-16 shrink-0 text-xs font-bold ${isOverdue(t) ? 'text-red-600' : 'text-fg/50'}`}>{fmtDate(t.due_date)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.title}</span>
                  <AvatarStack ids={t.assignees || []} max={2} />
                </button>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold">Milestones</h3>
              <button className="text-sm font-semibold text-ember hover:underline" onClick={() => goTo('milestones')}>Roadmap</button>
            </div>
            {milestones.length === 0 && <p className="text-sm text-fg/45">No active milestones.</p>}
            <div className="space-y-3">
              {milestones.map((m: any) => {
                const p = m.task_count ? Math.round((m.done_count / m.task_count) * 100) : 0;
                return (
                  <div key={m.id}>
                    <div className="flex items-center gap-2 text-sm">
                      <Flag size={13} style={{ color: m.color }} fill={m.color} />
                      <span className="min-w-0 flex-1 truncate font-semibold">{m.name}</span>
                      <span className="text-xs text-fg/50">{fmtDate(m.end_date)}</span>
                      <span className="w-9 text-right text-xs font-bold tabular-nums">{p}%</span>
                    </div>
                    <Progress value={p} color={m.color} className="mt-1.5" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="card h-fit p-5">
          <h3 className="mb-3 font-bold">Recent activity</h3>
          {data.activity.length === 0 && <p className="text-sm text-fg/45">No activity yet.</p>}
          <div className="space-y-3">
            {data.activity.map((a: any) => {
              const u = users.find((x) => x.id === a.user_id);
              return (
                <div key={a.id} className="flex gap-2.5">
                  <Avatar user={u} size={24} />
                  <div className="min-w-0">
                    <p className="break-words text-sm leading-snug"><span className="font-bold">{u?.name.split(' ')[0] || 'Someone'}</span> {a.text}</p>
                    <p className="text-[11px] text-fg/40">{fmtDateTime(a.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
