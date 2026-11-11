'use client';
import { useEffect, useRef, useState } from 'react';
import { ListPlus, MessageSquare, Send, Trash2 } from 'lucide-react';
import { act, toast, useQ } from '@/lib/api';
import { Avatar, Empty, MentionInput, RichText, Spinner, fmtDateTime, useApp, ymd } from './ui';

export function Discussions({ projectId, members }: { projectId: string; members: string[] }) {
  const { users, me, canEdit, isAdmin } = useApp();
  const mentionable = users.filter((u) => u.active && u.id !== me.id && (members.includes(u.id) || u.role === 'owner' || u.role === 'admin'));
  const { data } = useQ<any[]>('message.list', { projectId }, { refreshInterval: 5000 });
  const [body, setBody] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const count = data?.length || 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [count]);

  async function send() {
    const text = body.trim();
    if (!text) return;
    setBody('');
    await act('message.create', { projectId, body: text });
  }
  async function toTask(m: any) {
    const title = m.body.split('\n')[0].slice(0, 140);
    const res = await act('task.create', { projectId, title, description: m.body.length > title.length ? m.body : '' });
    if (res) toast('Task created from message');
  }

  if (!data) return <Spinner />;
  let lastDay = '';

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {count === 0 && <Empty icon={<MessageSquare size={32} />} title="Start the conversation" hint="Keep project talk here instead of scattered chats. Any message can become a task." />}
        <div className="mx-auto max-w-3xl space-y-1">
          {data.map((m, i) => {
            const u = users.find((x) => x.id === m.user_id);
            const day = ymd(new Date(m.created_at));
            const showDay = day !== lastDay;
            lastDay = day;
            const prev = data[i - 1];
            const grouped = !showDay && prev && prev.user_id === m.user_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60000;
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="my-3 flex items-center gap-3 text-[11px] font-bold uppercase tracking-wide text-fg/40">
                    <span className="h-px flex-1 bg-line" />
                    {new Date(m.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    <span className="h-px flex-1 bg-line" />
                  </div>
                )}
                <div className={`group relative flex gap-3 rounded-lg px-2 py-1 hover:bg-surface ${grouped ? '' : 'mt-2'}`}>
                  <div className="w-8 shrink-0">{!grouped && <Avatar user={u} size={32} />}</div>
                  <div className="min-w-0 flex-1">
                    {!grouped && (
                      <p className="text-xs text-fg/45">
                        <span className="text-sm font-bold text-fg">{u?.name || 'Former member'}</span> · {fmtDateTime(m.created_at)}
                      </p>
                    )}
                    <RichText text={m.body} className="text-sm leading-relaxed" />
                  </div>
                  <div className={`absolute right-2 top-0 hidden -translate-y-1/2 gap-0.5 rounded-lg border border-line bg-surface p-0.5 shadow-card ${canEdit || m.user_id === me.id ? 'group-hover:flex group-focus-within:flex' : ''}`}>
                    {canEdit && <button className="icon-btn" title="Create task from message" aria-label="Create task from message" onClick={() => toTask(m)}><ListPlus size={14} /></button>}
                    {(m.user_id === me.id || isAdmin) && (
                      <button className="icon-btn hover:text-red-600" title="Delete message" aria-label="Delete message" onClick={() => act('message.delete', { id: m.id })}><Trash2 size={14} /></button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      </div>
      <div className="border-t border-line bg-surface px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <MentionInput value={body} onChange={setBody} onSubmit={send} people={mentionable} label="Message" rows={Math.min(6, Math.max(1, body.split('\n').length))}
            placeholder="Message the project team. Type @ to mention someone. Enter to send." className="resize-none" />
          <button className="btn-primary h-[38px]" onClick={send} disabled={!body.trim()} aria-label="Send message"><Send size={15} /></button>
        </div>
      </div>
    </div>
  );
}
