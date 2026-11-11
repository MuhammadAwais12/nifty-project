'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, CheckCircle2, Circle, Columns3, GanttChart, List, Lock, MessageSquare, MoreHorizontal, Paperclip, Plus, Repeat, Rows3, Search, ListChecks } from 'lucide-react';
import { act } from '@/lib/api';
import { Avatar, AvatarStack, Menu, MenuItem, PriorityFlag, addDays, daysBetween, fmtDate, isOverdue, parseYmd, today, useApp, ymd } from './ui';

type View = 'board' | 'list' | 'calendar' | 'timeline' | 'swimlane';

export function Tasks({ data }: { data: any }) {
  const { me, openTask, canEdit } = useApp();
  const projectId = data.project.id;
  const [view, setView] = useState<View>('board');
  const [query, setQuery] = useState('');
  const [mine, setMine] = useState(false);
  const [milestone, setMilestone] = useState('');
  const [tasks, setTasks] = useState<any[]>(data.tasks);
  useEffect(() => setTasks(data.tasks), [data.tasks]);

  useEffect(() => {
    const saved = localStorage.getItem('tt-task-view') as View | null;
    if (saved) setView(saved);
  }, []);
  const pickView = (v: View) => {
    setView(v);
    try { localStorage.setItem('tt-task-view', v); } catch {}
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter(
      (t) =>
        (!q || t.title.toLowerCase().includes(q) || (t.tags || []).some((x: string) => x.toLowerCase().includes(q))) &&
        (!mine || (t.assignees || []).includes(me.id)) &&
        (!milestone || t.milestone_id === milestone)
    );
  }, [tasks, query, mine, milestone, me.id]);

  const milestoneName = (id: string) => data.milestones.find((m: any) => m.id === id);
  const openIds = useMemo(() => new Set(tasks.filter((t) => !t.completed_at).map((t) => t.id)), [tasks]);
  const isBlocked = (t: any) => !t.completed_at && (t.blocked_by || []).some((id: string) => openIds.has(id));
  const taskKey = data.project.key || '';
  const shared = { data, projectId, visible, tasks, setTasks, openTask, milestoneName, milestone, isBlocked, canEdit, taskKey };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {([['board', Columns3, 'Board'], ['list', List, 'List'], ['timeline', GanttChart, 'Timeline'], ['swimlane', Rows3, 'Swimlane'], ['calendar', CalendarDays, 'Calendar']] as const).map(([v, Icon, label]) => (
            <button key={v} onClick={() => pickView(v)} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-semibold ${view === v ? 'bg-ink text-white' : 'text-fg/60 hover:text-fg'}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg/35" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" className="input w-44 py-1.5 pl-8" />
        </div>
        <button onClick={() => setMine(!mine)} className={`btn ${mine ? 'bg-ember/15 text-ember ring-1 ring-ember/40' : 'btn-outline'}`}>My tasks</button>
        {data.milestones.length > 0 && (
          <select value={milestone} onChange={(e) => setMilestone(e.target.value)} aria-label="Filter by milestone" className="input w-auto py-1.5">
            <option value="">All milestones</option>
            {data.milestones.map((m: any) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {view === 'board' && <Board {...shared} />}
        {view === 'list' && <ListView {...shared} />}
        {view === 'calendar' && <CalendarView {...shared} />}
        {view === 'timeline' && <Timeline {...shared} />}
        {view === 'swimlane' && <Swimlanes {...shared} />}
      </div>
    </div>
  );
}

/* ───────────── inline "add task" ───────────── */
function AddTask({ projectId, statusId, milestoneId, dueDate, compact }: { projectId: string; statusId?: string; milestoneId?: string; dueDate?: string; compact?: boolean }) {
  const { canEdit } = useApp();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  if (!canEdit) return null;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return setOpen(false);
    setTitle('');
    await act('task.create', { projectId, statusId, milestoneId: milestoneId || undefined, dueDate, title: t });
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-fg/45 hover:bg-fg/5 hover:text-fg ${compact ? 'justify-center' : ''}`}>
        <Plus size={14} /> Add task
      </button>
    );
  }
  return (
    <form onSubmit={submit}>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => !title.trim() && setOpen(false)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        placeholder="Task title, then Enter" aria-label="New task title" className="input shadow-card" />
    </form>
  );
}

/* ───────────── board (kanban) ───────────── */
function Card({ t, milestoneName, onOpen, blocked, taskKey }: { t: any; milestoneName: (id: string) => any; onOpen: () => void; blocked?: boolean; taskKey?: string }) {
  const m = t.milestone_id && milestoneName(t.milestone_id);
  const ref = taskKey && t.number ? `${taskKey}-${t.number}` : '';
  return (
    <div onClick={onOpen} className={`card cursor-pointer p-3 hover:border-fg/25 ${t.completed_at ? 'opacity-70' : ''}`}>
      {ref && <p className="mb-1 font-mono text-[10px] font-bold tracking-wide text-fg/40">{ref}</p>}
      {(m || (t.tags || []).length > 0) && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {m && <span className="chip text-white" style={{ background: m.color }}>{m.name}</span>}
          {(t.tags || []).map((x: string) => (
            <span key={x} className="chip bg-fg/10 text-fg/65">{x}</span>
          ))}
        </div>
      )}
      <p className={`text-sm font-semibold leading-snug ${t.completed_at ? 'text-fg/50 line-through' : ''}`}>{t.title}</p>
      <div className="mt-2 flex items-center gap-2.5 text-xs text-fg/50">
        {blocked && <span className="chip bg-amber-100 px-1.5 text-amber-800" title="Waiting on another task"><Lock size={10} /> Blocked</span>}
        <PriorityFlag priority={t.priority} />
        {t.due_date && <span className={`font-semibold ${isOverdue(t) ? 'text-red-600' : ''}`}>{fmtDate(t.due_date)}</span>}
        {t.recurrence && <span title={`Repeats ${t.recurrence}`} className="inline-flex"><Repeat size={12} /></span>}
        {t.sub_total > 0 && <span className="inline-flex items-center gap-0.5"><ListChecks size={12} /> {t.sub_done}/{t.sub_total}</span>}
        {t.comment_count > 0 && <span className="inline-flex items-center gap-0.5"><MessageSquare size={12} /> {t.comment_count}</span>}
        {t.file_count > 0 && <span className="inline-flex items-center gap-0.5"><Paperclip size={12} /> {t.file_count}</span>}
        <span className="ml-auto"><AvatarStack ids={t.assignees || []} /></span>
      </div>
    </div>
  );
}

function Board({ data, projectId, visible, tasks, setTasks, openTask, milestoneName, milestone, isBlocked, canEdit, taskKey }: any) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ statusId: string; index: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const column = (sid: string) => visible.filter((t: any) => t.status_id === sid).sort((a: any, b: any) => a.position - b.position);

  function drop(statusId: string) {
    const dragged = tasks.find((t: any) => t.id === dragId);
    setDragId(null);
    const target = over?.statusId === statusId ? over.index : Infinity;
    setOver(null);
    if (!dragged) return;
    const list = column(statusId).filter((t: any) => t.id !== dragged.id);
    list.splice(Math.min(target, list.length), 0, dragged);
    const pos = new Map(list.map((t: any, i: number) => [t.id, i]));
    const status = data.statuses.find((s: any) => s.id === statusId);
    setTasks(tasks.map((t: any) =>
      pos.has(t.id)
        ? { ...t, position: pos.get(t.id), ...(t.id === dragged.id ? { status_id: statusId, completed_at: status?.is_done ? t.completed_at || new Date().toISOString() : null } : {}) }
        : t
    ));
    act('task.move', { id: dragged.id, statusId, orderedIds: list.map((t: any) => t.id) });
  }

  async function addList(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim()) await act('status.create', { projectId, name });
    setName('');
    setAdding(false);
  }

  return (
    <div className="flex h-full gap-3 overflow-x-auto px-4 pb-4 sm:px-6">
      {data.statuses.map((s: any) => {
        const list = column(s.id);
        const rest = list.filter((t: any) => t.id !== dragId);
        return (
          <div
            key={s.id}
            className={`flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-fg/[.045] ${over?.statusId === s.id ? 'ring-2 ring-ember/40' : ''}`}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              if (over?.statusId !== s.id) setOver({ statusId: s.id, index: rest.length });
            }}
            onDrop={(e) => { e.preventDefault(); drop(s.id); }}
          >
            <div className="flex items-center gap-2 px-3 pb-1 pt-2.5">
              {s.is_done && <CheckCircle2 size={14} className="text-emerald-600" />}
              <h3 className="truncate text-sm font-bold">{s.name}</h3>
              <span className="text-xs font-semibold text-fg/40">{list.length}</span>
              <span className={`ml-auto ${canEdit ? '' : 'hidden'}`}>
                <Menu trigger={<button className="icon-btn" aria-label={`${s.name} list options`}><MoreHorizontal size={15} /></button>}>
                  {(close) => (
                    <>
                      <MenuItem onClick={() => { close(); const n = window.prompt('Rename list', s.name); if (n?.trim()) act('status.update', { id: s.id, name: n }); }}>Rename list</MenuItem>
                      <MenuItem onClick={() => { close(); act('status.update', { id: s.id, is_done: !s.is_done }); }}>{s.is_done ? 'Stop marking tasks complete' : 'Mark tasks here as complete'}</MenuItem>
                      <MenuItem danger onClick={() => { close(); if (window.confirm(`Delete the "${s.name}" list? Its tasks move to another list.`)) act('status.delete', { id: s.id }); }}>Delete list</MenuItem>
                    </>
                  )}
                </Menu>
              </span>
            </div>
            <div className="min-h-[8px] flex-1 space-y-2 overflow-y-auto px-2 py-1">
              {list.map((t: any) => {
                const idx = rest.indexOf(t);
                return (
                  <div key={t.id}>
                    {over?.statusId === s.id && over!.index === idx && dragId && dragId !== t.id && <div className="mb-2 h-1 rounded-full bg-ember" />}
                    <div
                      draggable={canEdit}
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); setDragId(t.id); }}
                      onDragEnd={() => { setDragId(null); setOver(null); }}
                      onDragOver={(e) => {
                        if (!dragId || dragId === t.id) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        const index = e.clientY < r.top + r.height / 2 ? idx : idx + 1;
                        if (over?.statusId !== s.id || over!.index !== index) setOver({ statusId: s.id, index });
                      }}
                      className={dragId === t.id ? 'opacity-40' : ''}
                    >
                      <Card t={t} milestoneName={milestoneName} onOpen={() => openTask(t.id)} blocked={isBlocked(t)} taskKey={taskKey} />
                    </div>
                  </div>
                );
              })}
              {over?.statusId === s.id && over!.index >= rest.length && dragId && <div className="h-1 rounded-full bg-ember" />}
            </div>
            <div className="p-2 pt-1">
              <AddTask projectId={projectId} statusId={s.id} milestoneId={milestone} />
            </div>
          </div>
        );
      })}
      <div className={`w-72 shrink-0 ${canEdit ? '' : 'hidden'}`}>
        {adding ? (
          <form onSubmit={addList}>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => !name.trim() && setAdding(false)} placeholder="List name, then Enter" aria-label="New list name" className="input" />
          </form>
        ) : (
          <button onClick={() => setAdding(true)} className="flex w-full items-center gap-1.5 rounded-xl border border-dashed border-fg/20 px-3 py-2.5 text-sm font-semibold text-fg/45 hover:border-fg/40 hover:text-fg">
            <Plus size={14} /> Add list
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────────── list ───────────── */
function ListView({ data, projectId, visible, openTask, milestoneName, milestone, isBlocked, canEdit, taskKey }: any) {
  return (
    <div className="h-full space-y-5 overflow-y-auto px-4 pb-6 sm:px-6">
      {data.statuses.map((s: any) => {
        const list = visible.filter((t: any) => t.status_id === s.id).sort((a: any, b: any) => a.position - b.position);
        return (
          <section key={s.id}>
            <h3 className="mb-1.5 flex items-center gap-2 text-sm font-bold">
              {s.is_done && <CheckCircle2 size={14} className="text-emerald-600" />} {s.name} <span className="font-semibold text-fg/40">{list.length}</span>
            </h3>
            <div className="card divide-y divide-line overflow-hidden">
              {list.map((t: any) => {
                const m = t.milestone_id && milestoneName(t.milestone_id);
                return (
                  <div key={t.id} className="flex items-center gap-3 px-3 py-2 hover:bg-paper/70">
                    <button disabled={!canEdit} onClick={() => act('task.update', { id: t.id, patch: { done: !t.completed_at } })} aria-label={t.completed_at ? 'Reopen task' : 'Complete task'}>
                      {t.completed_at ? <CheckCircle2 size={18} className="text-emerald-600" /> : <Circle size={18} className="text-fg/30 hover:text-fg/60" />}
                    </button>
                    {taskKey && t.number && <span className="hidden shrink-0 font-mono text-[10px] font-bold text-fg/35 sm:inline">{taskKey}-{t.number}</span>}
                    <button onClick={() => openTask(t.id)} className={`min-w-0 flex-1 truncate text-left text-sm font-semibold ${t.completed_at ? 'text-fg/45 line-through' : ''}`}>{t.title}</button>
                    {isBlocked(t) && <span className="chip bg-amber-100 text-amber-800"><Lock size={10} /> Blocked</span>}
                    {t.recurrence && <span title={`Repeats ${t.recurrence}`} className="inline-flex text-fg/45"><Repeat size={13} /></span>}
                    {m && <span className="chip hidden text-white sm:inline-flex" style={{ background: m.color }}>{m.name}</span>}
                    {t.sub_total > 0 && <span className="hidden items-center gap-0.5 text-xs text-fg/50 sm:inline-flex"><ListChecks size={12} /> {t.sub_done}/{t.sub_total}</span>}
                    <PriorityFlag priority={t.priority} />
                    <span className={`w-16 text-right text-xs font-semibold ${isOverdue(t) ? 'text-red-600' : 'text-fg/50'}`}>{fmtDate(t.due_date)}</span>
                    <span className="flex w-14 justify-end"><AvatarStack ids={t.assignees || []} max={2} /></span>
                  </div>
                );
              })}
              <div className="p-1">
                <AddTask projectId={projectId} statusId={s.id} milestoneId={milestone} />
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ───────────── calendar ───────────── */
function CalendarView({ projectId, visible, openTask, canEdit }: any) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const start = new Date(cursor);
  start.setDate(1 - ((cursor.getDay() + 6) % 7)); // weeks start on Monday
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const byDay: Record<string, any[]> = {};
  for (const t of visible) if (t.due_date) (byDay[t.due_date] ||= []).push(t);
  const shift = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  const unscheduled = visible.filter((t: any) => !t.due_date && !t.completed_at).length;

  return (
    <div className="flex h-full flex-col px-4 pb-4 sm:px-6">
      <div className="mb-2 flex items-center gap-2">
        <button className="icon-btn border border-line bg-surface" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={16} /></button>
        <button className="icon-btn border border-line bg-surface" onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={16} /></button>
        <h3 className="text-base font-bold">{cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</button>
        {unscheduled > 0 && <span className="ml-auto text-xs text-fg/50">{unscheduled} open {unscheduled === 1 ? 'task has' : 'tasks have'} no due date</span>}
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-bold uppercase tracking-wide text-fg/40">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 overflow-hidden rounded-xl border border-line bg-line gap-px">
        {days.map((d) => {
          const key = ymd(d);
          const list = byDay[key] || [];
          const inMonth = d.getMonth() === cursor.getMonth();
          return (
            <div key={key} className={`group min-h-[84px] overflow-hidden p-1 ${inMonth ? 'bg-surface' : 'bg-paper'}`}>
              <div className="flex items-center justify-between">
                <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold ${key === today() ? 'bg-ember text-white' : inMonth ? 'text-fg/60' : 'text-fg/30'}`}>{d.getDate()}</span>
                <button
                  hidden={!canEdit}
                  className="rounded p-0.5 text-fg/40 opacity-0 hover:bg-fg/5 hover:text-fg group-hover:opacity-100 focus:opacity-100"
                  aria-label={`Add task due ${key}`}
                  onClick={() => { const title = window.prompt(`New task due ${fmtDate(key)}`); if (title?.trim()) act('task.create', { projectId, title, dueDate: key }); }}
                >
                  <Plus size={12} />
                </button>
              </div>
              <div className="mt-0.5 space-y-0.5">
                {list.slice(0, 3).map((t: any) => (
                  <button key={t.id} onClick={() => openTask(t.id)} title={t.title}
                    className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-semibold ${t.completed_at ? 'bg-emerald-50 text-emerald-700 line-through' : isOverdue(t) ? 'bg-red-50 text-red-700' : 'bg-fg/[.06] text-fg/80'}`}>
                    {t.title}
                  </button>
                ))}
                {list.length > 3 && <p className="px-1 text-[10px] font-semibold text-fg/45">+{list.length - 3} more</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────── timeline (Gantt) ───────────── */
function Timeline({ data, visible, openTask, isBlocked }: any) {
  const scroller = useRef<HTMLDivElement>(null);
  const hasRows = visible.some((t: any) => t.start_date || t.due_date);
  // open the chart around today instead of at the oldest task
  useEffect(() => {
    const el = scroller.current;
    const line = el?.querySelector<HTMLElement>('[data-today]');
    if (el && line) el.scrollLeft = Math.max(0, line.offsetLeft - 160);
  }, [hasRows]);
  const rows = visible
    .filter((t: any) => t.start_date || t.due_date)
    .map((t: any) => {
      const a = t.start_date || t.due_date;
      const b = t.due_date || t.start_date;
      return { t, s: a < b ? a : b, e: a < b ? b : a };
    })
    .sort((x: any, y: any) => x.s.localeCompare(y.s) || x.e.localeCompare(y.e));
  const unscheduled = visible.length - rows.length;

  if (!rows.length) {
    return <p className="px-6 py-10 text-center text-sm text-fg/50">No tasks have dates yet. Give a task a start or due date to see it on the timeline.</p>;
  }
  const min = rows.reduce((m: string, r: any) => (r.s < m ? r.s : m), today());
  const max = rows.reduce((m: string, r: any) => (r.e > m ? r.e : m), today());
  const start = addDays(min, -3);
  const total = Math.max(35, daysBetween(start, max) + 8);
  const DAY = total > 150 ? 14 : 32;
  const ROW = 38;
  const LABEL = 230;
  const days = Array.from({ length: total }, (_, i) => parseYmd(addDays(start, i)));
  const months: { label: string; span: number }[] = [];
  for (const d of days) {
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (months.length && months[months.length - 1].label === label) months[months.length - 1].span++;
    else months.push({ label, span: 1 });
  }
  const x = (d: string) => daysBetween(start, d) * DAY;
  const index = new Map<string, number>(rows.map((r: any, i: number) => [r.t.id, i]));
  const links: string[] = [];
  rows.forEach((r: any, i: number) => {
    for (const id of r.t.blocked_by || []) {
      const j = index.get(id);
      if (j === undefined) continue;
      const from = rows[j];
      const x1 = x(from.e) + DAY;
      const y1 = j * ROW + ROW / 2;
      const x2 = x(r.s);
      const y2 = i * ROW + ROW / 2;
      links.push(x2 >= x1 + 12 ? `M${x1} ${y1} H${x1 + 6} V${y2} H${x2 - 2}` : `M${x1} ${y1} H${x1 + 6} V${y2 - ROW / 2 + 2} H${x2 - 10} V${y2} H${x2 - 2}`);
    }
  });
  const statusName = (id: string) => data.statuses.find((s: any) => s.id === id)?.name;
  const todayX = x(today()) + DAY / 2;

  return (
    <div className="flex h-full flex-col px-4 pb-4 sm:px-6">
      <div ref={scroller} className="card min-h-0 flex-1 overflow-auto">
        <div style={{ width: LABEL + total * DAY }} className="relative">
          {/* header */}
          <div className="sticky top-0 z-20 flex border-b border-line bg-surface">
            <div style={{ width: LABEL }} className="sticky left-0 z-10 shrink-0 border-r border-line bg-surface px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-fg/45">Task</div>
            <div>
              <div className="flex">
                {months.map((m) => (
                  <div key={m.label} style={{ width: m.span * DAY }} className="overflow-hidden whitespace-nowrap border-l border-line px-2 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-fg/55">{m.span * DAY > 70 ? m.label : ''}</div>
                ))}
              </div>
              <div className="flex">
                {days.map((d, i) => (
                  <div key={i} style={{ width: DAY }} className={`pb-1 text-center text-[10px] font-semibold ${ymd(d) === today() ? 'text-ember' : d.getDay() === 0 || d.getDay() === 6 ? 'text-fg/25' : 'text-fg/45'}`}>
                    {DAY >= 24 || d.getDate() === 1 || d.getDate() === 15 ? d.getDate() : ''}
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* body */}
          <div className="relative" style={{ height: rows.length * ROW }}>
            <div className="pointer-events-none absolute inset-y-0" style={{ left: LABEL, width: total * DAY }}>
              {days.map((d, i) => (d.getDay() === 0 || d.getDay() === 6) && <div key={i} className="absolute inset-y-0 bg-fg/[.03]" style={{ left: i * DAY, width: DAY }} />)}
              <div data-today className="absolute inset-y-0 w-px bg-ember" style={{ left: todayX }} />
              <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
                <defs>
                  <marker id="tl-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7 z" fill="#8b8fa8" /></marker>
                </defs>
                {links.map((d, i) => <path key={i} d={d} fill="none" stroke="#8b8fa8" strokeWidth="1.5" markerEnd="url(#tl-arrow)" />)}
              </svg>
            </div>
            {rows.map((r: any, i: number) => {
              const t = r.t;
              const color = t.completed_at ? '#12b886' : isOverdue(t) ? '#e03131' : isBlocked(t) ? '#f59f00' : data.project.color;
              return (
                <div key={t.id} className="absolute inset-x-0 flex border-b border-line/60" style={{ top: i * ROW, height: ROW }}>
                  <button onClick={() => openTask(t.id)} style={{ width: LABEL }} title={t.title}
                    className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-line bg-surface px-3 text-left text-sm font-semibold hover:text-ember">
                    {isBlocked(t) && <Lock size={12} className="shrink-0 text-amber-600" />}
                    <span className={`truncate ${t.completed_at ? 'text-fg/45 line-through' : ''}`}>{t.title}</span>
                  </button>
                  <button onClick={() => openTask(t.id)} title={`${t.title} · ${fmtDate(r.s)} to ${fmtDate(r.e)} · ${statusName(t.status_id) || ''}`}
                    className="absolute top-2 flex h-[22px] items-center rounded-md px-1.5 text-[11px] font-bold text-white shadow-card hover:brightness-110"
                    style={{ left: LABEL + x(r.s) + 2, width: (daysBetween(r.s, r.e) + 1) * DAY - 4, background: color, opacity: t.completed_at ? 0.65 : 1 }}>
                    <span className="truncate">{(daysBetween(r.s, r.e) + 1) * DAY > 90 ? t.title : ''}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-fg/50">
        Bars run from start date to due date; arrows show dependencies.
        {unscheduled > 0 && ` ${unscheduled} ${unscheduled === 1 ? 'task has' : 'tasks have'} no dates and ${unscheduled === 1 ? 'is' : 'are'} not shown.`}
      </p>
    </div>
  );
}

/* ───────────── swimlanes ───────────── */
function Swimlanes({ data, visible, tasks, setTasks, openTask, milestoneName, isBlocked, canEdit, taskKey }: any) {
  const { users } = useApp();
  const [by, setBy] = useState<'assignee' | 'milestone'>('assignee');
  const [drag, setDrag] = useState<{ id: string; lane: string } | null>(null);
  const [over, setOver] = useState('');

  const lanes: { id: string; label: string; user?: any; color?: string }[] =
    by === 'assignee'
      ? [
          ...users.filter((u) => data.members.includes(u.id) || visible.some((t: any) => (t.assignees || []).includes(u.id))).map((u) => ({ id: u.id, label: u.name, user: u })),
          { id: '', label: 'Unassigned' },
        ]
      : [...data.milestones.map((m: any) => ({ id: m.id, label: m.name, color: m.color })), { id: '', label: 'No milestone' }];
  const inLane = (t: any, lane: string) =>
    by === 'assignee' ? (lane ? (t.assignees || []).includes(lane) : !(t.assignees || []).length) : (t.milestone_id || '') === lane;

  async function drop(statusId: string, lane: string) {
    const d = drag;
    setDrag(null);
    setOver('');
    const task = tasks.find((t: any) => t.id === d?.id);
    if (!d || !task) return;
    const patch: any = {};
    if (lane !== d.lane) {
      if (by === 'milestone') patch.milestone_id = lane || null;
      else patch.assignees = [...(task.assignees || []).filter((a: string) => a !== d.lane && a !== lane), ...(lane ? [lane] : [])];
    }
    const status = data.statuses.find((s: any) => s.id === statusId);
    const moved = statusId !== task.status_id;
    setTasks(tasks.map((t: any) => (t.id === task.id ? { ...t, ...patch, status_id: statusId, completed_at: moved ? (status?.is_done ? new Date().toISOString() : null) : t.completed_at } : t)));
    if (moved) {
      const column = tasks.filter((t: any) => t.status_id === statusId && t.id !== task.id).sort((a: any, b: any) => a.position - b.position);
      await act('task.move', { id: task.id, statusId, orderedIds: [...column.map((t: any) => t.id), task.id] });
    }
    if (Object.keys(patch).length) await act('task.update', { id: task.id, patch });
  }

  const cols = `180px repeat(${data.statuses.length}, minmax(230px, 1fr))`;
  return (
    <div className="flex h-full flex-col px-4 pb-4 sm:px-6">
      <div className="mb-2 flex items-center gap-2 text-sm">
        <span className="font-semibold text-fg/55">Lanes by</span>
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {(['assignee', 'milestone'] as const).map((k) => (
            <button key={k} onClick={() => setBy(k)} className={`rounded-md px-2.5 py-1 text-sm font-semibold capitalize ${by === k ? 'bg-ink text-white' : 'text-fg/60 hover:text-fg'}`}>{k}</button>
          ))}
        </div>
      </div>
      <div className="card min-h-0 flex-1 overflow-auto">
        <div className="grid min-w-max" style={{ gridTemplateColumns: cols }}>
          <div className="sticky left-0 top-0 z-30 border-b border-r border-line bg-surface" />
          {data.statuses.map((s: any) => (
            <div key={s.id} className="sticky top-0 z-20 flex items-center gap-1.5 border-b border-l border-line bg-surface px-3 py-2 text-sm font-bold">
              {s.is_done && <CheckCircle2 size={14} className="text-emerald-600" />} {s.name}
            </div>
          ))}
          {lanes.map((lane) => {
            const count = visible.filter((t: any) => inLane(t, lane.id)).length;
            return [
              <div key={`l-${lane.id}`} className="sticky left-0 z-10 flex items-start gap-2 border-b border-r border-line bg-surface p-3">
                {by === 'assignee' ? (lane.user ? <Avatar user={lane.user} size={24} /> : <span className="h-6 w-6 rounded-full border border-dashed border-fg/30" />) : <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: lane.color || '#b8b5aa' }} />}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{lane.label}</span>
                  <span className="text-xs text-fg/45">{count} {count === 1 ? 'task' : 'tasks'}</span>
                </span>
              </div>,
              ...data.statuses.map((s: any) => {
                const key = `${lane.id}|${s.id}`;
                const list = visible.filter((t: any) => t.status_id === s.id && inLane(t, lane.id)).sort((a: any, b: any) => a.position - b.position);
                return (
                  <div key={key} className={`min-h-[76px] space-y-2 border-b border-l border-line p-2 ${over === key ? 'bg-ember/15 text-ember' : 'bg-fg/[.025]'}`}
                    onDragOver={(e) => { if (!drag) return; e.preventDefault(); if (over !== key) setOver(key); }}
                    onDrop={(e) => { e.preventDefault(); drop(s.id, lane.id); }}>
                    {list.map((t: any) => (
                      <div key={t.id} draggable={canEdit} className={drag?.id === t.id ? 'opacity-40' : ''}
                        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); setDrag({ id: t.id, lane: lane.id }); }}
                        onDragEnd={() => { setDrag(null); setOver(''); }}>
                        <Card t={t} milestoneName={milestoneName} onOpen={() => openTask(t.id)} blocked={isBlocked(t)} taskKey={taskKey} />
                      </div>
                    ))}
                  </div>
                );
              }),
            ];
          })}
        </div>
      </div>
    </div>
  );
}
