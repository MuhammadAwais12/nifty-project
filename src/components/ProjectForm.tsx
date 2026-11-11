'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { act } from '@/lib/api';
import { COLORS, ColorPicker, Modal, useApp } from './ui';

export function ProjectForm({ project, onClose }: { project?: any; onClose: () => void }) {
  const { projects } = useApp();
  const router = useRouter();
  const [form, setForm] = useState({
    name: project?.name || '',
    description: project?.description || '',
    portfolio: project?.portfolio || '',
    color: project?.color || COLORS[projects.length % COLORS.length],
  });
  const [busy, setBusy] = useState(false);
  const portfolios = Array.from(new Set(projects.map((p) => p.portfolio).filter(Boolean)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = project ? await act('project.update', { id: project.id, ...form }) : await act('project.create', form);
    setBusy(false);
    if (!res) return;
    onClose();
    if (!project) router.push(`/projects/${res.id}`);
  }

  return (
    <Modal open onClose={onClose} title={project ? 'Project settings' : 'New project'}>
      <form onSubmit={submit} className="space-y-4 p-5">
        <div>
          <label className="label" htmlFor="pname">Project name</label>
          <input id="pname" className="input" autoFocus required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Acme Co. SEO retainer" />
        </div>
        <div>
          <label className="label" htmlFor="pdesc">Description</label>
          <textarea id="pdesc" className="input min-h-[70px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What is this project about?" />
        </div>
        <div>
          <label className="label" htmlFor="pport">Portfolio</label>
          <input id="pport" className="input" list="portfolios" value={form.portfolio} onChange={(e) => setForm({ ...form, portfolio: e.target.value })} placeholder="Group projects, e.g. Clients or Internal" />
          <datalist id="portfolios">
            {portfolios.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div>
          <span className="label">Color</span>
          <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{project ? 'Save changes' : 'Create project'}</button>
        </div>
      </form>
    </Modal>
  );
}
