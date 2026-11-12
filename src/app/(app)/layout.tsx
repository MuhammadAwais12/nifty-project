'use client';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  LayoutGrid, CheckSquare, BarChart3, Users, Plus, Menu as MenuIcon, LogOut, UserCog, Square, X, Bell,
  MessagesSquare, CheckCheck, Hash, PanelLeftClose, PanelLeftOpen, Search, ChevronDown,
} from 'lucide-react';
import { act, rpc, useQ } from '@/lib/api';
import {
  AppContext, Avatar, ColorPicker, Menu, MenuItem, Modal, Spinner, Toasts, ROLE_LABEL, RANK,
  fmtClock, fmtDateTime, useNow,
} from '@/components/ui';
import { CreateMenu, GlobalSearch, SearchButton, ThemeToggle, useSearchHotkey } from '@/components/Chrome';
import { NotificationPrompt, NotificationSetting, useNotifications } from '@/components/Notify';
import { Logo } from '@/components/Logo';
import { ProjectForm } from '@/components/ProjectForm';
import { QuickTask } from '@/components/QuickTask';
import { TaskPanel } from '@/components/TaskPanel';
import { ProjectNav } from '@/components/ProjectNav';

function TimerPill({ timer }: { timer: any }) {
  const now = useNow();
  const elapsed = (now - new Date(timer.started_at).getTime()) / 1000;
  return (
    <div className="flex items-center gap-2 rounded-xl bg-ember px-3 py-2 text-white">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm font-bold tabular-nums leading-tight">{fmtClock(elapsed)}</p>
        <p className="truncate text-[11px] leading-tight text-white/80">{timer.task_title || timer.project_name}</p>
      </div>
      <button onClick={() => act('time.stop')} aria-label="Stop timer" title="Stop timer" className="rounded-md bg-white/20 p-1.5 hover:bg-white/30">
        <Square size={12} fill="currentColor" />
      </button>
    </div>
  );
}

function ProfileModal({ me, onClose, notify }: { me: any; onClose: () => void; notify: ReturnType<typeof useNotifications> }) {
  const [form, setForm] = useState({ name: me.name, color: me.color, currentPassword: '', newPassword: '' });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (await act('profile.update', form)) onClose();
  }
  return (
    <Modal open onClose={onClose} title="Your profile">
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <Avatar user={me} size={44} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{me.email}</p>
            <p className="text-xs text-fg/50">{ROLE_LABEL[me.role as keyof typeof ROLE_LABEL]} in this workspace</p>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="prof-name">Name</label>
          <input id="prof-name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <span className="label">Avatar color</span>
          <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
        </div>
        <div className="border-t border-line pt-4">
          <p className="mb-2 text-sm font-bold">Change password</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="input" type="password" placeholder="Current password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
            <input className="input" type="password" placeholder="New password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
          </div>
          <p className="mt-1.5 text-xs text-fg/45">If you signed up with Google, setting a password here lets you use either way in.</p>
        </div>
        <NotificationSetting n={notify} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}

/** Sidebar links. `min` is the lowest role that sees the link. */
const NAV = [
  { href: '/', label: 'Overview', icon: LayoutGrid, min: 'guest' },
  { href: '/my-work', label: 'My work', icon: CheckSquare, min: 'guest' },
  { href: '/chat', label: 'Chat', icon: MessagesSquare, min: 'guest' },
  { href: '/reports', label: 'Reports', icon: BarChart3, min: 'member' },
  { href: '/team', label: 'Team', icon: Users, min: 'member' },
] as const;

function NotificationsPanel({ users, onClose, notify }: { users: any[]; onClose: () => void; notify: ReturnType<typeof useNotifications> }) {
  const router = useRouter();
  const { data } = useQ<any[]>('notif.list', undefined, { refreshInterval: 15000 });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  function open(n: any) {
    if (!n.read) act('notif.read', { id: n.id });
    onClose();
    if (n.task_id) router.push(`/tasks/${n.task_id}`);
    else if (n.project_id) router.push(`/projects/${n.project_id}${n.kind === 'mention' ? '?tab=discussions' : ''}`);
  }
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div role="dialog" aria-label="Notifications" className="fixed inset-x-2 top-14 z-50 flex max-h-[80vh] flex-col rounded-2xl border border-line bg-surface text-fg shadow-pop sm:inset-x-auto sm:right-4 sm:w-[380px]">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-bold">Notifications</h2>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => act('notif.read', {})}><CheckCheck size={14} /> Mark all read</button>
        </div>
        <NotificationPrompt n={notify} />
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {!data && <Spinner />}
          {data && !data.length && <p className="px-4 py-10 text-center text-sm text-fg/50">Nothing yet. You&apos;ll hear about assignments, comments and @mentions here.</p>}
          {data?.map((n) => {
            const actor = users.find((u) => u.id === n.actor_id);
            return (
              <button key={n.id} onClick={() => open(n)} className={`flex w-full gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-fg/5 ${n.read ? 'opacity-60' : ''}`}>
                <Avatar user={actor} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug"><span className="font-bold">{actor?.name.split(' ')[0] || 'Someone'}</span> {n.text}</span>
                  <span className="block truncate text-[11px] text-fg/45">{n.project_name ? `${n.project_name} · ` : ''}{fmtDateTime(n.created_at)}</span>
                </span>
                {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ember" aria-label="Unread" />}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** Reads ?task=<id>. Split out so useSearchParams sits inside a Suspense boundary. */
function OpenTask() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get('task');
  const close = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.push(window.location.pathname);
  }, [router]);
  if (!id) return null;
  return <TaskPanel key={id} id={id} onClose={close} />;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data, error } = useQ('bootstrap', undefined, { refreshInterval: 15000 });
  const [bell, setBell] = useState(false);
  const [newProject, setNewProject] = useState<null | { portfolioId: string | null }>(null);
  const [newTask, setNewTask] = useState(false);
  const [profile, setProfile] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<'projects' | 'chat'>('projects');
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState(false);
  useSearchHotkey(() => setSearch(true));
  const notify = useNotifications();

  useEffect(() => { if (error?.status === 401) router.replace('/login'); }, [error, router]);
  useEffect(() => setNavOpen(false), [pathname]);
  useEffect(() => { try { setCollapsed(localStorage.getItem('tt-rail') === '1'); } catch {} }, []);
  function toggleRail() {
    setCollapsed((c) => {
      try { localStorage.setItem('tt-rail', c ? '0' : '1'); } catch {}
      return !c;
    });
  }

  const ctx = useMemo(
    () =>
      data
        ? {
            ...data,
            canEdit: data.me.role !== 'guest',
            canManage: RANK[data.me.role as keyof typeof RANK] >= RANK.manager,
            isAdmin: RANK[data.me.role as keyof typeof RANK] >= RANK.admin,
            openTask: (id: string) => {
              // open it over the current screen, unless we are already on a task page
              if (pathname.startsWith('/tasks/')) router.push(`/tasks/${id}`);
              else {
                const q = new URLSearchParams(window.location.search);
                q.set('task', id);
                router.push(`${pathname}?${q.toString()}`);
              }
            },
          }
        : null,
    [data, pathname, router]
  );

  if (!ctx) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        {error && error.status !== 401 ? (
          <div className="max-w-md rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
            <p className="font-bold">We couldn&apos;t load your workspace</p>
            <p className="mt-1 text-sm text-fg/60">{error.message}</p>
            <button className="btn-primary mt-4" onClick={() => location.reload()}>Try again</button>
          </div>
        ) : (
          <Spinner label="Loading your workspace…" />
        )}
      </div>
    );
  }

  const active = ctx.projects.filter((p: any) => !p.archived && p.name.toLowerCase().includes(filter.toLowerCase()));
  const nav = NAV.filter((n) => RANK[ctx.me.role as keyof typeof RANK] >= RANK[n.min as keyof typeof RANK]);
  const projectTitle = ctx.projects.find((p: any) => pathname === `/projects/${p.id}`)?.name;

  async function logout() {
    await rpc('auth.logout').catch(() => {});
    location.href = '/login';
  }

  const railWidth = collapsed ? 'lg:w-[64px]' : 'lg:w-[260px]';

  return (
    <AppContext.Provider value={ctx}>
      <div className="flex h-screen overflow-hidden bg-paper">
        {navOpen && <div className="fixed inset-0 z-30 bg-scrim/50 lg:hidden" onClick={() => setNavOpen(false)} />}

        <aside className={`fixed inset-y-0 left-0 z-40 flex w-[260px] shrink-0 flex-col bg-ink text-white transition-all lg:static lg:translate-x-0 ${railWidth} ${navOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className={`flex gap-2 px-3 py-3.5 ${collapsed ? 'lg:flex-col lg:items-center lg:gap-3 lg:px-0' : 'items-center justify-between'}`}>
            <Link href="/" className="min-w-0 shrink-0 overflow-hidden">{collapsed ? <Logo mark /> : <Logo />}</Link>
            <span className={`flex items-center gap-0.5 ${collapsed ? 'lg:ml-0' : 'ml-auto'}`}>
              <button className="hidden rounded-md p-1.5 text-white/45 hover:bg-white/10 hover:text-white lg:block" onClick={toggleRail} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand' : 'Collapse'}>
                {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              </button>
              <button className="rounded-md p-1 text-white/60 hover:bg-white/10 lg:hidden" onClick={() => setNavOpen(false)} aria-label="Close menu"><X size={18} /></button>
            </span>
          </div>

          <nav className="space-y-0.5 px-2">
            {nav.map((n) => {
              const on = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
              const badge = n.href === '/chat' ? ctx.dmUnread : 0;
              return (
                <Link key={n.href} href={n.href} title={collapsed ? n.label : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold ${on ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'} ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}>
                  <span className="relative">
                    <n.icon size={16} />
                    {collapsed && badge > 0 && <span className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full bg-ember" />}
                  </span>
                  <span className={collapsed ? 'lg:hidden' : ''}>{n.label}</span>
                  {!collapsed && badge > 0 && <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-ember px-1.5 text-[11px] font-bold text-white">{badge}</span>}
                </Link>
              );
            })}
          </nav>

          <div className={`mt-4 flex min-h-0 flex-1 flex-col ${collapsed ? 'lg:hidden' : ''}`}>
            <div className="mx-3 flex rounded-lg bg-white/5 p-0.5 text-[11px] font-bold uppercase tracking-wider">
              {(['projects', 'chat'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 ${tab === t ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white/80'}`}>
                  {t}
                  {t === 'chat' && ctx.dmUnread > 0 && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-ember" />}
                </button>
              ))}
            </div>

            <div className="mt-2 flex items-center gap-1.5 px-3">
              <span className="relative flex-1">
                <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-white/35" />
                <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={tab === 'projects' ? 'Search projects…' : 'Search channels…'} aria-label="Filter list"
                  className="w-full rounded-lg bg-white/5 py-1.5 pl-7 pr-2 text-xs text-white placeholder:text-white/35 focus:bg-white/10 focus:outline-none" />
              </span>
              {tab === 'projects' && ctx.canManage && (
                <button onClick={() => setNewProject({ portfolioId: null })} className="rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white" aria-label="New project" title="New project"><Plus size={15} /></button>
              )}
            </div>

            <div className="mt-1.5 min-h-0 flex-1 overflow-y-auto">
              {tab === 'projects' ? (
                <ProjectNav filter={filter} onNewProject={(portfolioId) => setNewProject({ portfolioId })} />
              ) : (
                <div className="px-2 pb-3">
                  {active.map((p: any) => (
                    <Link key={p.id} href={`/chat?p=${p.id}`} className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm text-white/65 hover:bg-white/5 hover:text-white">
                      <Hash size={13} className="shrink-0 text-white/40" />
                      <span className={`truncate ${p.chat_unread ? 'font-bold text-white' : ''}`}>{p.name}</span>
                      {p.chat_unread > 0 && <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-ember px-1 text-[10px] font-bold">{p.chat_unread}</span>}
                    </Link>
                  ))}
                  {ctx.canEdit && (
                    <Link href="/chat" className="mt-2 flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm text-white/55 hover:bg-white/5 hover:text-white">
                      <MessagesSquare size={13} /> Direct messages
                      {ctx.dmUnread > 0 && <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-ember px-1 text-[10px] font-bold">{ctx.dmUnread}</span>}
                    </Link>
                  )}
                  {!active.length && <p className="px-3 py-2 text-sm text-white/40">No channels yet.</p>}
                </div>
              )}
            </div>
          </div>

          <div className={`mt-auto space-y-2 border-t border-white/10 p-2 ${collapsed ? 'lg:px-1' : ''}`}>
            {ctx.timer && !collapsed && <TimerPill timer={ctx.timer} />}
            <Menu
              align="left"
              up
              trigger={
                <button className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-white/5 ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}>
                  <Avatar user={ctx.me} size={30} ring={false} />
                  <span className={`min-w-0 flex-1 ${collapsed ? 'lg:hidden' : ''}`}>
                    <span className="block truncate text-sm font-semibold">{ctx.me.name}</span>
                    <span className="block truncate text-[11px] text-white/45">{ROLE_LABEL[ctx.me.role as keyof typeof ROLE_LABEL]}</span>
                  </span>
                  <ChevronDown size={14} className={`text-white/40 ${collapsed ? 'lg:hidden' : ''}`} />
                </button>
              }
            >
              {(close) => (
                <>
                  <MenuItem onClick={() => { close(); setProfile(true); }}><UserCog size={15} /> Your profile</MenuItem>
                  <MenuItem onClick={logout}><LogOut size={15} /> Sign out</MenuItem>
                </>
              )}
            </Menu>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2 sm:px-4">
            <button className="icon-btn lg:hidden" onClick={() => setNavOpen(true)} aria-label="Open menu"><MenuIcon size={18} /></button>
            <span className="hidden min-w-0 items-center gap-1.5 text-sm font-semibold text-fg/50 sm:flex">
              <Link href="/" className="hover:text-fg">Workspace</Link>
              {projectTitle && <><span className="text-fg/25">/</span><span className="truncate text-fg">{projectTitle}</span></>}
            </span>
            <div className="mx-auto hidden w-full max-w-md md:block"><SearchButton onClick={() => setSearch(true)} /></div>
            <div className="ml-auto flex items-center gap-1 md:ml-0">
              <button className="icon-btn md:hidden" onClick={() => setSearch(true)} aria-label="Search"><Search size={17} /></button>
              <ThemeToggle />
              <button className="icon-btn relative" onClick={() => setBell(true)} aria-label={`Notifications, ${ctx.unread} unread`} title="Notifications">
                <Bell size={17} />
                {ctx.unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ember px-1 text-[10px] font-bold text-white">{ctx.unread > 9 ? '9+' : ctx.unread}</span>}
              </button>
              <CreateMenu onProject={() => setNewProject({ portfolioId: null })} onTask={() => setNewTask(true)} />
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>

      <Suspense fallback={null}><OpenTask /></Suspense>
      <GlobalSearch open={search} onClose={() => setSearch(false)} />
      {bell && <NotificationsPanel users={ctx.users} onClose={() => setBell(false)} notify={notify} />}
      {newProject && <ProjectForm portfolioId={newProject.portfolioId} onClose={() => setNewProject(null)} />}
      {newTask && <QuickTask onClose={() => setNewTask(false)} />}
      {profile && <ProfileModal me={ctx.me} onClose={() => setProfile(false)} notify={notify} />}
      <Toasts />
    </AppContext.Provider>
  );
}
