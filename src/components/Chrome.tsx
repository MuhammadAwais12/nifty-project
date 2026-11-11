'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Sun, Moon, Plus, CornerDownLeft, CheckSquare, FileText, Folder, User as UserIcon } from 'lucide-react';
import { useQ } from '@/lib/api';
import { Avatar, Menu, MenuItem, useApp } from './ui';

/* ───────────── theme ───────────── */
export function useTheme(): [boolean, () => void] {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);
  const toggle = () => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('tt-theme', next ? 'dark' : 'light'); } catch {}
    setDark(next);
  };
  return [dark, toggle];
}

export function ThemeToggle({ className = 'icon-btn' }: { className?: string }) {
  const [dark, toggle] = useTheme();
  return (
    <button onClick={toggle} className={className} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title={dark ? 'Light theme' : 'Dark theme'}>
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

/* ───────────── global search ───────────── */
type Hit = { key: string; label: string; sub?: string; icon: any; color?: string; go: () => void };

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { openTask } = useApp();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 180);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => { if (open) { setQ(''); setDebounced(''); setIndex(0); } }, [open]);

  const { data, isLoading } = useQ<any>(open && debounced.length >= 2 ? 'search' : null, { q: debounced }, { keepPreviousData: false });

  const hits: Hit[] = [];
  for (const t of data?.tasks || []) hits.push({ key: `t${t.id}`, label: t.title, sub: t.project_name, icon: CheckSquare, color: t.project_color, go: () => openTask(t.id) });
  for (const p of data?.projects || []) hits.push({ key: `p${p.id}`, label: p.name, sub: 'Project', icon: Folder, color: p.color, go: () => router.push(`/projects/${p.id}`) });
  for (const d of data?.docs || []) hits.push({ key: `d${d.id}`, label: d.title, sub: `Doc in ${d.project_name}`, icon: FileText, go: () => router.push(`/projects/${d.project_id}?tab=docs&doc=${d.id}`) });
  for (const u of data?.people || []) hits.push({ key: `u${u.id}`, label: u.name, sub: u.email, icon: UserIcon, color: u.color, go: () => router.push('/team') });

  function choose(h?: Hit) {
    if (!h) return;
    onClose();
    h.go();
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-scrim/50 p-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Search" className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={17} className="text-fg/40" />
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setIndex(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); onClose(); }
              if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, hits.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
              if (e.key === 'Enter') { e.preventDefault(); choose(hits[index]); }
            }}
            placeholder="Search tasks, projects, docs and people…"
            aria-label="Search"
            className="w-full bg-transparent py-3.5 text-sm outline-none"
          />
          <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[10px] font-semibold text-fg/45 sm:block">Esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {debounced.length < 2 && <p className="px-3 py-6 text-center text-sm text-fg/45">Type at least two letters to search.</p>}
          {debounced.length >= 2 && isLoading && !data && <p className="px-3 py-6 text-center text-sm text-fg/45">Searching…</p>}
          {debounced.length >= 2 && data && !hits.length && <p className="px-3 py-6 text-center text-sm text-fg/45">Nothing matched “{debounced}”.</p>}
          {hits.map((h, i) => (
            <button
              key={h.key}
              onMouseEnter={() => setIndex(i)}
              onClick={() => choose(h)}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left ${i === index ? 'bg-fg/5' : ''}`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${h.color || '#8a8a99'}22`, color: h.color || 'currentColor' }}>
                <h.icon size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{h.label}</span>
                {h.sub && <span className="block truncate text-[11px] text-fg/45">{h.sub}</span>}
              </span>
              {i === index && <CornerDownLeft size={14} className="text-fg/35" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────────── quick create ───────────── */
export function CreateMenu({ onProject, onTask }: { onProject: () => void; onTask: () => void }) {
  const { canManage, canEdit } = useApp();
  if (!canEdit) return null;
  return (
    <Menu
      align="right"
      trigger={
        <button className="btn-primary" aria-label="Create">
          <Plus size={15} /> <span className="hidden sm:inline">Create</span>
        </button>
      }
    >
      {(close) => (
        <>
          <MenuItem onClick={() => { close(); onTask(); }}><CheckSquare size={15} /> New task</MenuItem>
          {canManage && <MenuItem onClick={() => { close(); onProject(); }}><Folder size={15} /> New project</MenuItem>}
        </>
      )}
    </Menu>
  );
}

/** Opens global search with ⌘K / Ctrl+K from anywhere. */
export function useSearchHotkey(open: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
}

export function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-line bg-paper px-3 text-sm text-fg/45 hover:border-fg/20"
    >
      <Search size={15} />
      <span className="flex-1 text-left">Search</span>
      <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[10px] font-semibold sm:block">⌘K</kbd>
    </button>
  );
}

export function PersonChip({ id }: { id: string }) {
  const { users } = useApp();
  const u = users.find((x) => x.id === id);
  if (!u) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-fg/5 py-0.5 pl-0.5 pr-2 text-xs font-semibold">
      <Avatar user={u} size={18} ring={false} /> {u.name}
    </span>
  );
}
