'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Hash, MessagesSquare, Plus, Send, Users } from 'lucide-react';
import { act, rpc, refresh, toast, useQ } from '@/lib/api';
import { Avatar, Empty, MentionInput, Modal, RichText, Spinner, fmtDateTime, useApp, ymd, type UserT } from '@/components/ui';

/* ───────────── start a new direct or group chat ───────────── */
function NewConversation({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const { users, me } = useApp();
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState('');
  const people = users.filter((u) => u.active && u.role !== 'guest' && u.id !== me.id);
  async function start() {
    const res = await act('dm.open', { userIds: picked, name });
    if (res) onOpen(res.id);
  }
  return (
    <Modal open onClose={onClose} title="New message">
      <div className="space-y-4 p-5">
        {!people.length && <p className="text-sm text-fg/55">You&apos;re the only one here so far. Invite teammates from the Team page.</p>}
        <div className="max-h-72 space-y-0.5 overflow-y-auto">
          {people.map((u) => {
            const on = picked.includes(u.id);
            return (
              <button key={u.id} onClick={() => setPicked(on ? picked.filter((x) => x !== u.id) : [...picked, u.id])} aria-pressed={on}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm ${on ? 'bg-ember/15 text-ember' : 'hover:bg-fg/5'}`}>
                <Avatar user={u} size={28} /> <span className="flex-1 truncate font-semibold">{u.name}</span> {on && <Check size={16} className="text-ember" />}
              </button>
            );
          })}
        </div>
        {picked.length > 1 && (
          <div>
            <label className="label" htmlFor="dm-name">Group name (optional)</label>
            <input id="dm-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. SEO team" />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!picked.length} onClick={start}>{picked.length > 1 ? 'Start group chat' : 'Start chat'}</button>
        </div>
      </div>
    </Modal>
  );
}

/* ───────────── one thread: a project channel or a direct chat ───────────── */
function Thread({ kind, id, title, subtitle, people }: { kind: 'channel' | 'dm'; id: string; title: string; subtitle?: string; people: UserT[] }) {
  const { users, me } = useApp();
  const query = kind === 'dm' ? { id } : { projectId: id };
  const { data } = useQ<any[]>(kind === 'dm' ? 'dm.messages' : 'message.list', query, { refreshInterval: 5000 });
  const [body, setBody] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const count = data?.length || 0;

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [count, id]);
  // opening a thread marks it read, so refresh the badges once the messages arrive
  useEffect(() => {
    if (!data) return;
    if (kind === 'channel') rpc('channel.read', { projectId: id }).then(refresh).catch(() => {});
    else refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, !!data]);

  async function send() {
    const text = body.trim();
    if (!text) return;
    setBody('');
    try {
      await rpc(kind === 'dm' ? 'dm.send' : 'message.create', kind === 'dm' ? { id, body: text } : { projectId: id, body: text });
      refresh();
    } catch (e: any) {
      setBody(text);
      toast(e.message);
    }
  }

  let lastDay = '';
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-surface px-5 py-3">
        {kind === 'channel' && <Hash size={16} className="text-fg/40" />}
        <h2 className="truncate font-bold">{title}</h2>
        {subtitle && <span className="truncate text-xs text-fg/45">{subtitle}</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {!data && <Spinner />}
        {data && !count && <p className="py-10 text-center text-sm text-fg/45">No messages yet. Say hello.</p>}
        <div className="mx-auto max-w-3xl space-y-2">
          {data?.map((m) => {
            const u = users.find((x) => x.id === m.user_id);
            const mine = m.user_id === me.id;
            const day = ymd(new Date(m.created_at));
            const showDay = day !== lastDay;
            lastDay = day;
            return (
              <div key={m.id}>
                {showDay && <p className="my-3 text-center text-[11px] font-bold uppercase tracking-wide text-fg/40">{new Date(m.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>}
                <div className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                  {!mine && <Avatar user={u} size={26} />}
                  <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${mine ? 'rounded-br-md bg-ember text-white' : 'rounded-bl-md bg-surface shadow-card ring-1 ring-line'}`}>
                    {!mine && <p className="text-[11px] font-bold" style={{ color: u?.color }}>{u?.name || 'Former member'}</p>}
                    <RichText text={m.body} className={`text-sm leading-relaxed ${mine ? '[&_a]:text-white [&_span]:bg-white/25 [&_span]:text-white' : ''}`} />
                    <p className={`mt-0.5 text-[10px] ${mine ? 'text-white/70' : 'text-fg/40'}`}>{fmtDateTime(m.created_at)}</p>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={end} />
        </div>
      </div>
      <div className="border-t border-line bg-surface px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <MentionInput value={body} onChange={setBody} onSubmit={send} people={people} label="Message" rows={Math.min(6, Math.max(1, body.split('\n').length))}
            placeholder="Write a message. Enter to send, Shift+Enter for a new line." className="resize-none" />
          <button className="btn-primary h-[38px]" onClick={send} disabled={!body.trim()} aria-label="Send message"><Send size={15} /></button>
        </div>
      </div>
    </div>
  );
}

function ChatInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { users, me, projects, canEdit } = useApp();
  const { data: dms } = useQ<any[]>(canEdit ? 'dm.list' : null, undefined, { refreshInterval: 8000 });
  const [creating, setCreating] = useState(false);

  const channelId = params.get('p');
  const dmId = params.get('c');
  const open = (href: string) => router.replace(href, { scroll: false });

  const channels = projects.filter((p: any) => !p.archived);
  const list = dms || [];
  const others = (c: any) => (c.member_ids || []).filter((id: string) => id !== me.id).map((id: string) => users.find((u) => u.id === id)).filter(Boolean) as UserT[];
  const titleOf = (c: any) => c.name || others(c).map((u: any) => (c.is_group ? u.name.split(' ')[0] : u.name)).join(', ') || 'Conversation';

  // default to something sensible on a wide screen
  useEffect(() => {
    if (channelId || dmId) return;
    if (typeof window !== 'undefined' && window.innerWidth < 768) return;
    if (canEdit && !dms) return; // wait until direct messages have loaded before picking a default
    const unreadChannel = channels.find((p: any) => p.chat_unread > 0);
    if (list.length) open(`/chat?c=${list[0].id}`);
    else if (unreadChannel) open(`/chat?p=${unreadChannel.id}`);
    else if (channels.length) open(`/chat?p=${channels[0].id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length, channels.length, channelId, dmId, !!dms]);

  const channel = channels.find((p: any) => p.id === channelId);
  const dm = list.find((c) => c.id === dmId);
  const showing = !!(channel || dm);

  return (
    <div className="flex h-full">
      <div className={`w-full shrink-0 flex-col border-r border-line md:flex md:w-80 ${showing ? 'hidden' : 'flex'}`}>
        <div className="flex items-center justify-between px-4 py-4">
          <h1 className="text-xl font-extrabold tracking-tight">Chat</h1>
          {canEdit && <button className="btn-primary px-2.5" onClick={() => setCreating(true)}><Plus size={15} /> New</button>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-widest text-fg/40">Project channels</p>
          {!channels.length && <p className="px-3 py-2 text-sm text-fg/50">No projects yet.</p>}
          {channels.map((p: any) => (
            <button key={p.id} onClick={() => open(`/chat?p=${p.id}`)}
              className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left ${channelId === p.id ? 'bg-surface shadow-card ring-1 ring-line' : 'hover:bg-fg/5'}`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: p.color }}><Hash size={15} /></span>
              <span className={`min-w-0 flex-1 truncate text-sm ${p.chat_unread ? 'font-extrabold' : 'font-semibold'}`}>{p.name}</span>
              {p.chat_unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-ember px-1.5 text-[11px] font-bold text-white">{p.chat_unread}</span>}
            </button>
          ))}

          {canEdit && (
            <>
              <p className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-widest text-fg/40">Direct messages</p>
              {!list.length && <p className="px-3 py-2 text-sm text-fg/50">No direct messages yet.</p>}
              {list.map((c) => {
                const people = others(c);
                return (
                  <button key={c.id} onClick={() => open(`/chat?c=${c.id}`)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left ${dmId === c.id ? 'bg-surface shadow-card ring-1 ring-line' : 'hover:bg-fg/5'}`}>
                    {c.is_group ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-white"><Users size={15} /></span> : <Avatar user={people[0]} size={32} />}
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${c.unread ? 'font-extrabold' : 'font-semibold'}`}>{titleOf(c)}</span>
                      <span className={`block truncate text-xs ${c.unread ? 'font-semibold text-fg' : 'text-fg/50'}`}>{c.last ? `${c.last.user_id === me.id ? 'You: ' : ''}${c.last.body}` : 'No messages yet'}</span>
                    </span>
                    {c.unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-ember px-1.5 text-[11px] font-bold text-white">{c.unread}</span>}
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>

      {showing ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <button className="border-b border-line bg-surface px-4 py-2 text-left text-sm font-semibold text-ember md:hidden" onClick={() => open('/chat')}>← All conversations</button>
          <div className="min-h-0 flex-1">
            {channel ? (
              <Thread key={`p${channel.id}`} kind="channel" id={channel.id} title={channel.name} subtitle="Project channel — same thread as Discussions"
                people={users.filter((u) => (channel.member_ids || []).includes(u.id))} />
            ) : (
              <Thread key={`c${dm.id}`} kind="dm" id={dm.id} title={titleOf(dm)} subtitle={others(dm).length > 1 ? `${others(dm).length + 1} people` : undefined} people={others(dm)} />
            )}
          </div>
        </div>
      ) : (
        <div className="hidden flex-1 items-center justify-center p-6 md:flex">
          <Empty icon={<MessagesSquare size={36} />} title="Chat" hint="Project channels sit next to the work. Direct messages are private one-to-one and group chats."
            action={canEdit ? <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={14} /> New message</button> : undefined} />
        </div>
      )}
      {creating && <NewConversation onClose={() => setCreating(false)} onOpen={(id) => { setCreating(false); open(`/chat?c=${id}`); }} />}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ChatInner />
    </Suspense>
  );
}
