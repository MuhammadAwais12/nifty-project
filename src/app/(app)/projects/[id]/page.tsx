'use client';
import { Suspense, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Archive, Clock, FileText, Flag, FolderOpen, Home, ListTodo, MessageSquare, MoreHorizontal, Settings, Trash2, UserPlus, Users } from 'lucide-react';
import { act, useQ } from '@/lib/api';
import { AvatarStack, Menu, MenuItem, Spinner, useApp } from '@/components/ui';
import { MembersModal } from '@/components/MembersModal';
import { InviteModal } from '@/components/InviteModal';
import { ProjectForm } from '@/components/ProjectForm';
import { ProjectHome } from '@/components/ProjectHome';
import { Tasks } from '@/components/Tasks';
import { Milestones } from '@/components/Milestones';
import { Discussions } from '@/components/Discussions';
import { Docs } from '@/components/Docs';
import { Files } from '@/components/Files';
import { TimeTab } from '@/components/TimeTab';

const TABS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'discussions', label: 'Discussions', icon: MessageSquare },
  { id: 'milestones', label: 'Milestones', icon: Flag },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'docs', label: 'Docs', icon: FileText },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'time', label: 'Time', icon: Clock },
];

function Project() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const { canEdit, canManage, portfolios } = useApp();
  const tabs = TABS.filter((t) => canEdit || t.id !== 'time');
  const tab = tabs.some((t) => t.id === params.get('tab')) ? params.get('tab')! : 'home';
  const [membersOpen, setMembersOpen] = useState(false);
  const [inviting, setInviting] = useState<null | 'guest' | 'member'>(null);
  const { data, error } = useQ('project.get', { id }, { refreshInterval: 20000 });
  const [settings, setSettings] = useState(false);
  const goTo = (t: string) => router.replace(`/projects/${id}?tab=${t}`, { scroll: false });

  if (error) {
    return (
      <div className="p-10 text-center">
        <p className="font-bold">This project could not be found</p>
        <p className="mt-1 text-sm text-fg/55">It may have been deleted.</p>
        <button className="btn-primary mt-4" onClick={() => router.push('/')}>Back to overview</button>
      </div>
    );
  }
  if (!data || data.project.id !== id) return <Spinner />;
  const p = data.project;
  const folder = portfolios.find((f: any) => f.id === p.portfolio_id);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line bg-surface px-4 pt-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white" style={{ background: p.color }}>{p.name.slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-extrabold tracking-tight">{p.name}</h1>
            {folder && <p className="flex items-center gap-1.5 truncate text-xs font-semibold text-fg/45"><span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: folder.color }} />{folder.name}</p>}
          </div>
          {p.archived && <span className="chip bg-fg/10 text-fg/60">Archived</span>}
          <button className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-fg/5 disabled:hover:bg-transparent" disabled={!canManage} onClick={() => setMembersOpen(true)} aria-label="Project members" title={canManage ? 'Project members' : 'People on this project'}>
            <AvatarStack ids={data.members} size={26} max={5} />
            {canManage && <span className="hidden items-center gap-1 text-sm font-semibold text-fg/60 sm:inline-flex"><UserPlus size={15} /> Members</span>}
          </button>
          <span className={canManage ? '' : 'hidden'}>
          <Menu trigger={<button className="icon-btn" aria-label="Project options"><MoreHorizontal size={18} /></button>}>
            {(close) => (
              <>
                <MenuItem onClick={() => { close(); setMembersOpen(true); }}><Users size={15} /> Manage members</MenuItem>
                <MenuItem onClick={() => { close(); setInviting('guest'); }}><UserPlus size={15} /> Invite a client as guest</MenuItem>
                <MenuItem onClick={() => { close(); setSettings(true); }}><Settings size={15} /> Project settings</MenuItem>
                <MenuItem onClick={() => { close(); act('project.update', { id, archived: !p.archived }); }}><Archive size={15} /> {p.archived ? 'Restore project' : 'Archive project'}</MenuItem>
                {canManage && (
                  <MenuItem danger onClick={async () => { close(); if (window.confirm(`Delete "${p.name}" and everything in it? This cannot be undone.`)) { router.push('/'); await act('project.delete', { id }); } }}>
                    <Trash2 size={15} /> Delete project
                  </MenuItem>
                )}
              </>
            )}
          </Menu>
          </span>
        </div>
        <nav className="-mb-px mt-3 flex items-center gap-1 overflow-x-auto" aria-label="Project sections">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => goTo(t.id)} aria-current={tab === t.id ? 'page' : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${tab === t.id ? 'border-ember text-fg' : 'border-transparent text-fg/50 hover:text-fg'}`}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </nav>
      </header>
      <div className="min-h-0 flex-1">
        {tab === 'home' && <ProjectHome data={data} goTo={goTo} />}
        {tab === 'discussions' && <Discussions projectId={id} members={data.members} />}
        {tab === 'milestones' && <div className="h-full overflow-y-auto"><Milestones data={data} /></div>}
        {tab === 'tasks' && <Tasks data={data} />}
        {tab === 'docs' && <Docs projectId={id} />}
        {tab === 'files' && <Files projectId={id} />}
        {tab === 'time' && <TimeTab data={data} />}
      </div>
      {settings && <ProjectForm project={p} onClose={() => setSettings(false)} />}
      {membersOpen && <MembersModal projectId={id} members={data.members} onClose={() => setMembersOpen(false)} onInvite={() => { setMembersOpen(false); setInviting('member'); }} />}
      {inviting && (
        <InviteModal onClose={() => setInviting(null)} defaultRole={inviting} lockProject={id}
          title={inviting === 'guest' ? `Invite a client to ${p.name}` : `Invite someone to ${p.name}`} />
      )}
    </div>
  );
}

export default function ProjectPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Project />
    </Suspense>
  );
}
