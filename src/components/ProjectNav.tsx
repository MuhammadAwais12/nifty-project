'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronRight, FolderPlus, Plus, MoreHorizontal, Pencil, Trash2, FolderInput } from 'lucide-react';
import { act } from '@/lib/api';
import { Menu, MenuItem, confirmDelete, useApp, type Portfolio } from './ui';

/** Remembers which portfolios are folded shut, per browser. */
function useCollapsed() {
  const [shut, setShut] = useState<string[]>([]);
  useEffect(() => {
    try { setShut(JSON.parse(localStorage.getItem('tt-folded') || '[]')); } catch { /* ignore */ }
  }, []);
  const toggle = (id: string) =>
    setShut((v) => {
      const next = v.includes(id) ? v.filter((x) => x !== id) : [...v, id];
      try { localStorage.setItem('tt-folded', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  return [shut, toggle] as const;
}

function ProjectRow({ p, onDragStart }: { p: any; onDragStart: (id: string) => void }) {
  const pathname = usePathname();
  const { portfolios, canManage } = useApp();
  const on = pathname === `/projects/${p.id}`;
  return (
    <div
      draggable={canManage}
      onDragStart={(e) => { onDragStart(p.id); e.dataTransfer.effectAllowed = 'move'; }}
      className={`group flex items-center gap-2 rounded-lg pl-3 pr-1 ${on ? 'bg-white/10 text-white' : 'text-white/65 hover:bg-white/5 hover:text-white'}`}
    >
      <Link href={`/projects/${p.id}`} className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 text-sm">
        <span className="h-2.5 w-2.5 shrink-0 rounded-[4px]" style={{ background: p.color }} />
        <span className={`truncate ${on ? 'font-semibold' : ''}`}>{p.name}</span>
      </Link>
      {p.overdue_count > 0 && <span className="shrink-0 text-[10px] font-bold text-ember">{p.overdue_count}</span>}
      {canManage && (
        <Menu
          align="left"
          trigger={
            <button className="shrink-0 rounded p-1 text-white/40 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100 focus:opacity-100" aria-label={`Options for ${p.name}`}>
              <MoreHorizontal size={14} />
            </button>
          }
        >
          {(close) => (
            <>
              <p className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-fg/40">Move to portfolio</p>
              <MenuItem onClick={() => { close(); act('project.update', { id: p.id, portfolioId: '' }); }}>
                <FolderInput size={15} /> No portfolio
              </MenuItem>
              {portfolios.map((f) => (
                <MenuItem key={f.id} onClick={() => { close(); act('project.update', { id: p.id, portfolioId: f.id }); }}>
                  <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: f.color }} /> {f.name}
                </MenuItem>
              ))}
            </>
          )}
        </Menu>
      )}
    </div>
  );
}

/** The portfolio tree in the sidebar: folders, their projects, and the loose ones. */
export function ProjectNav({ filter, onNewProject }: { filter: string; onNewProject: (portfolioId: string | null) => void }) {
  const { projects, portfolios, canManage } = useApp();
  const [shut, toggle] = useCollapsed();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const active = projects.filter((p: any) => !p.archived && p.name.toLowerCase().includes(filter.toLowerCase()));
  const inside = (id: string | null) => active.filter((p: any) => (p.portfolio_id || null) === id);
  const loose = inside(null);

  async function drop(portfolioId: string | null) {
    const id = dragging;
    setDragging(null);
    setOver(null);
    if (!id) return;
    const project = projects.find((p: any) => p.id === id);
    if (!project || (project.portfolio_id || null) === portfolioId) return;
    await act('project.update', { id, portfolioId: portfolioId || '' });
  }

  async function addPortfolio() {
    const name = window.prompt('Name this portfolio', '');
    if (name?.trim()) await act('portfolio.create', { name: name.trim() });
  }
  async function rename(f: Portfolio) {
    const name = window.prompt('Rename this portfolio', f.name);
    if (name?.trim() && name.trim() !== f.name) await act('portfolio.update', { id: f.id, name: name.trim() });
  }
  async function remove(f: Portfolio) {
    if (!confirmDelete(`the portfolio "${f.name}"`)) return;
    await act('portfolio.delete', { id: f.id });
  }

  const dropProps = (id: string | null) => ({
    onDragOver: (e: React.DragEvent) => { if (dragging) { e.preventDefault(); setOver(id === null ? '__none' : id); } },
    onDragLeave: () => setOver(null),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); drop(id); },
  });
  const highlight = (id: string | null) => (over === (id === null ? '__none' : id) ? 'bg-ember/20 ring-1 ring-ember/50' : '');

  return (
    <div className="px-2 pb-3">
      {portfolios.map((f) => {
        const list = inside(f.id);
        const folded = shut.includes(f.id);
        if (filter && !list.length) return null;
        return (
          <div key={f.id} className={`mb-1 rounded-lg ${highlight(f.id)}`} {...dropProps(f.id)}>
            <div className="group flex items-center gap-1 rounded-lg px-1 py-1 hover:bg-white/5">
              <button onClick={() => toggle(f.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" aria-expanded={!folded}>
                {folded ? <ChevronRight size={13} className="shrink-0 text-white/40" /> : <ChevronDown size={13} className="shrink-0 text-white/40" />}
                <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: f.color }} />
                <span className="truncate text-[11px] font-bold uppercase tracking-wider text-white/55">{f.name}</span>
                <span className="shrink-0 text-[10px] text-white/30">{list.length}</span>
              </button>
              {canManage && (
                <>
                  <button onClick={() => onNewProject(f.id)} className="rounded p-1 text-white/40 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100 focus:opacity-100" aria-label={`New project in ${f.name}`} title="New project here"><Plus size={14} /></button>
                  <Menu align="left" trigger={<button className="rounded p-1 text-white/40 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100 focus:opacity-100" aria-label={`Options for ${f.name}`}><MoreHorizontal size={14} /></button>}>
                    {(close) => (
                      <>
                        <MenuItem onClick={() => { close(); rename(f); }}><Pencil size={15} /> Rename</MenuItem>
                        <MenuItem onClick={() => { close(); onNewProject(f.id); }}><Plus size={15} /> New project here</MenuItem>
                        <MenuItem danger onClick={() => { close(); remove(f); }}><Trash2 size={15} /> Delete portfolio</MenuItem>
                      </>
                    )}
                  </Menu>
                </>
              )}
            </div>
            {!folded && (
              <div className="ml-1.5 border-l border-white/10 pl-1">
                {list.map((p: any) => <ProjectRow key={p.id} p={p} onDragStart={setDragging} />)}
                {!list.length && <p className="px-3 py-1.5 text-xs text-white/30">{canManage ? 'Drop a project here' : 'Empty'}</p>}
              </div>
            )}
          </div>
        );
      })}

      {(loose.length > 0 || (!portfolios.length && !filter)) && (
        <div className={`mb-1 rounded-lg ${highlight(null)}`} {...dropProps(null)}>
          {portfolios.length > 0 && <p className="px-3 pb-0.5 pt-2 text-[11px] font-bold uppercase tracking-wider text-white/35">No portfolio</p>}
          {loose.map((p: any) => <ProjectRow key={p.id} p={p} onDragStart={setDragging} />)}
          {!loose.length && <p className="px-3 py-1.5 text-xs text-white/30">No projects yet.</p>}
        </div>
      )}

      {filter && !active.length && <p className="px-3 py-2 text-sm text-white/40">No match.</p>}

      {canManage && !filter && (
        <button onClick={addPortfolio} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-white/45 hover:bg-white/5 hover:text-white">
          <FolderPlus size={14} /> Add portfolio
        </button>
      )}
    </div>
  );
}
