'use client';
import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Flag, FolderKanban, Plus } from 'lucide-react';
import { Empty, Progress, fmtDate, useApp } from '@/components/ui';
import { ProjectForm } from '@/components/ProjectForm';

function ProjectCard({ p }: { p: any }) {
  const pct = p.task_count ? Math.round((p.done_count / p.task_count) * 100) : 0;
  return (
    <Link href={`/projects/${p.id}`} className="card group block overflow-hidden hover:border-fg/25">
      <div className="h-1.5" style={{ background: p.color }} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 truncate font-bold group-hover:text-ember">{p.name}</h3>
          <span className="text-sm font-extrabold tabular-nums">{pct}%</span>
        </div>
        <p className="mt-0.5 line-clamp-2 min-h-[2.5rem] text-sm text-fg/55">{p.description || `${p.task_count} ${p.task_count === 1 ? 'task' : 'tasks'} in this project`}</p>
        <Progress value={pct} color={p.color} className="mt-3" />
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-fg/50">
          <span>{p.task_count - p.done_count} open</span>
          {p.overdue_count > 0 && <span className="inline-flex items-center gap-1 text-red-600"><AlertTriangle size={12} /> {p.overdue_count} overdue</span>}
          {p.next_milestone && <span className="ml-auto inline-flex min-w-0 items-center gap-1"><Flag size={12} /> <span className="truncate">{p.next_milestone.name}</span> · {fmtDate(p.next_milestone.end_date)}</span>}
        </div>
      </div>
    </Link>
  );
}

export default function Overview() {
  const { me, projects, canEdit, canManage } = useApp();
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);
  const groups: Record<string, any[]> = {};
  for (const p of active) (groups[p.portfolio || 'Other projects'] ||= []).push(p);
  const names = Object.keys(groups).sort((a, b) => (a === 'Other projects' ? 1 : b === 'Other projects' ? -1 : a.localeCompare(b)));
  const hour = new Date().getHours();
  const totals = active.reduce((a, p) => ({ open: a.open + p.task_count - p.done_count, overdue: a.overdue + p.overdue_count }), { open: 0, overdue: 0 });

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h-page">Good {hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, {me.name.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-fg/55">
            {active.length} active {active.length === 1 ? 'project' : 'projects'} · {totals.open} open tasks
            {totals.overdue > 0 && <span className="font-semibold text-red-600"> · {totals.overdue} overdue</span>}
          </p>
        </div>
        {canManage && <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> New project</button>}
      </div>

      {!active.length && (
        <Empty icon={<FolderKanban size={36} />} title={canEdit ? 'No projects here yet' : 'No projects shared with you yet'}
          hint={canEdit ? 'A project holds tasks, milestones, discussions, docs, files and tracked time for one client or initiative. You only see projects you are a member of.' : 'Once the team adds you to a project, it will appear here.'}
          action={canManage ? <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> New project</button> : undefined} />
      )}

      {names.map((g) => (
        <section key={g} className="mb-8">
          {(names.length > 1 || g !== 'Other projects') && <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-fg/45">{g}</h2>}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {groups[g].map((p) => <ProjectCard key={p.id} p={p} />)}
          </div>
        </section>
      ))}

      {archived.length > 0 && (
        <section>
          <button className="mb-3 text-sm font-semibold text-fg/50 hover:text-fg" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Hide' : 'Show'} archived projects ({archived.length})
          </button>
          {showArchived && <div className="grid gap-4 opacity-70 sm:grid-cols-2 xl:grid-cols-3">{archived.map((p) => <ProjectCard key={p.id} p={p} />)}</div>}
        </section>
      )}
      {creating && <ProjectForm onClose={() => setCreating(false)} />}
    </div>
  );
}
