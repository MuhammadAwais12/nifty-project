'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, MessagesSquare, Plus, Search, Send, Users } from 'lucide-react';
import { act, refresh, rpc, toast, useQ } from '@/lib/api';
import { Avatar, Empty, MentionInput, Modal, RichText, Spinner, fmtDateTime, useApp, ymd, type UserT } from '@/components/ui';

/* ───────────── start a new direct or group chat ───────────── */
function NewConversation({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const { users, me } = useApp();
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [q, setQ] = useState('');
  const people = users.filter((u) => u.active && u.role !== 'guest' && u.id !== me.id && u.name.toLowerCase().includes(q.toLowerCase()));
  async function start() {
    const res = await act('dm.open', { userIds: picked, name });
    if (res) onOpen(res.id);
  }
  return (
    <Modal open onClose={onClose} title="New message">
      <div className="space-y-4 p-5">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg/35" />
          <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" aria-label="Search people" autoFocus />
        </div>
        {!people.length && <p className="text-sm text-fg/55">{q ? 'Nobody matches that.' : 'You are the only one here so far. Invite teammates from the Team page.'}</p>}
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

/* ───────────── one conversation ───────────── */
function Thread({ id, title, subtitle, people }: { id: string; title: string; subtitle?: string; people: UserT[] }) {
  const { users, me } = useApp();
  const { data } = useQ<any[]>('dm.messages', { id }, { refreshInterval: 4000 });
  const [body, setBody] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const count = data?.length || 0;

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [count, id]);
  useEffect(() => { if (data) refresh(); /* opening marks it read */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, !!data]);

  async function send() {
    const text = body.trim();
    if (!text) return;
    setBody('');
    try {
      await rpc('dm.send', { id, body: text });
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
  const { users, me, canEdit } = useApp();
  const { data: dms } = useQ<any[]>(canEdit ? 'dm.list' : null, undefined, { refreshInterval: 6000 });
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');

  const dmId = params.get('c');
  const open = (href: string) => router.replace(href, { scroll: false });
  const list = dms || [];
  const others = (c: any) => (c.member_ids || []).filter((id: string) => id !== me.id).map((id: string) => users.find((u) => u.id === id)).filter(Boolean) as UserT[];
  const titleOf = (c: any) => c.name || others(c).map((u: any) => (c.is_group ? u.name.split(' ')[0] : u.name)).join(', ') || 'Conversation';
  const shown = list.filter((c) => titleOf(c).toLowerCase().includes(q.toLowerCase()));

  useEffect(() => {
    if (dmId || !dms) return;
    if (typeof window !== 'undefined' && window.innerWidth < 768) return;
    if (list.length) open(`/chat?c=${list[0].id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length, dmId, !!dms]);

  const dm = list.find((c) => c.id === dmId);

  if (!canEdit) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Empty icon={<MessagesSquare size={36} />} title="Chat is for the team" hint="As a guest you can take part in each project's Discussions instead." />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className={`w-full shrink-0 flex-col border-r border-line md:flex md:w-80 ${dm ? 'hidden' : 'flex'}`}>
        <div className="flex items-center justify-between px-4 py-4">
          <h1 className="text-xl font-extrabold tracking-tight">Messages</h1>
          <button className="btn-primary px-2.5" onClick={() => setCreating(true)}><Plus size={15} /> New</button>
        </div>
        <div className="px-4 pb-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg/35" />
            <input className="input py-1.5 pl-8 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" aria-label="Search conversations" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {!dms && <Spinner />}
          {dms && !shown.length && <p className="px-3 py-3 text-sm text-fg/50">{q ? 'Nobody matches that.' : 'No conversations yet. Start one with New.'}</p>}
          {shown.map((c) => {
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
        </div>
      </div>

      {dm ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <button className="border-b border-line bg-surface px-4 py-2 text-left text-sm font-semibold text-ember md:hidden" onClick={() => open('/chat')}>← All conversations</button>
          <div className="min-h-0 flex-1">
            <Thread key={dm.id} id={dm.id} title={titleOf(dm)} subtitle={others(dm).length > 1 ? `${others(dm).length + 1} people` : undefined} people={others(dm)} />
          </div>
        </div>
      ) : (
        <div className="hidden flex-1 items-center justify-center p-6 md:flex">
          <Empty icon={<MessagesSquare size={36} />} title="Messages" hint="Private one-to-one and group chats with the team. Project conversation lives in each project's Discussions tab."
            action={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={14} /> New message</button>} />
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
