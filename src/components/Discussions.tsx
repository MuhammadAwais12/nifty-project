'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerUpLeft, MessageSquare, Pencil, Send, Trash2, X } from 'lucide-react';
import { act, refresh, rpc, toast, useQ } from '@/lib/api';
import { Avatar, Empty, MentionInput, RichText, Spinner, confirmDelete, fmtDateTime, useApp, useProjectPeople, ymd } from './ui';
import { AttachButton, AttachmentList, PendingAttachments, useAttachments } from './Attach';

export function Discussions({ projectId, members }: { projectId: string; members: string[] }) {
  const { users, me, canEdit, isAdmin } = useApp();
  const people = useProjectPeople(projectId, members);
  const { data } = useQ<any[]>('message.list', { projectId }, { refreshInterval: 4000 });
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const attach = useAttachments(projectId);
  const endRef = useRef<HTMLDivElement>(null);
  const count = data?.length || 0;

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [count]);
  // reading the discussion clears this project's badge
  useEffect(() => {
    if (!data) return;
    rpc('channel.read', { projectId }).then(refresh).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, count]);

  /** Top-level messages, each with its replies underneath. */
  const threads = useMemo(() => {
    const list = data || [];
    const replies = new Map<string, any[]>();
    for (const m of list) {
      if (!m.parent_id) continue;
      const bucket = replies.get(m.parent_id);
      if (bucket) bucket.push(m);
      else replies.set(m.parent_id, [m]);
    }
    return list.filter((m) => !m.parent_id).map((m) => ({ ...m, replies: replies.get(m.id) || [] }));
  }, [data]);

  async function send() {
    const text = body.trim();
    if (!text && !attach.ids.length) return;
    const fileIds = attach.ids;
    const parentId = replyTo?.id || null;
    setBody('');
    attach.reset();
    setReplyTo(null);
    try {
      await rpc('message.create', { projectId, body: text, fileIds, parentId });
      refresh();
    } catch (e: any) {
      setBody(text);
      toast(e.message);
    }
  }
  async function saveEdit(id: string) {
    const text = draft.trim();
    setEditing(null);
    if (text) await act('message.update', { id, body: text });
  }
  if (!data) return <Spinner />;

  function renderMessage(m: any, reply = false) {
    const u = users.find((x) => x.id === m.user_id);
    const mine = m.user_id === me.id;
    return (
      <div className={`group relative flex gap-3 rounded-lg px-2 py-1.5 hover:bg-surface ${reply ? 'ml-6 border-l-2 border-line pl-3' : ''}`}>
        <Avatar user={u} size={reply ? 24 : 32} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-fg/45">
            <span className={`font-bold text-fg ${reply ? 'text-[13px]' : 'text-sm'}`}>{u?.name || 'Former member'}</span>
            <span>{fmtDateTime(m.created_at)}</span>
            {m.edited_at && <span className="italic">edited</span>}
          </p>
          {editing === m.id ? (
            <div className="mt-1 max-w-xl">
              <textarea className="input min-h-[64px] text-sm" value={draft} autoFocus onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(m.id); } if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }} />
              <div className="mt-1 flex gap-1.5">
                <button className="btn-primary px-2 py-1 text-xs" onClick={() => saveEdit(m.id)}>Save</button>
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              {m.body && <RichText text={m.body} className="text-sm leading-relaxed" />}
              <AttachmentList items={m.attachments || []} />
            </>
          )}
        </div>
        <div className="absolute right-2 top-0 hidden -translate-y-1/2 gap-0.5 rounded-lg border border-line bg-surface p-0.5 shadow-card group-hover:flex group-focus-within:flex">
          {!reply && <button className="icon-btn" title="Reply" aria-label="Reply to message" onClick={() => { setReplyTo(m); setEditing(null); }}><CornerUpLeft size={14} /></button>}
          {mine && <button className="icon-btn" title="Edit" aria-label="Edit message" onClick={() => { setEditing(m.id); setDraft(m.body); }}><Pencil size={14} /></button>}
          {(mine || isAdmin) && (
            <button className="icon-btn hover:text-red-600" title="Delete" aria-label="Delete message"
              onClick={() => confirmDelete(reply ? 'this reply' : 'this message and its replies') && act('message.delete', { id: m.id })}><Trash2 size={14} /></button>
          )}
        </div>
      </div>
    );
  }

  let lastDay = '';
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {count === 0 && <Empty icon={<MessageSquare size={32} />} title="Start the conversation" hint="Keep project talk here instead of scattered chats. Paste a screenshot straight into the box, reply in a thread, or turn any message into a task." />}
        <div className="mx-auto max-w-3xl">
          {threads.map((m) => {
            const day = ymd(new Date(m.created_at));
            const showDay = day !== lastDay;
            lastDay = day;
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="my-3 flex items-center gap-3 text-[11px] font-bold uppercase tracking-wide text-fg/40">
                    <span className="h-px flex-1 bg-line" />
                    {new Date(m.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    <span className="h-px flex-1 bg-line" />
                  </div>
                )}
                {renderMessage(m)}
                {m.replies.map((r: any) => <div key={r.id}>{renderMessage(r, true)}</div>)}
                {m.replies.length > 0 && (
                  <button className="ml-10 mt-0.5 text-xs font-semibold text-fg/45 hover:text-ember" onClick={() => setReplyTo(m)}>
                    Reply to this thread
                  </button>
                )}
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t border-line bg-surface px-4 py-3 sm:px-6">
        <div className="mx-auto max-w-3xl">
          {replyTo && (
            <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-fg/5 px-2.5 py-1.5 text-xs">
              <CornerUpLeft size={13} className="shrink-0 text-fg/45" />
              <span className="min-w-0 flex-1 truncate">
                Replying to <span className="font-semibold">{users.find((u) => u.id === replyTo.user_id)?.name || 'a message'}</span>
                {replyTo.body ? ` — ${replyTo.body.slice(0, 70)}` : ''}
              </span>
              <button onClick={() => setReplyTo(null)} className="rounded p-0.5 hover:bg-fg/10" aria-label="Cancel reply"><X size={13} /></button>
            </div>
          )}
          <PendingAttachments a={attach} />
          <div className="flex items-end gap-2">
            <MentionInput
              value={body} onChange={setBody} onSubmit={send}
              people={people.mentionable} others={people.others} onPickOther={people.addToProject}
              onPaste={attach.onPaste}
              label="Message" rows={Math.min(6, Math.max(1, body.split('\n').length))}
              placeholder={replyTo ? 'Write your reply…' : 'Message the project team. @ to mention, paste a screenshot to attach.'}
              className="resize-none"
            />
            <AttachButton a={attach} label="Attach files to this message" />
            <button className="btn-primary h-[38px]" onClick={send} disabled={!body.trim() && !attach.ids.length} aria-label="Send message"><Send size={15} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
