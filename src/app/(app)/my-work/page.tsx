'use client';
import { CheckSquare, Circle } from 'lucide-react';
import { act, useQ } from '@/lib/api';
import { Empty, PriorityFlag, Spinner, addDays, fmtDate, today, useApp } from '@/components/ui';

export default function MyWork() {
  const { openTask, canEdit } = useApp();
  const { data } = useQ<any[]>('mywork', undefined, { refreshInterval: 30000 });
  if (!data) return <Spinner />;

  const t = today();
  const week = addDays(t, 7);
  const buckets: [string, any[], string][] = [
    ['Overdue', data.filter((x) => x.due_date && x.due_date < t), 'text-red-600'],
    ['Today', data.filter((x) => x.due_date === t), 'text-ember'],
    ['Next 7 days', data.filter((x) => x.due_date && x.due_date > t && x.due_date <= week), ''],
    ['Later', data.filter((x) => x.due_date && x.due_date > week), ''],
    ['No due date', data.filter((x) => !x.due_date), ''],
  ];

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-8">
      <h1 className="h-page">My work</h1>
      <p className="mb-6 mt-1 text-sm text-fg/55">{data.length} open {data.length === 1 ? 'task' : 'tasks'} assigned to you across all projects.</p>
      {!data.length && <Empty icon={<CheckSquare size={36} />} title="You're all caught up" hint="Tasks assigned to you will show up here, grouped by due date." />}
      {buckets.filter(([, list]) => list.length).map(([label, list, tone]) => (
        <section key={label} className="mb-6">
          <h2 className={`mb-2 text-sm font-bold ${tone}`}>{label} <span className="font-semibold text-fg/40">{list.length}</span></h2>
          <div className="card divide-y divide-line overflow-hidden">
            {list.map((x) => (
              <div key={x.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-paper/70">
                <button hidden={!canEdit} onClick={() => act('task.update', { id: x.id, patch: { done: true } })} aria-label="Complete task" title="Mark complete">
                  <Circle size={18} className="text-fg/30 hover:text-emerald-600" />
                </button>
                <button onClick={() => openTask(x.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-semibold">{x.title}</span>
                  <span className="flex items-center gap-1.5 text-xs text-fg/50">
                    <span className="h-2 w-2 rounded-[3px]" style={{ background: x.project_color }} /> <span className="truncate">{x.project_name}</span> · {x.status_name}
                  </span>
                </button>
                <PriorityFlag priority={x.priority} />
                <span className={`w-16 text-right text-xs font-semibold ${tone || 'text-fg/50'}`}>{fmtDate(x.due_date)}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
