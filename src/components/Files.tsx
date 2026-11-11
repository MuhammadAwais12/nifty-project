'use client';
import { useRef, useState } from 'react';
import { File as FileIcon, FileImage, FileText, FolderOpen, Link2, Trash2, Upload } from 'lucide-react';
import { act, refresh, uploadFile, useQ } from '@/lib/api';
import { Avatar, Empty, Spinner, confirmDelete, fmtDateTime, fmtSize, useApp } from './ui';

export function Files({ projectId }: { projectId: string }) {
  const { users, openTask, canEdit } = useApp();
  const { data } = useQ<any[]>('file.list', { projectId });
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    for (const f of Array.from(list)) await uploadFile(f, projectId);
    setBusy(false);
    if (input.current) input.current.value = '';
    refresh();
  }
  async function addLink() {
    const url = window.prompt('Paste a link (Google Drive, Figma, Loom, etc.)');
    if (!url) return;
    const name = window.prompt('Name for this link (optional)') || '';
    await act('file.addLink', { projectId, url, name });
  }

  if (!data) return <Spinner />;
  const icon = (f: any) => (f.url ? Link2 : f.mime.startsWith('image/') ? FileImage : /pdf|text|word|document/.test(f.mime) ? FileText : FileIcon);

  return (
    <div
      className="h-full overflow-y-auto p-4 sm:p-6"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-extrabold tracking-tight">Files</h2>
        <button className="btn-outline" onClick={addLink}><Link2 size={14} /> Add link</button>
        <button className="btn-primary" onClick={() => input.current?.click()} disabled={busy}><Upload size={14} /> {busy ? 'Uploading…' : 'Upload files'}</button>
        <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>
      {dragging && <div className="mb-4 rounded-xl border-2 border-dashed border-ember bg-ember/10 p-6 text-center text-sm font-bold text-ember">Drop files to upload</div>}
      {!data.length ? (
        <Empty icon={<FolderOpen size={32} />} title="No files yet" hint="Upload files up to 4 MB each, or drop them anywhere on this page. For bigger files, add a Drive or Dropbox link." />
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {data.map((f) => {
            const Icon = icon(f);
            const u = users.find((x) => x.id === f.uploaded_by);
            return (
              <div key={f.id} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-paper/70">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fg/5 text-fg/50"><Icon size={17} /></span>
                <div className="min-w-0 flex-1">
                  <a href={f.url || `/api/files/${f.id}`} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-bold hover:text-ember">{f.name}</a>
                  <p className="truncate text-xs text-fg/45">
                    {f.url ? 'Link' : fmtSize(f.size)} · {fmtDateTime(f.created_at)}
                    {f.task_id && (
                      <> · on <button className="font-semibold hover:text-ember" onClick={() => openTask(f.task_id)}>{f.task_title}</button></>
                    )}
                  </p>
                </div>
                <Avatar user={u} size={24} />
                <button hidden={!canEdit} className="icon-btn opacity-0 hover:text-red-600 group-hover:opacity-100 focus:opacity-100" aria-label={`Delete ${f.name}`} onClick={() => confirmDelete(`"${f.name}"`) && act('file.delete', { id: f.id })}>
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
