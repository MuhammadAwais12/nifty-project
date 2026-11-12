'use client';
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { act, toast } from '@/lib/api';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { X, Flag, Loader2 } from 'lucide-react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/* ───────────── shared app context ───────────── */
export type Role = 'owner' | 'admin' | 'manager' | 'member' | 'guest';
export type UserT = { id: string; name: string; email: string; role: Role; color: string; avatar_url?: string; active: boolean };
export const RANK: Record<Role, number> = { owner: 4, admin: 3, manager: 2, member: 1, guest: 0 };
export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', manager: 'Manager', member: 'Member', guest: 'Guest' };
export const ROLE_BLURB: Record<Role, string> = {
  owner: 'Full control of the workspace.',
  admin: 'Everything except removing the owner. Sees every project.',
  manager: 'Creates projects and manages who is on the projects they belong to.',
  member: 'Works on the projects they are added to.',
  guest: 'Client access: views their projects, comments and shares files.',
};

export type Portfolio = { id: string; name: string; color: string; position: number; project_count: number };

export type AppCtx = {
  me: UserT;
  users: UserT[];
  projects: any[];
  portfolios: Portfolio[];
  timer: any | null;
  unread: number;
  dmUnread: number;
  /** false for guests, who can only view, comment and share files */
  canEdit: boolean;
  /** true for managers, admins and the owner: can create projects and manage members */
  canManage: boolean;
  /** true for admins and the owner: can manage the team and workspace settings */
  isAdmin: boolean;
  openTask: (id: string) => void;
};
export const AppContext = createContext<AppCtx>(null as any);
export const useApp = () => useContext(AppContext);
export const useUser = (id?: string | null) => useApp().users.find((u) => u.id === id);

/* ───────────── constants & helpers ───────────── */
export const COLORS = ['#ff5a36', '#5b6cff', '#12b886', '#f59f00', '#e64980', '#7950f2', '#1c7ed6', '#0ca678'];
export const PRIORITIES: Record<string, { label: string; color: string }> = {
  high: { label: 'High', color: '#e03131' },
  medium: { label: 'Medium', color: '#f59f00' },
  low: { label: 'Low', color: '#1c7ed6' },
  none: { label: 'None', color: '#b8b5aa' },
};

const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const parseYmd = (s: string) => new Date(`${s}T00:00:00`);
export const addDays = (s: string, n: number) => {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const daysBetween = (a: string, b: string) => Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86400000);

export function fmtDate(s?: string | null) {
  if (!s) return '';
  const d = parseYmd(s.slice(0, 10));
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}
export function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const day = ymd(d) === today() ? 'Today' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}
export function fmtDur(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (!h && !m) return `${s}s`;
  return h ? `${h}h ${pad(m)}m` : `${m}m`;
}
export function fmtClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
export function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
export const isOverdue = (t: any) => !!t.due_date && !t.completed_at && t.due_date < today();

/** Ticks every second so running timers stay live. */
export function useNow(active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/* ───────────── primitives ───────────── */
export function Avatar({ user, size = 24, ring = true }: { user?: { name: string; color: string; avatar_url?: string } | null; size?: number; ring?: boolean }) {
  const initials = (user?.name || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const base = `inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full object-cover font-bold text-white ${ring ? 'ring-2 ring-surface' : ''}`;
  if (user?.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.avatar_url} alt={user.name} title={user.name} className={base} style={{ width: size, height: size }} referrerPolicy="no-referrer" />;
  }
  return (
    <span title={user?.name || 'Unknown'} className={base} style={{ width: size, height: size, fontSize: size * 0.4, background: user?.color || '#b8b5aa' }}>
      {initials}
    </span>
  );
}

export function AvatarStack({ ids, size = 22, max = 3 }: { ids: string[]; size?: number; max?: number }) {
  const { users } = useApp();
  const list = ids.map((id) => users.find((u) => u.id === id)).filter(Boolean) as UserT[];
  if (!list.length) return null;
  return (
    <span className="inline-flex -space-x-1.5">
      {list.slice(0, max).map((u) => (
        <Avatar key={u.id} user={u} size={size} />
      ))}
      {list.length > max && (
        <span className="inline-flex items-center justify-center rounded-full bg-fg/10 text-[10px] font-bold text-fg/60 ring-2 ring-surface" style={{ width: size, height: size }}>
          +{list.length - max}
        </span>
      )}
    </span>
  );
}

export function Modal({ open, onClose, title, children, wide, xl }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean; xl?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-scrim/50 p-3 sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className={`w-full ${xl ? 'max-w-6xl' : wide ? 'max-w-4xl' : 'max-w-md'} rounded-2xl bg-surface shadow-pop`}>
        {title !== undefined && (
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="text-base font-bold">{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/** Small dropdown menu anchored to its trigger. */
export function Menu({ trigger, children, align = 'right', up }: { trigger: ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; up?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    // Escape closes the menu first, without also closing a dialog behind it
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  return (
    <div ref={ref} className={`relative ${up ? 'block' : 'inline-block'}`}>
      <span onClick={() => setOpen((o) => !o)}>{trigger}</span>
      {open && (
        <div className={`absolute z-40 min-w-[180px] rounded-xl border border-line bg-surface p-1 text-fg shadow-pop ${up ? 'bottom-full mb-1' : 'mt-1'} ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
export function MenuItem({ onClick, children, danger }: { onClick: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium hover:bg-fg/5 ${danger ? 'text-red-600' : 'text-fg/80'}`}>
      {children}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-10 text-sm text-fg/50">
      <Loader2 size={16} className="animate-spin" /> {label || 'Loading…'}
    </div>
  );
}

export function Empty({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface/60 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-fg/30">{icon}</div>}
      <p className="font-bold">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-fg/55">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Progress({ value, color = '#12b886', className = '' }: { value: number; color?: string; className?: string }) {
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-fg/10 ${className}`}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
    </div>
  );
}

export function PriorityFlag({ priority }: { priority: string }) {
  if (!priority || priority === 'none') return null;
  const p = PRIORITIES[priority];
  return (
    <span title={`${p.label} priority`} className="inline-flex">
      <Flag size={13} fill={p.color} color={p.color} />
    </span>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Color ${c}`}
          onClick={() => onChange(c)}
          className={`h-6 w-6 rounded-full ring-offset-2 ${value === c ? 'ring-2 ring-fg' : ''}`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

export function Toasts() {
  const [items, setItems] = useState<{ id: number; text: string }[]>([]);
  useEffect(() => {
    const onToast = (e: Event) => {
      const id = Date.now() + Math.random();
      setItems((l) => [...l, { id, text: (e as CustomEvent).detail }]);
      setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 5000);
    };
    window.addEventListener('tt-toast', onToast);
    return () => window.removeEventListener('tt-toast', onToast);
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} role="alert" className="pointer-events-auto rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-pop">
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Confirm before a destructive action. */
export function confirmDelete(what: string) {
  return window.confirm(`Delete ${what}? This cannot be undone.`);
}

/** The people on a project, the people who are not, and a way to add them. */
export function useProjectPeople(projectId: string, memberIds: string[]) {
  const { users, me, canManage } = useApp();
  const ids = memberIds || [];
  const members = users.filter((u) => u.active && ids.includes(u.id));
  const others = users.filter((u) => u.active && !ids.includes(u.id) && u.id !== me.id);
  async function addToProject(u: UserT): Promise<boolean> {
    if (!canManage) {
      toast(`${u.name} is not on this project. Ask an admin or manager to add them.`);
      return false;
    }
    const res = await act('member.set', { projectId, userId: u.id, on: true });
    if (res) toast(`${u.name} added to this project`);
    return !!res;
  }
  return {
    members,
    /** everyone else in the workspace — only offered to people who may add them */
    others: canManage ? others : [],
    mentionable: members.filter((u) => u.id !== me.id),
    addToProject,
  };
}

/* ───────────── @mentions ───────────── */
const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Renders message text with @mentions highlighted and links clickable. */
export function RichText({ text, className = '' }: { text: string; className?: string }) {
  const { users } = useApp();
  const names = users.map((u) => u.name).filter(Boolean).sort((a, b) => b.length - a.length).map(escapeRe);
  const re = new RegExp(`(${names.length ? `@(?:${names.join('|')})|` : ''}https?://[^\\s<]+)`, 'gi');
  const parts = text.split(re);
  return (
    <p className={`whitespace-pre-wrap break-words ${className}`}>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        if (part.startsWith('@')) return <span key={i} className="rounded bg-ember/15 px-1 font-semibold text-ember">{part}</span>;
        return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-ember underline">{part}</a>;
      })}
    </p>
  );
}

/**
 * Markdown rendered as rich text: links are clickable, lists and headings work,
 * and @mentions keep their highlight.
 */
export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  const { users } = useApp();
  const [html, setHtml] = useState('');
  useEffect(() => {
    const out = marked.parse(text || '', { async: false, gfm: true, breaks: true }) as string;
    const names = users.map((u) => u.name).filter(Boolean).sort((a, b) => b.length - a.length).map(escapeRe);
    // highlight @mentions only in text nodes, never inside a tag or an href
    const mention = names.length ? new RegExp(`@(?:${names.join('|')})`, 'g') : null;
    const marked_up = mention
      ? out.split(/(<[^>]+>)/g).map((chunk) => (chunk.startsWith('<') ? chunk : chunk.replace(mention, (m) => `<span class="tt-mention">${m}</span>`))).join('')
      : out;
    const clean = DOMPurify.sanitize(marked_up, { ADD_ATTR: ['target', 'rel'] });
    // links in a task description usually point elsewhere: keep the task open
    setHtml(clean.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" '));
  }, [text, users]);
  return <div className={`prose-doc break-words ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Textarea that suggests people when you type @. Enter sends, Shift+Enter adds a line. */
export function MentionInput({ value, onChange, onSubmit, people, others = [], onPickOther, placeholder, label, className = '', rows = 2, onPaste }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void; people: UserT[];
  /** People in the workspace who are not on this project yet. */
  others?: UserT[];
  /** Called before mentioning someone from `others`. Return false to cancel. */
  onPickOther?: (u: UserT) => Promise<boolean> | boolean;
  placeholder?: string; label: string; className?: string; rows?: number;
  onPaste?: (e: React.ClipboardEvent) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const hit = (u: UserT, q: string) => u.name.toLowerCase().includes(q.toLowerCase());
  const inProject = query === null ? [] : people.filter((u) => hit(u, query)).slice(0, 6);
  const outside = query === null ? [] : others.filter((u) => hit(u, query)).slice(0, 4);
  const matches = [...inProject, ...outside];

  function detect(el: HTMLTextAreaElement) {
    const before = el.value.slice(0, el.selectionStart);
    const m = before.match(/(?:^|\s)@([^\s@]*(?: [^\s@]*)?)$/);
    setQuery(m ? m[1] : null);
    setIndex(0);
  }
  async function choose(u: UserT) {
    if (outside.some((o) => o.id === u.id) && onPickOther) {
      const ok = await onPickOther(u);
      if (!ok) { setQuery(null); return; }
    }
    const el = ref.current!;
    const before = el.value.slice(0, el.selectionStart);
    const start = before.lastIndexOf('@');
    const next = `${before.slice(0, start)}@${u.name} ${el.value.slice(el.selectionStart)}`;
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = start + u.name.length + 2;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }
  function onKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (matches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); return setIndex((index + 1) % matches.length); }
      if (e.key === 'ArrowUp') { e.preventDefault(); return setIndex((index - 1 + matches.length) % matches.length); }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return void choose(matches[index]); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return setQuery(null); }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); }
  }
  return (
    <div className="relative flex-1">
      {matches.length > 0 && (
        <div role="listbox" aria-label="Mention a teammate" className="absolute bottom-full left-0 z-40 mb-1 w-72 rounded-xl border border-line bg-surface p-1 shadow-pop">
          {matches.map((u, i) => {
            const isOutside = i >= inProject.length;
            return (
              <div key={u.id}>
                {isOutside && i === inProject.length && (
                  <p className="px-2 pb-0.5 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-fg/40">Not on this project yet</p>
                )}
                <button type="button" role="option" aria-selected={i === index} onMouseDown={(e) => { e.preventDefault(); void choose(u); }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${i === index ? 'bg-fg/5' : ''}`}>
                  <Avatar user={u} size={22} />
                  <span className="min-w-0 flex-1 truncate font-medium">{u.name}</span>
                  {isOutside && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-ember">Add</span>}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <textarea ref={ref} value={value} rows={rows} placeholder={placeholder} aria-label={label} className={`input ${className}`}
        onPaste={onPaste}
        onChange={(e) => { onChange(e.target.value); detect(e.target); }} onKeyDown={onKeyDown} onBlur={() => setQuery(null)} />
    </div>
  );
}
