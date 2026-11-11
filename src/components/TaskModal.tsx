'use client';
import { useRef, useState } from 'react';
import { Check, Paperclip, Play, Square, Trash2, X, Plus, Link2, Clock, CheckCircle2, Circle, Lock } from 'lucide-react';
import { act, uploadFile, refresh, useQ } from '@/lib/api';
import { Avatar, MentionInput, Menu, Modal, PRIORITIES, RichText, Spinner, confirmDelete, fmtDateTime, fmtDur, fmtSize, useApp } from './ui';

export function TaskModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { users, me, timer, projects, canEdit, isAdmin, openTask } = useApp();
  const { data, error } = useQ('task.get', { id });
  const task = data?.task;
  const { data: pdata } = useQ(task ? 'project.get' : null, task ? { id: task.project_id } : undefined);
  const [comment, setComment] = useState('');
  const [sub, setSub] = useState('');
  const [tag, setTag] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (error) {
    return (
      <Modal open onClose={onClose} title="Task">
        <p className="p-6 text-sm text-fg/60">This task could not be loaded. It may have been deleted.</p>
      </Modal>
    );
  }
  if (!task || !pdata) {
    return (
      <Modal open onClose={onClose} wide>
        <Spinner />
      </Modal>
    );
  }

  const project = projects.find((p) => p.id === task.project_id);
  const update = (patch: any) => act('task.update', { id, patch });
  const done = !!task.completed_at;
  const assignees: string[] = task.assignees || [];
  const tags: string[] = task.tags || [];
  const running = timer?.task_id === id;
  const memberIds: string[] = pdata.members || [];
  const activeUsers = users.filter((u) => (u.active && memberIds.includes(u.id)) || assignees.includes(u.id));
  const mentionable = users.filter((u) => u.active && u.id !== me.id && (memberIds.includes(u.id) || u.role === 'owner' || u.role === 'admin'));
  const blockedBy: string[] = task.blocked_by || [];
  const siblings: any[] = pdata.tasks.filter((t: any) => t.id !== id);
  const blockers = blockedBy.map((b) => siblings.find((t) => t.id === b)).filter(Boolean);
  const waiting = blockers.some((b: any) => !b.completed_at) && !task.completed_at;

  async function addSub(e: React.FormEvent) {
    e.preventDefault();
    if (!sub.trim()) return;
    setSub('');
    await act('task.create', { projectId: task.project_id, parentId: id, title: sub });
  }
  async function addComment() {
    if (!comment.trim()) return;
    const body = comment;
    setComment('');
    await act('comment.create', { taskId: id, body });
  }
  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true);
    for (const f of Array.from(list)) await uploadFile(f, task.project_id, id);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    refresh();
  }
  async function addLink() {
    const url = window.prompt('Paste a link (Google Drive, Figma, etc.)');
    if (url) await act('file.addLink', { projectId: task.project_id, taskId: id, url });
  }
  async function remove() {
    if (!confirmDelete(`"${task.title}"`)) return;
    onClose();
    await act('task.delete', { id });
  }

  const subDone = data.subtasks.filter((s: any) => s.completed_at).length;

  return (
    <Modal open onClose={onClose} wide>
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div className="flex min-w-0 items-center gap-2 text-sm text-fg/55">
          <span className="h-2.5 w-2.5 shrink-0 rounded-[4px]" style={{ background: project?.color }} />
          <span className="truncate font-semibold">{project?.name}</span>
        </div>
        <div className="flex items-center gap-1">
          {waiting && <span className="chip bg-amber-100 text-amber-800"><Lock size={11} /> Blocked</span>}
          {canEdit && (
            <>
              <button className={`btn ${done ? 'bg-emerald-50 text-emerald-700' : 'btn-outline'}`} onClick={() => update({ done: !done })}>
                <Check size={14} /> {done ? 'Completed' : 'Mark complete'}
              </button>
              <button className="icon-btn" onClick={remove} aria-label="Delete task" title="Delete task"><Trash2 size={15} /></button>
            </>
          )}
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
      </div>

      <div className="grid gap-0 md:grid-cols-[1fr_300px]">
        {/* main column */}
        <div className="min-w-0 space-y-6 p-5">
          <fieldset disabled={!canEdit} className="m-0 min-w-0 space-y-6 border-0 p-0">
          <div>
            <textarea
              key={`t-${task.id}`}
              defaultValue={task.title}
              rows={1}
              aria-label="Task title"
              className="w-full resize-none rounded-lg border border-transparent px-2 py-1 text-xl font-extrabold tracking-tight hover:border-line focus:border-ember focus:outline-none"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), (e.target as HTMLTextAreaElement).blur())}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== task.title) update({ title: v });
                else e.target.value = task.title;
              }}
            />
            <textarea
              key={`d-${task.id}`}
              defaultValue={task.description}
              aria-label="Description"
              placeholder="Add a description…"
              className="mt-1 min-h-[90px] w-full rounded-lg border border-transparent px-2 py-1.5 text-sm leading-relaxed hover:border-line focus:border-ember focus:outline-none"
              onBlur={(e) => e.target.value !== task.description && update({ description: e.target.value })}
            />
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold">Subtasks {data.subtasks.length > 0 && <span className="font-medium text-fg/45">{subDone}/{data.subtasks.length}</span>}</h3>
            </div>
            <div className="space-y-0.5">
              {data.subtasks.map((s: any) => (
                <div key={s.id} className="group flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-fg/5">
                  <button onClick={() => act('task.update', { id: s.id, patch: { done: !s.completed_at } })} aria-label={s.completed_at ? 'Mark subtask open' : 'Mark subtask done'}>
                    {s.completed_at ? <CheckCircle2 size={17} className="text-emerald-600" /> : <Circle size={17} className="text-fg/30 hover:text-fg/60" />}
                  </button>
                  <span className={`flex-1 text-sm ${s.completed_at ? 'text-fg/40 line-through' : ''}`}>{s.title}</span>
                  <button className="icon-btn opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => act('task.delete', { id: s.id })} aria-label="Delete subtask"><X size={14} /></button>
                </div>
              ))}
            </div>
            <form onSubmit={addSub} className="mt-1 flex items-center gap-2 px-2">
              <Plus size={15} className="text-fg/35" />
              <input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Add a subtask and press Enter" aria-label="New subtask" className="flex-1 bg-transparent py-1 text-sm placeholder:text-fg/35 focus:outline-none" />
            </form>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-bold">Dependencies</h3>
            {blockers.length > 0 && <p className="mb-1 px-2 text-[11px] font-bold uppercase tracking-wide text-fg/45">Blocked by</p>}
            <div className="space-y-0.5">
              {blockers.map((b: any) => (
                <div key={b.id} className="group flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-fg/5">
                  {b.completed_at ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Lock size={15} className="text-amber-600" />}
                  <button type="button" onClick={() => openTask(b.id)} className={`min-w-0 flex-1 truncate text-left text-sm hover:text-ember ${b.completed_at ? 'text-fg/45 line-through' : 'font-medium'}`}>{b.title}</button>
                  <button className="icon-btn opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => update({ blocked_by: blockedBy.filter((x) => x !== b.id) })} aria-label="Remove dependency"><X size={14} /></button>
                </div>
              ))}
            </div>
            <select aria-label="Add a task this one is blocked by" className="input mt-1 py-1.5" value="" onChange={(e) => e.target.value && update({ blocked_by: [...blockedBy, e.target.value] })}>
              <option value="">Add a task this one is waiting on…</option>
              {siblings.filter((t) => !blockedBy.includes(t.id)).map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
            {data.blocking.length > 0 && (
              <>
                <p className="mb-1 mt-3 px-2 text-[11px] font-bold uppercase tracking-wide text-fg/45">Blocking</p>
                {data.blocking.map((b: any) => (
                  <button key={b.id} type="button" onClick={() => openTask(b.id)} className={`block w-full truncate rounded-lg px-2 py-1 text-left text-sm hover:bg-fg/5 hover:text-ember ${b.completed_at ? 'text-fg/45 line-through' : 'font-medium'}`}>{b.title}</button>
                ))}
              </>
            )}
          </section>
          </fieldset>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold">Attachments</h3>
              <div className="flex gap-1">
                <button className="btn-ghost px-2 py-1 text-xs" onClick={addLink}><Link2 size={13} /> Add link</button>
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  <Paperclip size={13} /> {uploading ? 'Uploading…' : 'Upload'}
                </button>
                <input ref={fileRef} type="file" multiple hidden onChange={(e) => onFiles(e.target.files)} />
              </div>
            </div>
            {data.files.length === 0 ? (
              <p className="px-2 text-sm text-fg/40">No attachments yet. Files up to 4 MB, or add a link.</p>
            ) : (
              <div className="space-y-1">
                {data.files.map((f: any) => (
                  <div key={f.id} className="group flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm">
                    {f.url ? <Link2 size={14} className="text-fg/40" /> : <Paperclip size={14} className="text-fg/40" />}
                    <a href={f.url || `/api/files/${f.id}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-medium hover:text-ember">{f.name}</a>
                    {!f.url && <span className="text-xs text-fg/40">{fmtSize(f.size)}</span>}
                    {canEdit && <button className="icon-btn opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => confirmDelete(`"${f.name}"`) && act('file.delete', { id: f.id })} aria-label="Delete attachment"><X size={14} /></button>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-bold">Comments</h3>
            <div className="space-y-3">
              {data.comments.map((c: any) => {
                const u = users.find((x) => x.id === c.user_id);
                return (
                  <div key={c.id} className="group flex gap-2.5">
                    <Avatar user={u} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-fg/45">
                        <span className="font-bold text-fg">{u?.name || 'Former member'}</span> · {fmtDateTime(c.created_at)}
                        {(c.user_id === me.id || isAdmin) && (
                          <button className="ml-2 opacity-0 hover:text-red-600 group-hover:opacity-100 focus:opacity-100" onClick={() => act('comment.delete', { id: c.id })}>Delete</button>
                        )}
                      </p>
                      <RichText text={c.body} className="text-sm leading-relaxed" />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex gap-2.5">
              <Avatar user={me} size={28} />
              <MentionInput value={comment} onChange={setComment} onSubmit={addComment} people={mentionable} label="New comment"
                placeholder="Write a comment. Type @ to mention someone. Enter to send." className="min-h-[60px]" />
            </div>
          </section>
        </div>

        {/* side column */}
        <aside className="border-t border-line bg-paper/60 p-5 md:rounded-br-2xl md:border-l md:border-t-0">
          <fieldset disabled={!canEdit} className="m-0 min-w-0 space-y-4 border-0 p-0">
          <div>
            <label className="label" htmlFor="t-status">List</label>
            <select id="t-status" className="input" value={task.status_id || ''} onChange={(e) => update({ status_id: e.target.value })}>
              {pdata.statuses.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <span className="label">Assignees</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {assignees.map((uid) => {
                const u = users.find((x) => x.id === uid);
                return (
                  <span key={uid} className="chip bg-surface py-1 pl-1 pr-2 ring-1 ring-line">
                    <Avatar user={u} size={18} /> {u?.name.split(' ')[0] || 'Unknown'}
                    <button onClick={() => update({ assignees: assignees.filter((x) => x !== uid) })} aria-label={`Remove ${u?.name}`}><X size={11} /></button>
                  </span>
                );
              })}
              <Menu align="left" trigger={<button className="icon-btn border border-dashed border-fg/25" aria-label="Add assignee"><Plus size={14} /></button>}>
                {() => (
                  <div className="max-h-64 overflow-y-auto">
                    {activeUsers.map((u) => {
                      const on = assignees.includes(u.id);
                      return (
                        <button key={u.id} onClick={() => update({ assignees: on ? assignees.filter((x) => x !== u.id) : [...assignees, u.id] })}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-fg/5">
                          <Avatar user={u} size={22} /> <span className="flex-1 truncate">{u.name}</span> {on && <Check size={14} className="text-ember" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </Menu>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="t-start">Start</label>
              <input id="t-start" type="date" className="input px-1.5 text-[13px]" value={task.start_date || ''} onChange={(e) => update({ start_date: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="t-due">Due</label>
              <input id="t-due" type="date" className="input px-1.5 text-[13px]" value={task.due_date || ''} onChange={(e) => update({ due_date: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="t-rec">Repeat</label>
            <select id="t-rec" className="input" value={task.recurrence || ''} onChange={(e) => update({ recurrence: e.target.value })}>
              <option value="">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
            </select>
            {task.recurrence && <p className="mt-1 text-xs text-fg/50">When you complete this task, the next one is created with the following due date.</p>}
          </div>

          <div>
            <label className="label" htmlFor="t-pri">Priority</label>
            <select id="t-pri" className="input" value={task.priority} onChange={(e) => update({ priority: e.target.value })}>
              {Object.entries(PRIORITIES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="t-ms">Milestone</label>
            <select id="t-ms" className="input" value={task.milestone_id || ''} onChange={(e) => update({ milestone_id: e.target.value })}>
              <option value="">No milestone</option>
              {pdata.milestones.map((m: any) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <span className="label">Tags</span>
            <div className="flex flex-wrap gap-1">
              {tags.map((t) => (
                <span key={t} className="chip bg-fg/10 text-fg/70">
                  {t}
                  <button onClick={() => update({ tags: tags.filter((x) => x !== t) })} aria-label={`Remove tag ${t}`}><X size={11} /></button>
                </span>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const v = tag.trim();
                if (v && !tags.includes(v)) update({ tags: [...tags, v] });
                setTag('');
              }}
            >
              <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Add a tag and press Enter" aria-label="New tag" className="input mt-1.5 py-1.5" />
            </form>
          </div>

          <div>
            <span className="label">Time tracked</span>
            <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2">
              <span className="flex items-center gap-1.5 text-sm font-bold tabular-nums"><Clock size={14} className="text-fg/40" /> {fmtDur(data.seconds)}</span>
              {running ? (
                <button className="btn bg-ember px-2 py-1 text-xs text-white" onClick={() => act('time.stop')}><Square size={11} fill="currentColor" /> Stop</button>
              ) : (
                <button className="btn-dark px-2 py-1 text-xs" onClick={() => act('time.start', { taskId: id })}><Play size={11} fill="currentColor" /> Start</button>
              )}
            </div>
          </div>
          </fieldset>
        </aside>
      </div>
    </Modal>
  );
}
