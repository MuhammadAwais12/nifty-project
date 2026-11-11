'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Link2, Paperclip, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { uploadFile, type Uploaded } from '@/lib/api';
import { fmtSize } from './ui';

export type Attachment = { id: string; name: string; mime: string; size: number; url?: string | null };

export const isImage = (a: Attachment) => /^image\/(png|jpe?g|gif|webp|avif|svg\+xml)$/.test(a.mime || '');
export const fileHref = (a: Attachment) => a.url || `/api/files/${a.id}`;

/* ───────────── full-size viewer ───────────── */
export function Lightbox({ items, index, onClose }: { items: Attachment[]; index: number; onClose: () => void }) {
  const [i, setI] = useState(index);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'ArrowRight') setI((v) => (v + 1) % items.length);
      if (e.key === 'ArrowLeft') setI((v) => (v - 1 + items.length) % items.length);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [items.length, onClose]);
  const item = items[i];
  if (!item) return null;
  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/90" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex items-center gap-2 px-4 py-3 text-white">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.name}</span>
        <a href={fileHref(item)} download={item.name} className="rounded-md p-2 hover:bg-white/10" aria-label="Download"><Download size={17} /></a>
        <button onClick={onClose} className="rounded-md p-2 hover:bg-white/10" aria-label="Close"><X size={18} /></button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        {items.length > 1 && (
          <button onClick={() => setI((v) => (v - 1 + items.length) % items.length)} className="mr-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Previous"><ChevronLeft size={20} /></button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fileHref(item)} alt={item.name} className="max-h-full max-w-full rounded-lg object-contain" />
        {items.length > 1 && (
          <button onClick={() => setI((v) => (v + 1) % items.length)} className="ml-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Next"><ChevronRight size={20} /></button>
        )}
      </div>
    </div>
  );
}

/* ───────────── attachments on a posted comment or message ───────────── */
export function AttachmentList({ items, compact }: { items: Attachment[]; compact?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!items?.length) return null;
  const images = items.filter(isImage);
  const rest = items.filter((a) => !isImage(a));
  return (
    <div className="mt-1.5 space-y-1.5">
      {images.length > 0 && (
        <div className={`flex flex-wrap gap-1.5`}>
          {images.map((a, n) => (
            <button key={a.id} onClick={() => setOpen(n)} className="group relative overflow-hidden rounded-xl border border-line bg-paper" aria-label={`Open ${a.name}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileHref(a)} alt={a.name} loading="lazy"
                className={`${compact ? 'max-h-32' : 'max-h-56'} w-auto max-w-full object-cover transition-transform group-hover:scale-[1.02]`} />
            </button>
          ))}
        </div>
      )}
      {rest.map((a) => (
        <a key={a.id} href={fileHref(a)} target="_blank" rel="noopener noreferrer"
          className="flex max-w-sm items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-sm hover:border-fg/25">
          {a.url ? <Link2 size={14} className="shrink-0 text-fg/40" /> : <Paperclip size={14} className="shrink-0 text-fg/40" />}
          <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
          {!a.url && <span className="shrink-0 text-xs text-fg/40">{fmtSize(a.size)}</span>}
        </a>
      ))}
      {open !== null && <Lightbox items={images} index={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/* ───────────── attaching files while writing ───────────── */
export function useAttachments(projectId: string) {
  const [items, setItems] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const add = useCallback(async (list: FileList | File[] | null) => {
    if (!list || !('length' in list) || !list.length) return;
    setBusy(true);
    for (const f of Array.from(list as any as File[])) {
      const row = await uploadFile(f, projectId);
      if (row) setItems((v) => [...v, row]);
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  }, [projectId]);

  /** Pasting a screenshot straight into the box, the way Nifty does it. */
  const onPaste = useCallback((e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files || []);
    if (files.length) { e.preventDefault(); add(files); }
  }, [add]);

  return {
    items,
    busy,
    inputRef,
    add,
    onPaste,
    remove: (id: string) => setItems((v) => v.filter((x) => x.id !== id)),
    reset: () => setItems([]),
    ids: items.map((x) => x.id),
  };
}

/** The strip of pending uploads shown above a composer. */
export function PendingAttachments({ a }: { a: ReturnType<typeof useAttachments> }) {
  if (!a.items.length && !a.busy) return null;
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
      {a.items.map((f) => (
        <span key={f.id} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper py-1 pl-1.5 pr-1 text-xs">
          {isImage(f as Attachment) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileHref(f as Attachment)} alt="" className="h-6 w-6 rounded object-cover" />
          ) : (
            <Paperclip size={13} className="text-fg/45" />
          )}
          <span className="max-w-[160px] truncate font-medium">{f.name}</span>
          <button onClick={() => a.remove(f.id)} className="rounded p-0.5 hover:bg-fg/10" aria-label={`Remove ${f.name}`}><X size={12} /></button>
        </span>
      ))}
      {a.busy && <span className="text-xs text-fg/50">Uploading…</span>}
    </div>
  );
}

/** Paperclip button + hidden file input, for a composer toolbar. */
export function AttachButton({ a, label = 'Attach files' }: { a: ReturnType<typeof useAttachments>; label?: string }) {
  return (
    <>
      <button type="button" className="icon-btn" onClick={() => a.inputRef.current?.click()} aria-label={label} title={label} disabled={a.busy}>
        <Paperclip size={16} />
      </button>
      <input ref={a.inputRef} type="file" multiple hidden accept="*/*" onChange={(e) => a.add(e.target.files)} />
    </>
  );
}
