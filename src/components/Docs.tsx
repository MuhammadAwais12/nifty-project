'use client';
import { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Eye, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { act, rpc, refresh, toast, useQ } from '@/lib/api';
import { Empty, Spinner, confirmDelete, fmtDateTime, useApp } from './ui';

function Editor({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const { canEdit } = useApp();
  const { data } = useQ('doc.get', { id }, { revalidateOnFocus: false });
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loaded, setLoaded] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [html, setHtml] = useState('');
  const [status, setStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const timer = useRef<any>(null);
  const latest = useRef({ title: '', content: '' });

  // load the doc once per id; local edits win after that
  useEffect(() => {
    if (data && data.id === id && loaded !== id) {
      setTitle(data.title);
      setContent(data.content);
      latest.current = { title: data.title, content: data.content };
      setLoaded(id);
      setStatus('saved');
      setPreview(!canEdit || data.content.trim().length > 0);
    }
  }, [data, id, loaded, canEdit]);

  useEffect(() => {
    if (preview) setHtml(DOMPurify.sanitize(marked.parse(content, { async: false, gfm: true, breaks: true }) as string));
  }, [preview, content]);

  async function save() {
    clearTimeout(timer.current);
    timer.current = null;
    setStatus('saving');
    try {
      await rpc('doc.update', { id, ...latest.current });
      setStatus('saved');
      refresh();
    } catch (e: any) {
      setStatus('unsaved');
      toast(`Doc not saved: ${e.message}`);
    }
  }
  function edit(patch: { title?: string; content?: string }) {
    latest.current = { ...latest.current, ...patch };
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.content !== undefined) setContent(patch.content);
    setStatus('unsaved');
    clearTimeout(timer.current);
    timer.current = setTimeout(save, 900);
  }
  // flush pending edits when leaving the doc
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
      rpc('doc.update', { id, ...latest.current }).then(refresh).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loaded !== id) return <Spinner />;

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-4 py-5 sm:px-8">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold text-fg/45" aria-live="polite">
          {!canEdit ? (data?.updated_at ? `Updated ${fmtDateTime(data.updated_at)}` : '') : status === 'saving' ? 'Saving…' : status === 'unsaved' ? 'Unsaved changes' : `Saved${data?.updated_at ? ` · ${fmtDateTime(data.updated_at)}` : ''}`}
        </span>
        <span className="flex-1" />
        <button className="btn-outline" hidden={!canEdit} onClick={() => setPreview(!preview)}>
          {preview ? <><Pencil size={14} /> Edit</> : <><Eye size={14} /> Preview</>}
        </button>
        <button className="icon-btn hover:text-red-600" hidden={!canEdit} aria-label="Delete doc" title="Delete doc"
          onClick={async () => { if (confirmDelete(`"${title}"`)) { clearTimeout(timer.current); timer.current = null; await act('doc.delete', { id }); onDeleted(); } }}>
          <Trash2 size={15} />
        </button>
      </div>
      <input value={title} readOnly={!canEdit} onChange={(e) => edit({ title: e.target.value })} aria-label="Doc title" placeholder="Untitled doc"
        className="mb-3 w-full bg-transparent text-3xl font-extrabold tracking-tight placeholder:text-fg/25 focus:outline-none" />
      {preview ? (
        <div className="prose-doc min-h-0 flex-1 overflow-y-auto pb-10 text-[15px]" onDoubleClick={() => canEdit && setPreview(false)} dangerouslySetInnerHTML={{ __html: html || '<p style="opacity:.45">Nothing here yet. Click Edit to start writing.</p>' }} />
      ) : (
        <textarea value={content} onChange={(e) => edit({ content: e.target.value })} aria-label="Doc content" autoFocus
          placeholder={'Start writing. Markdown works here:\n\n# Heading\n**bold**, *italic*, [link](https://…)\n- bullet list\n1. numbered list'}
          className="min-h-0 w-full flex-1 resize-none bg-transparent font-mono text-sm leading-relaxed placeholder:text-fg/30 focus:outline-none" />
      )}
    </div>
  );
}

export function Docs({ projectId }: { projectId: string }) {
  const { users, canEdit } = useApp();
  const { data } = useQ<any[]>('doc.list', { projectId });
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (data && (!current || !data.some((d) => d.id === current))) setCurrent(data[0]?.id || null);
  }, [data, current]);

  async function create() {
    const doc = await act('doc.create', { projectId, title: 'Untitled doc' });
    if (doc) setCurrent(doc.id);
  }

  if (!data) return <Spinner />;
  if (!data.length) {
    return (
      <div className="p-4 sm:p-6">
        <Empty icon={<FileText size={32} />} title="No docs yet" hint="Write briefs, meeting notes and process docs right next to the work."
          action={canEdit ? <button className="btn-primary" onClick={create}><Plus size={14} /> New doc</button> : undefined} />
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col md:flex-row">
      <div className="shrink-0 border-b border-line p-3 md:w-64 md:overflow-y-auto md:border-b-0 md:border-r">
        {canEdit && <button className="btn-outline mb-2 w-full" onClick={create}><Plus size={14} /> New doc</button>}
        <div className="flex gap-1 overflow-x-auto md:block md:space-y-0.5">
          {data.map((d) => (
            <button key={d.id} onClick={() => setCurrent(d.id)} className={`block w-48 shrink-0 rounded-lg px-3 py-2 text-left md:w-full ${current === d.id ? 'bg-surface shadow-card ring-1 ring-line' : 'hover:bg-fg/5'}`}>
              <span className="block truncate text-sm font-bold">{d.title}</span>
              <span className="block truncate text-[11px] text-fg/45">{users.find((u) => u.id === d.updated_by)?.name.split(' ')[0] || 'Someone'} · {fmtDateTime(d.updated_at)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 min-w-0 flex-1 bg-surface">{current && <Editor key={current} id={current} onDeleted={() => setCurrent(null)} />}</div>
    </div>
  );
}
