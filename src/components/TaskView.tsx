'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Check, Paperclip, Play, Square, Trash2, X, Plus, Link2, CheckCircle2, Circle, ArrowLeft, Maximize2,
  MessageSquare, Activity as ActivityIcon, Flag, Calendar, Tag as TagIcon, ListTodo, Users, MoreHorizontal, Send, Pencil,
} from 'lucide-react';
import { act, rpc, refresh, toast, uploadFile, useQ } from '@/lib/api';
import {
  Avatar, AvatarStack, MentionInput, Menu, MenuItem, PRIORITIES, RichText, Spinner,
  confirmDelete, fmtClock, fmtDateTime, fmtDur, fmtSize, useApp, useNow, useProjectPeople,
} from './ui';
import { AttachButton, AttachmentList, PendingAttachments, useAttachments } from './Attach';

function Field({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-fg/45"><Icon size={13} /> {label}</p>
      {children}
    </div>
  );
}

/** Keeps a textarea exactly as tall as the text inside it. */
function grow(el: HTMLTextAreaElement | null, min: number) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.max(min, el.scrollHeight)}px`;
}

/**
 * The task screen. Used two ways: as the page at /tasks/<id>, and as a panel
 * that slides over the board when `onClose` is given.
 */
export function TaskView({ id, onClose }: { id: string; onClose?: () => void }) {
  const router = useRouter();
  const { users, me, timer, canEdit, isAdmin } = useApp();
  const { data, error } = useQ('task.get', { id }, { refreshInterval: 10000 });
  const task = data?.task;
  const { data: pdata } = useQ(task ? 'project.get' : null, task ? { id: task.project_id } : undefined);
  const [comment, setComment] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sub, setSub] = useState('');
  const [tag, setTag] = useState('');
  const [tab, setTab] = useState<'subtasks' | 'attachments'>('subtasks');
  const [showActivity, setShowActivity] = useState(true);
  const attach = useAttachments(task?.project_id || '');
  const people = useProjectPeople(task?.project_id || '', pdata?.members || []);
  const now = useNow();

  const feed = useMemo(() => {
    if (!data) return [];
    const items = [
      ...data.comments.map((c: any) => ({ kind: 'comment' as const, at: c.created_at, data: c })),
      ...(showActivity ? data.activity.map((a: any) => ({ kind: 'activity' as const, at: a.created_at, data: a })) : []),
      ...(showActivity ? data.entries.map((e: any) => ({ kind: 'time' as const, at: e.created_at, data: e })) : []),
    ];
    return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [data, showActivity]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-10 text-center">
        <p className="font-bold">This task could not be opened</p>
        <p className="mt-1 text-sm text-fg/55">It may have been deleted, or it belongs to a project you are not on.</p>
        <button className="btn-primary mt-4" onClick={() => router.push('/')}>Back to overview</button>
      </div>
    );
  }
  if (!task || !pdata) return <Spinner />;

  const update = (patch: any) => act('task.update', { id, patch });
  const done = !!task.completed_at;
  const assignees: string[] = task.assignees || [];
  const tags: string[] = task.tags || [];
  const running = timer?.task_id === id;
  const assignable = users.filter((u) => u.active && ((pdata.members || []).includes(u.id) || assignees.includes(u.id)));
  const ref = task.number ? `${pdata.project.key || 'TSK'}-${task.number}` : '';
  const liveSeconds = data.seconds + (data.runningSince ? Math.max(0, (now - new Date(data.runningSince).getTime()) / 1000) : 0);
  const subDone = data.subtasks.filter((s: any) => s.completed_at).length;

  async function addSub(e: React.FormEvent) {
    e.preventDefault();
    if (!sub.trim()) return;
    setSub('');
    await act('task.create', { projectId: task.project_id, parentId: id, title: sub });
  }
  async function addComment() {
    if (!comment.trim() && !attach.ids.length) return;
    const body = comment;
    const fileIds = attach.ids;
    setComment('');
    attach.reset();
    try {
      await rpc('comment.create', { taskId: id, body, fileIds });
      refresh();
    } catch (e: any) {
      setComment(body);
      toast(e.message);
    }
  }
  async function saveEdit(commentId: string) {
    const body = draft.trim();
    setEditing(null);
    if (body) await act('comment.update', { id: commentId, body });
  }
  async function onTaskFiles(list: FileList | null) {
    if (!list?.length) return;
    for (const f of Array.from(list)) {
      const row = await uploadFile(f, task.project_id, id);
      if (!row) break;
    }
    refresh();
  }
  async function addLink() {
    const url = window.prompt('Paste a link (Google Drive, Figma, etc.)');
    if (url) await act('file.addLink', { projectId: task.project_id, taskId: id, url });
  }
  async function copyLink() {
    const url = `${location.origin}/tasks/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast(ref ? `Link to ${ref} copied` : 'Task link copied');
    } catch {
      window.prompt('Copy this link', url);
    }
  }
  async function remove() {
    if (!confirmDelete(`"${task.title}"`)) return;
    router.push(`/projects/${task.project_id}?tab=tasks`);
    await act('task.delete', { id });
  }

  return (
    <div className="flex h-full flex-col">
      {/* ───── header bar ───── */}
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {onClose ? (
            <button className="icon-btn shrink-0" onClick={onClose} aria-label="Close" title="Close"><X size={17} /></button>
          ) : (
            <button
              className="icon-btn shrink-0"
              onClick={() => (window.history.length > 1 ? router.back() : router.push(`/projects/${task.project_id}?tab=tasks`))}
              aria-label="Back" title="Back"
            >
              <ArrowLeft size={17} />
            </button>
          )}
          <Link href={`/projects/${task.project_id}?tab=tasks`} className="hidden min-w-0 items-center gap-1.5 text-xs font-semibold text-fg/50 hover:text-fg sm:flex">
            <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: pdata.project.color }} />
            <span className="truncate">{pdata.project.name}</span>
          </Link>
          <span className="hidden text-fg/25 sm:inline">/</span>
          {ref && <span className="shrink-0 rounded-md bg-fg/5 px-2 py-1 font-mono text-[11px] font-bold text-fg/60">{ref}</span>}
          <select
            aria-label="List" disabled={!canEdit} value={task.status_id || ''} onChange={(e) => update({ status_id: e.target.value })}
            className="min-w-0 max-w-[150px] shrink rounded-md border border-line bg-surface px-2 py-1 text-xs font-semibold focus:border-ember focus:outline-none disabled:opacity-60"
          >
            {pdata.statuses.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <span className={`hidden items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-sm font-bold tabular-nums sm:flex ${data.runningSince ? 'bg-ember/15 text-ember' : 'text-fg/55'}`}>
            {fmtClock(liveSeconds)}
          </span>
          {canEdit && (running ? (
            <button className="icon-btn text-ember" onClick={() => act('time.stop')} aria-label="Stop timer" title="Stop timer"><Square size={15} fill="currentColor" /></button>
          ) : (
            <button className="icon-btn" onClick={() => act('time.start', { taskId: id })} aria-label="Start timer" title="Start timer"><Play size={15} fill="currentColor" /></button>
          ))}
          <button className="icon-btn" onClick={copyLink} aria-label="Copy link to this task" title="Copy link to this task"><Link2 size={16} /></button>
          {onClose && (
            <Link href={`/tasks/${id}`} className="icon-btn hidden sm:inline-flex" aria-label="Open as a full page" title="Open as a full page"><Maximize2 size={15} /></Link>
          )}
          <span className="hidden sm:inline"><AvatarStack ids={assignees} size={24} max={3} /></span>
          {canEdit && (
            <button className={`btn ${done ? 'bg-emerald-500/15 text-emerald-600' : 'btn-outline'}`} onClick={() => update({ done: !done })}>
              <Check size={14} /> <span className="hidden sm:inline">{done ? 'Completed' : 'Mark complete'}</span>
            </button>
          )}
          {canEdit && (
            <Menu trigger={<button className="icon-btn" aria-label="Task options"><MoreHorizontal size={17} /></button>}>
              {(close) => (
                <>
                  <MenuItem onClick={() => { close(); copyLink(); }}><Link2 size={15} /> Copy link to this task</MenuItem>
                  <MenuItem onClick={() => { close(); addLink(); }}><Paperclip size={15} /> Attach a link</MenuItem>
                  <MenuItem danger onClick={() => { close(); remove(); }}><Trash2 size={15} /> Delete task</MenuItem>
                </>
              )}
            </Menu>
          )}
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 overflow-y-auto lg:min-h-0 lg:grid-cols-[1fr_420px] lg:overflow-hidden">
        {/* ───── left: the task itself ───── */}
        <div className="min-w-0 px-5 py-6 lg:overflow-y-auto lg:px-8">
          <div className="mx-auto max-w-3xl">
            <fieldset disabled={!canEdit} className="m-0 min-w-0 border-0 p-0">
              <div className="flex items-start gap-2">
                <button className="mt-2 shrink-0" onClick={() => update({ done: !done })} aria-label={done ? 'Reopen task' : 'Mark complete'}>
                  {done ? <CheckCircle2 size={22} className="text-emerald-600" /> : <Circle size={22} className="text-fg/25 hover:text-fg/50" />}
                </button>
                <textarea
                  key={`t-${task.id}`} defaultValue={task.title} rows={1} aria-label="Task title"
                  ref={(el) => grow(el, 36)}
                  onInput={(e) => grow(e.currentTarget, 36)}
                  className={`w-full resize-none rounded-lg border border-transparent bg-transparent px-2 py-1 text-2xl font-extrabold tracking-tight hover:border-line focus:border-ember focus:outline-none ${done ? 'text-fg/50 line-through' : ''}`}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), (e.target as HTMLTextAreaElement).blur())}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== task.title) update({ title: v });
                    else e.target.value = task.title;
                  }}
                />
              </div>
              <textarea
                key={`d-${task.id}`} defaultValue={task.description} aria-label="Description" placeholder="Add a task description…"
                ref={(el) => grow(el, 160)}
                onInput={(e) => grow(e.currentTarget, 160)}
                className="mt-1 min-h-[160px] w-full resize-y overflow-hidden rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm leading-relaxed hover:border-line focus:border-ember focus:outline-none"
                onBlur={(e) => e.target.value !== task.description && update({ description: e.target.value })}
              />

              <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 sm:grid-cols-3">
                <Field icon={Users} label="Assignees">
                  <div className="flex flex-wrap items-center gap-1">
                    {assignees.map((uid) => {
                      const u = users.find((x) => x.id === uid);
                      return (
                        <span key={uid} className="inline-flex items-center gap-1 rounded-full bg-fg/5 py-0.5 pl-0.5 pr-1.5 text-xs font-semibold">
                          <Avatar user={u} size={18} ring={false} /> {u?.name.split(' ')[0] || '—'}
                          <button onClick={() => update({ assignees: assignees.filter((x) => x !== uid) })} aria-label={`Remove ${u?.name}`}><X size={11} /></button>
                        </span>
                      );
                    })}
                    <Menu align="left" trigger={<button className="icon-btn h-6 w-6 border border-dashed border-fg/25" aria-label="Add assignee"><Plus size={13} /></button>}>
                      {(close) => (
                        <div className="max-h-72 w-60 overflow-y-auto">
                          {assignable.map((u) => {
                            const on = assignees.includes(u.id);
                            return (
                              <button key={u.id} onClick={() => update({ assignees: on ? assignees.filter((x) => x !== u.id) : [...assignees, u.id] })}
                                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-fg/5">
                                <Avatar user={u} size={22} /> <span className="flex-1 truncate">{u.name}</span> {on && <Check size={14} className="text-ember" />}
                              </button>
                            );
                          })}
                          {people.others.length > 0 && <p className="px-2 pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-wider text-fg/40">Add to this project</p>}
                          {people.others.map((u) => (
                            <button key={u.id} onClick={async () => { close(); if (await people.addToProject(u)) await update({ assignees: [...assignees, u.id] }); }}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-fg/5">
                              <Avatar user={u} size={22} /> <span className="flex-1 truncate">{u.name}</span>
                              <span className="text-[10px] font-bold uppercase tracking-wide text-ember">Add</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </Menu>
                  </div>
                </Field>

                <Field icon={TagIcon} label="Tags">
                  <div className="flex flex-wrap gap-1">
                    {tags.map((t) => (
                      <span key={t} className="chip bg-fg/10 text-fg/70">
                        {t}<button onClick={() => update({ tags: tags.filter((x) => x !== t) })} aria-label={`Remove tag ${t}`}><X size={11} /></button>
                      </span>
                    ))}
                  </div>
                  <form onSubmit={(e) => { e.preventDefault(); const v = tag.trim(); if (v && !tags.includes(v)) update({ tags: [...tags, v] }); setTag(''); }}>
                    <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Add" aria-label="New tag"
                      className="mt-1 w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-sm placeholder:text-fg/35 hover:border-line focus:border-ember focus:outline-none" />
                  </form>
                </Field>

                <Field icon={ListTodo} label="Milestone">
                  <select aria-label="Milestone" className="-ml-1 w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-sm hover:border-line focus:border-ember focus:outline-none"
                    value={task.milestone_id || ''} onChange={(e) => update({ milestone_id: e.target.value })}>
                    <option value="">None</option>
                    {pdata.milestones.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </Field>

                <Field icon={Calendar} label="Start date">
                  <input type="date" aria-label="Start date" className="w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-[13px] hover:border-line focus:border-ember focus:outline-none"
                    value={task.start_date || ''} onChange={(e) => update({ start_date: e.target.value })} />
                </Field>

                <Field icon={Calendar} label="Due date">
                  <input type="date" aria-label="Due date" className="w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-[13px] hover:border-line focus:border-ember focus:outline-none"
                    value={task.due_date || ''} onChange={(e) => update({ due_date: e.target.value })} />
                </Field>

                <Field icon={Flag} label="Priority">
                  <select aria-label="Priority" className="-ml-1 w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-sm hover:border-line focus:border-ember focus:outline-none"
                    value={task.priority} onChange={(e) => update({ priority: e.target.value })}>
                    {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </Field>
              </div>
            </fieldset>

            {/* subtasks / attachments */}
            <div className="mt-6 border-b border-line">
              <nav className="-mb-px flex gap-1">
                {([['subtasks', 'Subtasks', data.subtasks.length], ['attachments', 'Attachments', data.files.length]] as const).map(([key, label, n]) => (
                  <button key={key} onClick={() => setTab(key)}
                    className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${tab === key ? 'border-ember text-fg' : 'border-transparent text-fg/50 hover:text-fg'}`}>
                    {key === 'subtasks' ? <ListTodo size={14} /> : <Paperclip size={14} />} {label}
                    {n > 0 && <span className="rounded bg-fg/10 px-1.5 text-[11px]">{key === 'subtasks' ? `${subDone}/${n}` : n}</span>}
                  </button>
                ))}
              </nav>
            </div>

            {tab === 'subtasks' ? (
              <div className="pt-2">
                {data.subtasks.map((s: any) => (
                  <div key={s.id} className="group flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-fg/5">
                    <button disabled={!canEdit} onClick={() => act('task.update', { id: s.id, patch: { done: !s.completed_at } })} aria-label={s.completed_at ? 'Mark subtask open' : 'Mark subtask done'}>
                      {s.completed_at ? <CheckCircle2 size={17} className="text-emerald-600" /> : <Circle size={17} className="text-fg/30 hover:text-fg/60" />}
                    </button>
                    <span className={`flex-1 text-sm ${s.completed_at ? 'text-fg/40 line-through' : ''}`}>{s.title}</span>
                    {canEdit && <button className="icon-btn opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => act('task.delete', { id: s.id })} aria-label="Delete subtask"><X size={14} /></button>}
                  </div>
                ))}
                {canEdit && (
                  <form onSubmit={addSub} className="mt-1 flex items-center gap-2 px-1">
                    <Plus size={15} className="text-fg/35" />
                    <input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Add a new subtask…" aria-label="New subtask"
                      className="flex-1 bg-transparent py-1.5 text-sm placeholder:text-fg/40 focus:outline-none" />
                  </form>
                )}
                {!data.subtasks.length && !canEdit && <p className="px-1 py-3 text-sm text-fg/45">No subtasks.</p>}
              </div>
            ) : (
              <div className="pt-3">
                {canEdit && (
                  <label
                    className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 py-7 text-sm text-fg/50 hover:border-ember hover:text-fg"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); onTaskFiles(e.dataTransfer.files); }}
                  >
                    <Paperclip size={15} /> Drag &amp; drop or <span className="font-semibold text-ember underline">choose files</span>
                    <input type="file" multiple hidden onChange={(e) => { onTaskFiles(e.target.files); e.target.value = ''; }} />
                  </label>
                )}
                <div className="mt-3"><AttachmentList items={data.files} /></div>
                {data.files.length > 0 && canEdit && (
                  <div className="mt-2 space-y-1">
                    {data.files.map((f: any) => (
                      <div key={f.id} className="group flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-fg/50">
                        <span className="min-w-0 flex-1 truncate">{f.name}{!f.url && ` · ${fmtSize(f.size)}`}</span>
                        <button className="icon-btn opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => confirmDelete(`"${f.name}"`) && act('file.delete', { id: f.id })} aria-label={`Delete ${f.name}`}><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}
                {!data.files.length && !canEdit && <p className="px-1 py-3 text-sm text-fg/45">No attachments.</p>}
              </div>
            )}
          </div>
        </div>

        {/* ───── right: comments and activity ───── */}
        <aside className="flex flex-col border-t border-line bg-paper/50 lg:min-h-0 lg:border-l lg:border-t-0">
          <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2.5">
            <MessageSquare size={15} className="text-fg/45" />
            <h2 className="text-sm font-bold">{data.comments.length} {data.comments.length === 1 ? 'Comment' : 'Comments'}</h2>
            <button className="btn-outline ml-auto px-2 py-1 text-xs" onClick={() => setShowActivity((v) => !v)}>
              <ActivityIcon size={13} /> {showActivity ? 'Hide activity' : 'Show activity'}
            </button>
          </div>

          <div className="space-y-3 px-4 py-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {!feed.length && <p className="py-8 text-center text-sm text-fg/45">No comments yet.</p>}
            {feed.map((item) => {
              if (item.kind === 'activity') {
                const u = users.find((x) => x.id === item.data.user_id);
                return (
                  <div key={`a${item.data.id}`} className="flex items-center gap-2 text-xs text-fg/45">
                    <Avatar user={u} size={18} ring={false} />
                    <span className="min-w-0 flex-1 truncate"><span className="font-semibold text-fg/65">{u?.name.split(' ')[0] || 'Someone'}</span> {item.data.text}</span>
                    <span className="shrink-0">{fmtDateTime(item.at)}</span>
                  </div>
                );
              }
              if (item.kind === 'time') {
                const u = users.find((x) => x.id === item.data.user_id);
                return (
                  <div key={`e${item.data.id}`} className="flex items-center gap-2 text-xs text-fg/45">
                    <Avatar user={u} size={18} ring={false} />
                    <span className="min-w-0 flex-1 truncate"><span className="font-semibold text-fg/65">{u?.name.split(' ')[0] || 'Someone'}</span> logged {fmtDur(item.data.seconds)} on this task</span>
                    <span className="shrink-0">{fmtDateTime(item.at)}</span>
                  </div>
                );
              }
              const c = item.data;
              const u = users.find((x) => x.id === c.user_id);
              const mine = c.user_id === me.id;
              return (
                <div key={c.id} className="group flex gap-2.5">
                  <Avatar user={u} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-xs text-fg/45">
                      <span className="font-bold text-fg">{u?.name || 'Former member'}</span>
                      <span>{fmtDateTime(c.created_at)}</span>
                      {c.edited_at && <span className="italic">edited</span>}
                      {(mine || isAdmin) && (
                        <span className="ml-auto flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                          {mine && <button className="icon-btn h-6 w-6" onClick={() => { setEditing(c.id); setDraft(c.body); }} aria-label="Edit comment"><Pencil size={12} /></button>}
                          <button className="icon-btn h-6 w-6 hover:text-red-600" onClick={() => confirmDelete('this comment') && act('comment.delete', { id: c.id })} aria-label="Delete comment"><Trash2 size={12} /></button>
                        </span>
                      )}
                    </p>
                    {editing === c.id ? (
                      <div className="mt-1">
                        <textarea className="input min-h-[60px] text-sm" value={draft} autoFocus onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(c.id); } if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }} />
                        <div className="mt-1 flex gap-1.5">
                          <button className="btn-primary px-2 py-1 text-xs" onClick={() => saveEdit(c.id)}>Save</button>
                          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {c.body && <RichText text={c.body} className="text-sm leading-relaxed" />}
                        <AttachmentList items={c.attachments || []} compact />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="sticky bottom-0 shrink-0 border-t border-line bg-surface px-3 py-2.5">
            <PendingAttachments a={attach} />
            <div className="flex items-end gap-1.5">
              <Avatar user={me} size={26} />
              <MentionInput
                value={comment} onChange={setComment} onSubmit={addComment}
                people={people.mentionable} others={people.others} onPickOther={people.addToProject}
                onPaste={attach.onPaste}
                label="New comment" placeholder="Post a comment… @ to mention, paste a screenshot to attach."
                className="min-h-[46px] resize-none text-sm" rows={2}
              />
              <AttachButton a={attach} label="Attach files to this comment" />
              <button className="btn-primary h-[38px]" onClick={addComment} disabled={!comment.trim() && !attach.ids.length} aria-label="Post comment"><Send size={15} /></button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
