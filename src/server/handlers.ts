import bcrypt from 'bcryptjs';
import { db, HttpError } from '@/lib/db';
import type { User } from './auth';
import { atLeast, seesEverything, CAN_GRANT, ROLES, type Role } from './roles';
import { COLORS, pickColor, newToken, setting, roleForNewAccount, acceptInvite, inviteByToken } from './account';
import { seedWelcomeProject } from './seed';

type Ctx = { user: User; session?: string | null };
type Handler = (p: any, ctx: Ctx) => Promise<any>;

const RECURRENCES = ['', 'daily', 'weekly', 'biweekly', 'monthly'];
const text = (v: any, max = 5000) => String(v ?? '').trim().slice(0, max);
const need = (v: any, label: string) => {
  const s = text(v);
  if (!s) throw new HttpError(400, `${label} is required`);
  return s;
};
const isAdmin = (u: User) => seesEverything(u.role);
const isManager = (u: User) => atLeast(u.role, 'manager');
const adminOnly = (u: User) => {
  if (!isAdmin(u)) throw new HttpError(403, 'Only workspace admins can do this');
};
/** Managers may only shape projects they belong to; admins and the owner may shape any. */
async function manages(user: User, projectId: string) {
  if (isAdmin(user)) return;
  if (!isManager(user)) throw new HttpError(403, 'Only managers and admins can do this');
  await access(user, projectId);
}
const dateOrNull = (v: any) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const uniq = (list: any[]) => Array.from(new Set<string>((list || []).filter(Boolean).map(String)));
const todayStr = () => new Date().toISOString().slice(0, 10);

function shiftDate(ymd: string, recurrence: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (recurrence === 'daily') d.setUTCDate(d.getUTCDate() + 1);
  else if (recurrence === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else if (recurrence === 'biweekly') d.setUTCDate(d.getUTCDate() + 14);
  else {
    // same day next month, clamped to that month's last day (Jan 31 -> Feb 28)
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  }
  return d.toISOString().slice(0, 10);
}

/* ───────────── access control ───────────── */
export async function canAccess(user: User, projectId: string): Promise<boolean> {
  if (!projectId) return false;
  if (isAdmin(user)) return true;
  const [row] = await db()`select 1 from project_members where project_id = ${projectId} and user_id = ${user.id}`;
  return !!row;
}
async function access(user: User, projectId: string) {
  if (!(await canAccess(user, projectId))) throw new HttpError(404, 'Project not found');
}
/** Load a row that belongs to a project and confirm the user may see that project. */
async function entity(user: User, table: 'tasks' | 'milestones' | 'docs' | 'files' | 'statuses' | 'messages' | 'time_entries', id: string) {
  const sql = db();
  const [row] = await sql`select * from ${sql(table)} where id = ${id}`;
  if (!row) throw new HttpError(404, 'Not found');
  await access(user, row.project_id);
  return row;
}

/* ───────────── small helpers ───────────── */
async function log(projectId: string, userId: string, message: string, taskId?: string | null) {
  await db()`insert into activity (project_id, user_id, text, task_id) values (${projectId}, ${userId}, ${message}, ${taskId || null})`;
}

/** A short per-project key like PHA, used for task numbers (PHA-63). */
async function projectKey(name: string): Promise<string> {
  const sql = db();
  const base = (name.replace(/[^a-zA-Z]/g, '').slice(0, 3) || 'PRJ').toUpperCase();
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}${i + 1}`;
    const [taken] = await sql`select 1 from projects where key = ${candidate}`;
    if (!taken) return candidate;
  }
  return base + Date.now().toString().slice(-3);
}

/** Links freshly uploaded files to the comment or message they were posted with. */
async function attach(fileIds: any, projectId: string, userId: string, column: 'comment_id' | 'message_id', rowId: string) {
  const ids = uniq(Array.isArray(fileIds) ? fileIds : []);
  if (!ids.length) return;
  const sql = db();
  await sql`update files set ${sql(column)} = ${rowId}
    where id = any(${ids}::uuid[]) and project_id = ${projectId} and uploaded_by = ${userId}
      and comment_id is null and message_id is null and task_id is null`;
}

async function notify(userIds: string[], actor: User, n: { projectId?: string | null; taskId?: string | null; kind: string; text: string }) {
  const sql = db();
  for (const uid of uniq(userIds)) {
    if (uid === actor.id) continue;
    await sql`insert into notifications (user_id, actor_id, project_id, task_id, kind, text)
      select u.id, ${actor.id}, ${n.projectId || null}, ${n.taskId || null}, ${n.kind}, ${n.text} from users u where u.id = ${uid} and u.active`;
  }
}

/** People named with @Full Name in a message who can see the project. */
async function mentioned(body: string, projectId: string): Promise<string[]> {
  if (!body.includes('@')) return [];
  const rows = await db()`select u.id from users u
    where u.active and position(lower('@' || u.name) in lower(${body})) > 0
      and (u.role in ('owner', 'admin') or exists (select 1 from project_members m where m.project_id = ${projectId} and m.user_id = u.id))`;
  return rows.map((r: any) => r.id);
}

/** Runs when a task goes from open to complete: unblock dependents and spawn the next recurring copy. */
async function afterComplete(task: any, user: User) {
  const sql = db();
  const waiting = await sql`select * from tasks where project_id = ${task.project_id} and completed_at is null and jsonb_exists(blocked_by, ${task.id})`;
  for (const w of waiting) {
    const [{ n }] = await sql`select count(*)::int as n from tasks b where jsonb_exists(${sql.json(w.blocked_by)}::jsonb, b.id::text) and b.completed_at is null`;
    if (n === 0) await notify(w.assignees || [], user, { projectId: w.project_id, taskId: w.id, kind: 'unblocked', text: `finished the task that was blocking "${w.title}"` });
  }
  if (task.parent_id || !task.recurrence) return;
  const today = todayStr();
  let due = shiftDate(task.due_date || today, task.recurrence);
  let start = task.start_date ? shiftDate(task.start_date, task.recurrence) : null;
  for (let i = 0; i < 400 && due < today; i++) {
    due = shiftDate(due, task.recurrence);
    if (start) start = shiftDate(start, task.recurrence);
  }
  const [status] = await sql`select id from statuses where project_id = ${task.project_id} and not is_done order by position limit 1`;
  const [{ pos }] = await sql`select coalesce(max(position), -1) + 1 as pos from tasks where project_id = ${task.project_id}`;
  const [next] = await sql`insert into tasks (project_id, status_id, milestone_id, title, description, priority, start_date, due_date, position, tags, assignees, recurrence, created_by)
    values (${task.project_id}, ${status?.id || task.status_id}, ${task.milestone_id}, ${task.title}, ${task.description}, ${task.priority}, ${start}, ${due}, ${pos},
      ${sql.json(task.tags || [])}, ${sql.json(task.assignees || [])}, ${task.recurrence}, ${task.created_by}) returning id`;
  await sql`insert into tasks (project_id, parent_id, title, position, created_by)
    select project_id, ${next.id}, title, position, created_by from tasks where parent_id = ${task.id}`;
  await sql`update tasks set recurrence = '' where id = ${task.id}`;
}


/**
 * Sends the invitation by email when RESEND_API_KEY is set.
 * Without it the invite still works — the admin copies the link instead.
 */
async function sendInviteEmail(invite: any, from: User, origin: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !origin) return false;
  const link = `${origin.replace(/\/$/, '')}/join/${invite.token}`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.INVITE_FROM || 'Teqnite Tasks <onboarding@resend.dev>',
        to: [invite.email],
        subject: `${from.name} invited you to Teqnite Tasks`,
        html: `<p>${from.name} has invited you to join their workspace on Teqnite Tasks as a ${invite.role}.</p>`
          + `<p><a href="${link}">Accept the invitation</a></p>`
          + `<p style="color:#667085;font-size:13px">This link works for 14 days and only for ${invite.email}.</p>`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const handlers: Record<string, Handler> = {
  /* ───────────── auth ───────────── */
  async 'auth.status'(p) {
    const sql = db();
    const [{ n }] = await sql`select count(*)::int as n from users`;
    let invite: any = null;
    if (p?.token) {
      const row = await inviteByToken(text(p.token, 100));
      if (row) invite = { email: row.email, role: row.role, token: row.token };
    }
    return { hasUsers: n > 0, google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), invite };
  },

  async 'auth.signup'(p, ctx) {
    const sql = db();
    const name = need(p.name, 'Name');
    const email = need(p.email, 'Email').toLowerCase();
    const password = String(p.password || '');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email address');
    if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
    const [exists] = await sql`select 1 from users where lower(email) = ${email}`;
    if (exists) throw new HttpError(409, 'An account with this email already exists');
    const [{ n }] = await sql`select count(*)::int as n from users`;
    const { role, invite } = await roleForNewAccount({ email, token: text(p.token, 100), code: text(p.inviteCode, 100) });
    const hash = await bcrypt.hash(password, 10);
    const [user] = await sql`insert into users (name, email, password_hash, role, color)
      values (${name}, ${email}, ${hash}, ${role}, ${pickColor(n)}) returning id, name, email, role, color, active`;
    await acceptInvite(invite, user.id);
    if (n === 0) {
      await setting('invite_code');
      await setting('guest_invite_code');
      await seedWelcomeProject(user as User);
    }
    ctx.session = user.id;
    return { ok: true };
  },

  async 'auth.login'(p, ctx) {
    const email = text(p.email).toLowerCase();
    const [user] = await db()`select id, password_hash, active from users where lower(email) = ${email}`;
    if (user && !user.password_hash) throw new HttpError(400, 'This account signs in with Google. Use the Google button instead.');
    const ok = user && (await bcrypt.compare(String(p.password || ''), user.password_hash));
    if (!ok) throw new HttpError(401, 'Wrong email or password');
    if (!user.active) throw new HttpError(403, 'This account has been deactivated');
    ctx.session = user.id;
    return { ok: true };
  },

  async 'auth.logout'(_p, ctx) {
    ctx.session = null;
    return { ok: true };
  },

  /* ───────────── workspace ───────────── */
  async bootstrap(_p, { user }) {
    const sql = db();
    const mine = isAdmin(user) ? sql`` : sql`where exists (select 1 from project_members pm where pm.project_id = p.id and pm.user_id = ${user.id})`;
    const visibleUsers = user.role === 'guest'
      ? sql`where u.id = ${user.id} or exists (select 1 from project_members a join project_members b on a.project_id = b.project_id where a.user_id = u.id and b.user_id = ${user.id})`
      : sql``;
    const [users, projects, timer, unread, dm] = await Promise.all([
      sql`select u.id, u.name, u.email, u.role, u.color, u.avatar_url, u.active from users u ${visibleUsers} order by u.name`,
      sql`select p.*,
          (select count(*)::int from tasks t where t.project_id = p.id and t.parent_id is null) as task_count,
          (select count(*)::int from tasks t where t.project_id = p.id and t.parent_id is null and t.completed_at is not null) as done_count,
          (select count(*)::int from tasks t where t.project_id = p.id and t.parent_id is null and t.completed_at is null and t.due_date < current_date) as overdue_count,
          (select row_to_json(m) from (select name, end_date from milestones m where m.project_id = p.id and m.end_date >= current_date order by end_date limit 1) m) as next_milestone,
          (select coalesce(jsonb_agg(pm.user_id), '[]') from project_members pm where pm.project_id = p.id) as member_ids,
          (select count(*)::int from messages g where g.project_id = p.id
            and g.user_id is distinct from ${user.id}
            and g.created_at > coalesce((select cr.last_read_at from channel_reads cr where cr.project_id = p.id and cr.user_id = ${user.id}), 'epoch'::timestamptz)) as chat_unread
        from projects p ${mine} order by p.archived, p.created_at`,
      sql`select e.id, e.project_id, e.task_id, e.started_at, t.title as task_title, p.name as project_name
        from time_entries e join projects p on p.id = e.project_id left join tasks t on t.id = e.task_id
        where e.user_id = ${user.id} and e.ended_at is null order by e.started_at desc limit 1`,
      sql`select count(*)::int as n from notifications where user_id = ${user.id} and not read`,
      sql`select count(*)::int as n from conversation_members me
        where me.user_id = ${user.id} and exists (select 1 from dm_messages d where d.conversation_id = me.conversation_id and d.created_at > me.last_read_at and d.user_id is distinct from ${user.id})`,
    ]);
    const channelUnread = projects.reduce((n: number, p: any) => n + (p.chat_unread || 0), 0);
    return { me: user, users, projects, timer: timer[0] || null, unread: unread[0].n, dmUnread: dm[0].n + channelUnread, channelUnread };
  },

  /** Marks a project's chat channel as read up to now. */
  async 'channel.read'(p, { user }) {
    await access(user, p.projectId);
    await db()`insert into channel_reads (project_id, user_id, last_read_at) values (${p.projectId}, ${user.id}, now())
      on conflict (project_id, user_id) do update set last_read_at = now()`;
    return { ok: true };
  },

  /** Global search across everything the person is allowed to see. */
  async search(p, { user }) {
    const sql = db();
    const q = text(p.q, 80);
    if (q.length < 2) return { tasks: [], projects: [], docs: [], people: [] };
    const like = `%${q.toLowerCase()}%`;
    const mineT = isAdmin(user) ? sql`` : sql`and exists (select 1 from project_members pm where pm.project_id = t.project_id and pm.user_id = ${user.id})`;
    const mineP = isAdmin(user) ? sql`` : sql`and exists (select 1 from project_members pm where pm.project_id = p.id and pm.user_id = ${user.id})`;
    const mineD = isAdmin(user) ? sql`` : sql`and exists (select 1 from project_members pm where pm.project_id = d.project_id and pm.user_id = ${user.id})`;
    const [tasks, projects, docs, people] = await Promise.all([
      sql`select t.id, t.title, t.project_id, t.completed_at, p.name as project_name, p.color as project_color
        from tasks t join projects p on p.id = t.project_id
        where lower(t.title) like ${like} ${mineT} order by t.completed_at nulls first, t.created_at desc limit 8`,
      sql`select p.id, p.name, p.color from projects p where lower(p.name) like ${like} ${mineP} order by p.archived, p.name limit 6`,
      sql`select d.id, d.title, d.project_id, p.name as project_name from docs d join projects p on p.id = d.project_id
        where lower(d.title) like ${like} ${mineD} order by d.updated_at desc limit 5`,
      user.role === 'guest' ? sql`select id, name, email, color from users where false` :
        sql`select id, name, email, color from users where active and (lower(name) like ${like} or lower(email) like ${like}) limit 5`,
    ]);
    return { tasks, projects, docs, people };
  },

  async mywork(_p, { user }) {
    const sql = db();
    const mine = isAdmin(user) ? sql`` : sql`and exists (select 1 from project_members pm where pm.project_id = p.id and pm.user_id = ${user.id})`;
    return sql`select t.*, p.name as project_name, p.color as project_color, s.name as status_name
      from tasks t join projects p on p.id = t.project_id left join statuses s on s.id = t.status_id
      where jsonb_exists(t.assignees, ${user.id}) and t.completed_at is null and t.parent_id is null and not p.archived ${mine}
      order by t.due_date nulls last, t.created_at`;
  },

  /* ───────────── projects ───────────── */
  async 'project.create'(p, { user }) {
    const sql = db();
    const name = need(p.name, 'Project name');
    const [{ n }] = await sql`select count(*)::int as n from projects`;
    const [project] = await sql`insert into projects (name, description, color, portfolio, key, created_by)
      values (${name}, ${text(p.description)}, ${text(p.color) || pickColor(n)}, ${text(p.portfolio, 80)}, ${await projectKey(name)}, ${user.id}) returning *`;
    await sql`insert into project_members (project_id, user_id) values (${project.id}, ${user.id})`;
    const names = ['To do', 'In progress', 'Review', 'Done'];
    for (let i = 0; i < names.length; i++) {
      await sql`insert into statuses (project_id, name, position, is_done) values (${project.id}, ${names[i]}, ${i}, ${i === names.length - 1})`;
    }
    await log(project.id, user.id, 'created the project');
    return project;
  },

  async 'project.update'(p, { user }) {
    const sql = db();
    await manages(user, p.id);
    const u: any = {};
    for (const k of ['name', 'description', 'color', 'portfolio']) if (typeof p[k] === 'string') u[k] = text(p[k]);
    if (typeof p.archived === 'boolean') u.archived = p.archived;
    if ('name' in u && !u.name) throw new HttpError(400, 'Project name is required');
    if (!Object.keys(u).length) return null;
    const [row] = await sql`update projects set ${sql(u)} where id = ${p.id} returning *`;
    return row;
  },

  async 'project.delete'(p, { user }) {
    const sql = db();
    const [project] = await sql`select id, created_by from projects where id = ${p.id}`;
    if (!project) return { ok: true };
    await manages(user, p.id);
    if (!isAdmin(user) && project.created_by !== user.id) {
      throw new HttpError(403, 'Managers can only delete projects they created. Ask an admin to remove this one.');
    }
    await sql`delete from projects where id = ${p.id}`;
    return { ok: true };
  },

  async 'project.get'(p, { user }) {
    const sql = db();
    const [project] = await sql`select * from projects where id = ${p.id}`;
    if (!project) throw new HttpError(404, 'Project not found');
    await access(user, p.id);
    const [statuses, milestones, tasks, activity, members] = await Promise.all([
      sql`select * from statuses where project_id = ${p.id} order by position`,
      sql`select m.*,
          (select count(*)::int from tasks t where t.milestone_id = m.id and t.parent_id is null) as task_count,
          (select count(*)::int from tasks t where t.milestone_id = m.id and t.parent_id is null and t.completed_at is not null) as done_count
        from milestones m where project_id = ${p.id} order by start_date, end_date`,
      sql`select t.*,
          (select count(*)::int from tasks s where s.parent_id = t.id) as sub_total,
          (select count(*)::int from tasks s where s.parent_id = t.id and s.completed_at is not null) as sub_done,
          (select count(*)::int from comments c where c.task_id = t.id) as comment_count,
          (select count(*)::int from files f where f.task_id = t.id) as file_count
        from tasks t where t.project_id = ${p.id} and t.parent_id is null order by t.position`,
      sql`select a.id, a.text, a.created_at, a.user_id from activity a where project_id = ${p.id} order by created_at desc limit 25`,
      sql`select user_id from project_members where project_id = ${p.id}`,
    ]);
    return { project, statuses, milestones, tasks, activity, members: members.map((m: any) => m.user_id) };
  },

  /** Add or remove a person on a project. */
  async 'member.set'(p, { user }) {
    const sql = db();
    await manages(user, p.projectId);
    const [target] = await sql`select id, role, name from users where id = ${p.userId}`;
    if (!target) throw new HttpError(404, 'Member not found');
    if (p.on) {
      const added = await sql`insert into project_members (project_id, user_id) values (${p.projectId}, ${p.userId}) on conflict do nothing returning user_id`;
      if (added.length) {
        const [project] = await sql`select name from projects where id = ${p.projectId}`;
        await notify([p.userId], user, { projectId: p.projectId, kind: 'project', text: `added you to the project "${project.name}"` });
        await log(p.projectId, user.id, `added ${target.name} to the project`);
      }
    } else {
      await sql`delete from project_members where project_id = ${p.projectId} and user_id = ${p.userId}`;
      await sql`update tasks set assignees = assignees - ${String(p.userId)} where project_id = ${p.projectId} and jsonb_exists(assignees, ${String(p.userId)})`;
    }
    return { ok: true };
  },

  /* ───────────── statuses (task lists) ───────────── */
  async 'status.create'(p, { user }) {
    const sql = db();
    await access(user, p.projectId);
    const name = need(p.name, 'List name');
    const [{ pos }] = await sql`select coalesce(max(position), -1) + 1 as pos from statuses where project_id = ${p.projectId}`;
    const [row] = await sql`insert into statuses (project_id, name, position) values (${p.projectId}, ${name}, ${pos}) returning *`;
    return row;
  },

  async 'status.update'(p, { user }) {
    const sql = db();
    await entity(user, 'statuses', p.id);
    const u: any = {};
    if (typeof p.name === 'string') u.name = need(p.name, 'List name');
    if (typeof p.is_done === 'boolean') u.is_done = p.is_done;
    if (!Object.keys(u).length) return null;
    const [row] = await sql`update statuses set ${sql(u)} where id = ${p.id} returning *`;
    if (row && typeof p.is_done === 'boolean') {
      if (p.is_done) await sql`update tasks set completed_at = coalesce(completed_at, now()) where status_id = ${p.id}`;
      else await sql`update tasks set completed_at = null where status_id = ${p.id}`;
    }
    return row;
  },

  async 'status.reorder'(p, { user }) {
    const sql = db();
    await access(user, p.projectId);
    await sql`update statuses s set position = v.pos from jsonb_array_elements_text(${sql.json(p.orderedIds || [])}) with ordinality as v(id, pos)
      where s.id = v.id::uuid and s.project_id = ${p.projectId}`;
    return { ok: true };
  },

  async 'status.delete'(p, { user }) {
    const sql = db();
    const status = await entity(user, 'statuses', p.id);
    const [other] = await sql`select * from statuses where project_id = ${status.project_id} and id <> ${p.id} order by position limit 1`;
    if (!other) throw new HttpError(400, 'A project needs at least one list');
    await sql`update tasks set status_id = ${other.id}, completed_at = ${other.is_done ? sql`coalesce(completed_at, now())` : null} where status_id = ${p.id}`;
    await sql`delete from statuses where id = ${p.id}`;
    return { ok: true };
  },

  /* ───────────── tasks ───────────── */
  async 'task.create'(p, { user }) {
    const sql = db();
    await access(user, p.projectId);
    const title = need(p.title, 'Task title');
    let statusId = p.statusId || null;
    let done = false;
    if (!p.parentId) {
      const [s] = statusId
        ? await sql`select * from statuses where id = ${statusId} and project_id = ${p.projectId}`
        : await sql`select * from statuses where project_id = ${p.projectId} order by position limit 1`;
      if (!s) throw new HttpError(400, 'Project has no lists');
      statusId = s.id;
      done = s.is_done;
    } else statusId = null;
    const assignees = uniq(Array.isArray(p.assignees) ? p.assignees : []);
    const [{ pos }] = await sql`select coalesce(max(position), -1) + 1 as pos from tasks where project_id = ${p.projectId}`;
    const [{ num }] = p.parentId
      ? [{ num: null }]
      : await sql`select coalesce(max(number), 0) + 1 as num from tasks where project_id = ${p.projectId}`;
    const [task] = await sql`insert into tasks (project_id, status_id, parent_id, milestone_id, title, description, start_date, due_date, assignees, position, number, completed_at, created_by)
      values (${p.projectId}, ${statusId}, ${p.parentId || null}, ${p.milestoneId || null}, ${title}, ${text(p.description, 20000)},
        ${dateOrNull(p.startDate)}, ${dateOrNull(p.dueDate)}, ${sql.json(assignees)}, ${pos}, ${num}, ${done ? sql`now()` : null}, ${user.id})
      returning *`;
    if (!p.parentId) {
      await log(p.projectId, user.id, `created task "${title}"`, task.id);
      await notify(assignees, user, { projectId: p.projectId, taskId: task.id, kind: 'assigned', text: `assigned you to "${title}"` });
    }
    return task;
  },

  async 'task.get'(p, { user }) {
    const sql = db();
    const task = await entity(user, 'tasks', p.id);
    const [subtasks, comments, files, time, blocking, activity, entries] = await Promise.all([
      sql`select id, title, completed_at, position from tasks where parent_id = ${p.id} order by position`,
      sql`select c.*, coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'mime', f.mime, 'size', f.size, 'url', f.url) order by f.created_at)
            from files f where f.comment_id = c.id), '[]') as attachments
        from comments c where c.task_id = ${p.id} order by c.created_at`,
      sql`select id, name, mime, size, url, uploaded_by, created_at from files
        where task_id = ${p.id} and comment_id is null order by created_at`,
      sql`select coalesce(sum(seconds) filter (where ended_at is not null), 0)::int as seconds,
          min(started_at) filter (where ended_at is null) as running_since
        from time_entries where task_id = ${p.id}`,
      sql`select id, title, completed_at from tasks where project_id = ${task.project_id} and jsonb_exists(blocked_by, ${String(p.id)})`,
      sql`select id, user_id, text, created_at from activity where task_id = ${p.id} order by created_at limit 100`,
      sql`select id, user_id, seconds, ended_at as created_at from time_entries
        where task_id = ${p.id} and ended_at is not null order by ended_at limit 100`,
    ]);
    return {
      task,
      subtasks,
      comments,
      files,
      seconds: time[0].seconds,
      runningSince: time[0].running_since,
      blocking,
      activity,
      entries,
    };
  },

  async 'task.update'(p, { user }) {
    const sql = db();
    const patch = p.patch || {};
    const task = await entity(user, 'tasks', p.id);
    const u: any = {};
    if (typeof patch.title === 'string') u.title = need(patch.title, 'Task title');
    if (typeof patch.description === 'string') u.description = patch.description.slice(0, 20000);
    if (typeof patch.priority === 'string' && ['none', 'low', 'medium', 'high'].includes(patch.priority)) u.priority = patch.priority;
    if (typeof patch.recurrence === 'string' && RECURRENCES.includes(patch.recurrence)) u.recurrence = patch.recurrence;
    for (const k of ['start_date', 'due_date']) if (k in patch) u[k] = dateOrNull(patch[k]);
    if ('milestone_id' in patch) u.milestone_id = patch.milestone_id || null;
    if (Array.isArray(patch.tags)) u.tags = sql.json(uniq(patch.tags.map((t: any) => text(t, 40))));
    let newAssignees: string[] = [];
    if (Array.isArray(patch.assignees)) {
      const next = uniq(patch.assignees);
      u.assignees = sql.json(next);
      newAssignees = next.filter((id) => !(task.assignees || []).includes(id));
    }
    if (Array.isArray(patch.blocked_by)) {
      const ids = uniq(patch.blocked_by).filter((id) => id !== task.id);
      const all = await sql`select id, blocked_by from tasks where project_id = ${task.project_id} and parent_id is null`;
      const map = new Map<string, string[]>(all.map((t: any) => [t.id, t.blocked_by || []]));
      for (const id of ids) if (!map.has(id)) throw new HttpError(400, 'A task can only depend on tasks in the same project');
      // refuse circular chains: none of the blockers may (directly or indirectly) wait on this task
      const seen = new Set<string>();
      const stack = [...ids];
      while (stack.length) {
        const id = stack.pop()!;
        if (id === task.id) throw new HttpError(400, 'That would create a circular dependency');
        if (seen.has(id)) continue;
        seen.add(id);
        stack.push(...(map.get(id) || []));
      }
      u.blocked_by = sql.json(ids);
    }
    let logLine = '';
    let completing = false;
    if (patch.status_id && patch.status_id !== task.status_id) {
      const [s] = await sql`select * from statuses where id = ${patch.status_id} and project_id = ${task.project_id}`;
      if (s) {
        u.status_id = s.id;
        u.completed_at = s.is_done ? task.completed_at || new Date() : null;
        completing = s.is_done && !task.completed_at;
        logLine = s.is_done ? `completed "${task.title}"` : `moved "${task.title}" to ${s.name}`;
      }
    }
    if (typeof patch.done === 'boolean') {
      u.completed_at = patch.done ? task.completed_at || new Date() : null;
      completing = patch.done && !task.completed_at;
      if (!task.parent_id) {
        const [s] = await sql`select * from statuses where project_id = ${task.project_id} and is_done = ${patch.done} order by position limit 1`;
        if (s) u.status_id = s.id;
        logLine = patch.done ? `completed "${task.title}"` : `reopened "${task.title}"`;
      }
    }
    if (!Object.keys(u).length) return task;
    const [row] = await sql`update tasks set ${sql(u)} where id = ${p.id} returning *`;
    if (logLine) await log(task.project_id, user.id, logLine, task.id);
    if (newAssignees.length) await notify(newAssignees, user, { projectId: task.project_id, taskId: task.id, kind: 'assigned', text: `assigned you to "${row.title}"` });
    if (completing) await afterComplete(row, user);
    return row;
  },

  async 'task.move'(p, { user }) {
    const sql = db();
    const task = await entity(user, 'tasks', p.id);
    const [s] = await sql`select * from statuses where id = ${p.statusId} and project_id = ${task.project_id}`;
    if (!s) throw new HttpError(404, 'List not found');
    const [row] = await sql`update tasks set status_id = ${s.id}, completed_at = ${s.is_done ? sql`coalesce(completed_at, now())` : null} where id = ${p.id} returning *`;
    await sql`update tasks t set position = v.pos from jsonb_array_elements_text(${sql.json(p.orderedIds || [])}) with ordinality as v(id, pos)
      where t.id = v.id::uuid and t.project_id = ${task.project_id}`;
    if (task.status_id !== s.id) await log(task.project_id, user.id, s.is_done ? `completed "${task.title}"` : `moved "${task.title}" to ${s.name}`, task.id);
    if (s.is_done && !task.completed_at) await afterComplete(row, user);
    return { ok: true };
  },

  async 'task.delete'(p, { user }) {
    const sql = db();
    const task = await entity(user, 'tasks', p.id);
    await sql`delete from tasks where id = ${p.id}`;
    await sql`update tasks set blocked_by = blocked_by - ${String(p.id)} where project_id = ${task.project_id} and jsonb_exists(blocked_by, ${String(p.id)})`;
    if (!task.parent_id) await log(task.project_id, user.id, `deleted task "${task.title}"`);
    return { ok: true };
  },

  async 'comment.create'(p, { user }) {
    const sql = db();
    const task = await entity(user, 'tasks', p.taskId);
    const body = text(p.body, 20000);
    const fileIds = uniq(Array.isArray(p.fileIds) ? p.fileIds : []);
    if (!body && !fileIds.length) throw new HttpError(400, 'Write something or attach a file');
    const [row] = await sql`insert into comments (task_id, user_id, body) values (${p.taskId}, ${user.id}, ${body}) returning *`;
    await attach(fileIds, task.project_id, user.id, 'comment_id', row.id);
    const tagged = await mentioned(body, task.project_id);
    await notify(tagged, user, { projectId: task.project_id, taskId: task.id, kind: 'mention', text: `mentioned you in a comment on "${task.title}"` });
    const followers = uniq([...(task.assignees || []), task.created_by]).filter((id) => !tagged.includes(id));
    await notify(followers, user, { projectId: task.project_id, taskId: task.id, kind: 'comment', text: `commented on "${task.title}"` });
    return row;
  },

  async 'comment.update'(p, { user }) {
    const sql = db();
    const [c] = await sql`select c.*, t.project_id from comments c join tasks t on t.id = c.task_id where c.id = ${p.id}`;
    if (!c) throw new HttpError(404, 'Comment not found');
    await access(user, c.project_id);
    if (c.user_id !== user.id) throw new HttpError(403, 'You can only edit your own comments');
    const body = need(p.body, 'Comment');
    const [row] = await sql`update comments set body = ${body}, edited_at = now() where id = ${p.id} returning *`;
    return row;
  },

  async 'comment.delete'(p, { user }) {
    const sql = db();
    const [c] = await sql`select c.*, t.project_id from comments c join tasks t on t.id = c.task_id where c.id = ${p.id}`;
    if (!c) return { ok: true };
    await access(user, c.project_id);
    if (c.user_id !== user.id && !isAdmin(user)) throw new HttpError(403, 'You can only delete your own comments');
    await sql`delete from comments where id = ${p.id}`;
    return { ok: true };
  },

  /* ───────────── milestones ───────────── */  /* ───────────── milestones ───────────── */
  async 'milestone.create'(p, { user }) {
    await access(user, p.projectId);
    const name = need(p.name, 'Milestone name');
    const start = dateOrNull(p.start_date);
    const end = dateOrNull(p.end_date);
    if (!start || !end) throw new HttpError(400, 'Start and end dates are required');
    if (end < start) throw new HttpError(400, 'End date must be after the start date');
    const [row] = await db()`insert into milestones (project_id, name, description, start_date, end_date, color)
      values (${p.projectId}, ${name}, ${text(p.description)}, ${start}, ${end}, ${text(p.color) || COLORS[1]}) returning *`;
    await log(p.projectId, user.id, `added milestone "${name}"`);
    return row;
  },

  async 'milestone.update'(p, { user }) {
    const sql = db();
    const m = await entity(user, 'milestones', p.id);
    const u: any = {};
    if (typeof p.name === 'string') u.name = need(p.name, 'Milestone name');
    if (typeof p.description === 'string') u.description = text(p.description);
    if (typeof p.color === 'string') u.color = text(p.color);
    if (dateOrNull(p.start_date)) u.start_date = p.start_date;
    if (dateOrNull(p.end_date)) u.end_date = p.end_date;
    if ((u.end_date || m.end_date) < (u.start_date || m.start_date)) throw new HttpError(400, 'End date must be after the start date');
    if (!Object.keys(u).length) return m;
    const [row] = await sql`update milestones set ${sql(u)} where id = ${p.id} returning *`;
    return row;
  },

  async 'milestone.delete'(p, { user }) {
    await entity(user, 'milestones', p.id);
    await db()`delete from milestones where id = ${p.id}`;
    return { ok: true };
  },

  /* ───────────── discussions ───────────── */
  async 'message.list'(p, { user }) {
    await access(user, p.projectId);
    const sql = db();
    const rows = await sql`select m.*,
        coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'mime', f.mime, 'size', f.size, 'url', f.url) order by f.created_at)
          from files f where f.message_id = m.id), '[]') as attachments
      from messages m where m.project_id = ${p.projectId} order by m.created_at desc limit 400`;
    return [...rows].reverse();
  },

  async 'message.create'(p, { user }) {
    const sql = db();
    await access(user, p.projectId);
    const body = text(p.body, 20000);
    const fileIds = uniq(Array.isArray(p.fileIds) ? p.fileIds : []);
    if (!body && !fileIds.length) throw new HttpError(400, 'Write something or attach a file');
    let parentId: string | null = null;
    if (p.parentId) {
      const [parent] = await sql`select id, user_id, body from messages where id = ${p.parentId} and project_id = ${p.projectId} and parent_id is null`;
      if (!parent) throw new HttpError(404, 'That message is no longer there');
      parentId = parent.id;
    }
    const [row] = await sql`insert into messages (project_id, user_id, body, parent_id) values (${p.projectId}, ${user.id}, ${body}, ${parentId}) returning *`;
    await attach(fileIds, p.projectId, user.id, 'message_id', row.id);
    const [project] = await sql`select name from projects where id = ${p.projectId}`;
    const tagged = await mentioned(body, p.projectId);
    if (tagged.length) {
      await notify(tagged, user, { projectId: p.projectId, kind: 'mention', text: `mentioned you in ${project.name} discussions` });
    }
    if (parentId) {
      // everyone already in the thread hears about a reply
      const inThread = await sql`select distinct user_id from messages where (id = ${parentId} or parent_id = ${parentId}) and user_id is not null`;
      await notify(inThread.map((r: any) => r.user_id).filter((id: string) => !tagged.includes(id)), user,
        { projectId: p.projectId, kind: 'reply', text: `replied in ${project.name} discussions` });
    }
    return row;
  },

  async 'message.update'(p, { user }) {
    const m = await entity(user, 'messages', p.id);
    if (m.user_id !== user.id) throw new HttpError(403, 'You can only edit your own messages');
    const body = need(p.body, 'Message');
    const [row] = await db()`update messages set body = ${body}, edited_at = now() where id = ${p.id} returning *`;
    return row;
  },

  async 'message.delete'(p, { user }) {
    const m = await entity(user, 'messages', p.id);
    if (m.user_id !== user.id && !isAdmin(user)) throw new HttpError(403, 'You can only delete your own messages');
    await db()`delete from messages where id = ${p.id}`;
    return { ok: true };
  },

  /* ───────────── docs ───────────── */
  async 'doc.list'(p, { user }) {
    await access(user, p.projectId);
    return db()`select id, title, updated_at, updated_by from docs where project_id = ${p.projectId} order by updated_at desc`;
  },

  async 'doc.get'(p, { user }) {
    return entity(user, 'docs', p.id);
  },

  async 'doc.create'(p, { user }) {
    await access(user, p.projectId);
    const title = text(p.title, 200) || 'Untitled doc';
    const [row] = await db()`insert into docs (project_id, title, content, updated_by) values (${p.projectId}, ${title}, ${String(p.content || '')}, ${user.id}) returning *`;
    await log(p.projectId, user.id, `created doc "${title}"`);
    return row;
  },

  async 'doc.update'(p, { user }) {
    const sql = db();
    await entity(user, 'docs', p.id);
    const u: any = { updated_by: user.id, updated_at: new Date() };
    if (typeof p.title === 'string') u.title = text(p.title, 200) || 'Untitled doc';
    if (typeof p.content === 'string') u.content = p.content.slice(0, 500000);
    const [row] = await sql`update docs set ${sql(u)} where id = ${p.id} returning id, title, updated_at`;
    return row;
  },

  async 'doc.delete'(p, { user }) {
    await entity(user, 'docs', p.id);
    await db()`delete from docs where id = ${p.id}`;
    return { ok: true };
  },

  /* ───────────── files ───────────── */
  async 'file.list'(p, { user }) {
    await access(user, p.projectId);
    return db()`select f.id, f.name, f.mime, f.size, f.url, f.task_id, f.uploaded_by, f.created_at, t.title as task_title
      from files f left join tasks t on t.id = f.task_id where f.project_id = ${p.projectId} order by f.created_at desc`;
  },

  async 'file.addLink'(p, { user }) {
    await access(user, p.projectId);
    const url = need(p.url, 'Link');
    if (!/^https?:\/\//i.test(url)) throw new HttpError(400, 'Links must start with http:// or https://');
    const name = text(p.name, 200) || url.replace(/^https?:\/\//, '').slice(0, 80);
    const [row] = await db()`insert into files (project_id, task_id, name, mime, url, uploaded_by)
      values (${p.projectId}, ${p.taskId || null}, ${name}, 'link', ${url}, ${user.id}) returning id`;
    return row;
  },

  async 'file.delete'(p, { user }) {
    await entity(user, 'files', p.id);
    await db()`delete from files where id = ${p.id}`;
    return { ok: true };
  },

  /* ───────────── time tracking ───────────── */
  async 'time.start'(p, { user }) {
    const sql = db();
    let projectId = p.projectId;
    if (p.taskId) projectId = (await entity(user, 'tasks', p.taskId)).project_id;
    else await access(user, projectId);
    await sql`update time_entries set ended_at = now(), seconds = extract(epoch from now() - started_at)::int where user_id = ${user.id} and ended_at is null`;
    const [row] = await sql`insert into time_entries (project_id, task_id, user_id, note) values (${projectId}, ${p.taskId || null}, ${user.id}, ${text(p.note, 300)}) returning *`;
    return row;
  },

  async 'time.stop'(_p, { user }) {
    await db()`update time_entries set ended_at = now(), seconds = extract(epoch from now() - started_at)::int where user_id = ${user.id} and ended_at is null`;
    return { ok: true };
  },

  async 'time.add'(p, { user }) {
    const sql = db();
    await access(user, p.projectId);
    const minutes = Math.round(Number(p.minutes));
    if (!minutes || minutes < 1 || minutes > 24 * 60) throw new HttpError(400, 'Enter a duration between 1 minute and 24 hours');
    const date = dateOrNull(p.date);
    if (!date) throw new HttpError(400, 'Date is required');
    const [row] = await sql`insert into time_entries (project_id, task_id, user_id, started_at, ended_at, seconds, note)
      values (${p.projectId}, ${p.taskId || null}, ${user.id}, ${date}::date + time '09:00', ${date}::date + time '09:00' + ${minutes}::int * interval '1 minute', ${minutes * 60}, ${text(p.note, 300)})
      returning id`;
    return row;
  },

  async 'time.list'(p, { user }) {
    await access(user, p.projectId);
    return db()`select e.id, e.project_id, e.task_id, e.user_id, e.started_at, e.ended_at, e.note,
        (case when e.ended_at is null then extract(epoch from now() - e.started_at) else e.seconds end)::int as seconds,
        t.title as task_title
      from time_entries e left join tasks t on t.id = e.task_id
      where e.project_id = ${p.projectId} order by e.started_at desc limit 300`;
  },

  async 'time.delete'(p, { user }) {
    const e = await entity(user, 'time_entries', p.id);
    if (e.user_id !== user.id && !isAdmin(user)) throw new HttpError(403, 'You can only delete your own time entries');
    await db()`delete from time_entries where id = ${p.id}`;
    return { ok: true };
  },

  /* ───────────── reports ───────────── */
  async 'report.summary'(p, { user }) {
    const sql = db();
    const from = dateOrNull(p.from);
    const to = dateOrNull(p.to);
    if (!from || !to) throw new HttpError(400, 'Pick a date range');
    const admin = isAdmin(user);
    const mineE = admin ? sql`` : sql`and exists (select 1 from project_members pm where pm.project_id = e.project_id and pm.user_id = ${user.id})`;
    const mineT = admin ? sql`` : sql`and exists (select 1 from project_members pm where pm.project_id = t.project_id and pm.user_id = ${user.id})`;
    const [time, workload] = await Promise.all([
      sql`select e.user_id, e.project_id,
          sum(case when e.ended_at is null then extract(epoch from now() - e.started_at) else e.seconds end)::int as seconds
        from time_entries e where e.started_at >= ${from}::date and e.started_at < ${to}::date + 1 ${mineE} group by 1, 2`,
      sql`select u.id as user_id,
          count(t.id) filter (where t.completed_at is null)::int as open,
          count(t.id) filter (where t.completed_at is null and t.due_date < current_date)::int as overdue,
          count(t.id) filter (where t.completed_at >= ${from}::date and t.completed_at < ${to}::date + 1)::int as completed
        from users u left join tasks t on jsonb_exists(t.assignees, u.id::text) and t.parent_id is null ${mineT}
        where u.active and u.role <> 'guest' group by u.id`,
    ]);
    return { time, workload };
  },

  /* ───────────── notifications ───────────── */
  async 'notif.list'(_p, { user }) {
    return db()`select n.id, n.actor_id, n.project_id, n.task_id, n.kind, n.text, n.read, n.created_at, p.name as project_name
      from notifications n left join projects p on p.id = n.project_id
      where n.user_id = ${user.id} order by n.created_at desc limit 60`;
  },

  async 'notif.read'(p, { user }) {
    const sql = db();
    if (p.id) await sql`update notifications set read = true where id = ${p.id} and user_id = ${user.id}`;
    else await sql`update notifications set read = true where user_id = ${user.id} and not read`;
    return { ok: true };
  },

  /* ───────────── direct messages ───────────── */
  async 'dm.list'(_p, { user }) {
    return db()`select c.id, c.name, c.is_group,
        (select jsonb_agg(m.user_id) from conversation_members m where m.conversation_id = c.id) as member_ids,
        (select row_to_json(x) from (select d.body, d.created_at, d.user_id from dm_messages d where d.conversation_id = c.id order by d.created_at desc limit 1) x) as last,
        (select count(*)::int from dm_messages d where d.conversation_id = c.id and d.created_at > me.last_read_at and d.user_id is distinct from ${user.id}) as unread
      from conversations c join conversation_members me on me.conversation_id = c.id and me.user_id = ${user.id}
      order by c.updated_at desc`;
  },

  async 'dm.open'(p, { user }) {
    const sql = db();
    const ids = uniq(Array.isArray(p.userIds) ? p.userIds : []).filter((id) => id !== user.id);
    if (!ids.length) throw new HttpError(400, 'Choose at least one person');
    const people = await sql`select id from users where id = any(${ids}::uuid[]) and active and role <> 'guest'`;
    if (people.length !== ids.length) throw new HttpError(400, 'One of those people cannot be messaged');
    if (ids.length === 1) {
      const [existing] = await sql`select c.id from conversations c
        where not c.is_group
          and exists (select 1 from conversation_members m where m.conversation_id = c.id and m.user_id = ${user.id})
          and exists (select 1 from conversation_members m where m.conversation_id = c.id and m.user_id = ${ids[0]})
        limit 1`;
      if (existing) return { id: existing.id };
    }
    const [conv] = await sql`insert into conversations (name, is_group, created_by) values (${text(p.name, 80)}, ${ids.length > 1}, ${user.id}) returning id`;
    for (const id of [user.id, ...ids]) await sql`insert into conversation_members (conversation_id, user_id) values (${conv.id}, ${id})`;
    return { id: conv.id };
  },

  async 'dm.messages'(p, { user }) {
    const sql = db();
    const marked = await sql`update conversation_members set last_read_at = now() where conversation_id = ${p.id} and user_id = ${user.id} returning user_id`;
    if (!marked.length) throw new HttpError(404, 'Conversation not found');
    const rows = await sql`select id, user_id, body, created_at from dm_messages where conversation_id = ${p.id} order by created_at desc limit 300`;
    return [...rows].reverse();
  },

  async 'dm.send'(p, { user }) {
    const sql = db();
    const body = need(p.body, 'Message');
    const marked = await sql`update conversation_members set last_read_at = now() + interval '1 second' where conversation_id = ${p.id} and user_id = ${user.id} returning user_id`;
    if (!marked.length) throw new HttpError(404, 'Conversation not found');
    const [row] = await sql`insert into dm_messages (conversation_id, user_id, body) values (${p.id}, ${user.id}, ${body}) returning id`;
    await sql`update conversations set updated_at = now() where id = ${p.id}`;
    return row;
  },

  /* ───────────── invitations ───────────── */
  /** Invite one person by email, with the role they will get when they join. */
  async 'invite.create'(p, { user }) {
    const sql = db();
    const email = need(p.email, 'Email address').toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email address');
    const role = String(p.role || 'member') as Role;
    if (!CAN_GRANT[user.role].includes(role)) throw new HttpError(403, `You cannot invite someone as ${role}`);
    const [existing] = await sql`select id from users where lower(email) = ${email}`;
    if (existing) throw new HttpError(409, 'Someone with that email is already in this workspace');
    const projectIds = uniq(Array.isArray(p.projectIds) ? p.projectIds : []);
    for (const id of projectIds) await access(user, id);
    await sql`update invitations set expires_at = now() where lower(email) = ${email} and accepted_at is null`;
    const [row] = await sql`insert into invitations (email, role, token, invited_by, project_ids)
      values (${email}, ${role}, ${newToken()}, ${user.id}, ${sql.json(projectIds)}) returning id, email, role, token, created_at, expires_at`;
    const sent = await sendInviteEmail(row, user, text(p.origin, 200));
    return { ...row, sent };
  },

  async 'invite.list'(_p, { user }) {
    return db()`select i.id, i.email, i.role, i.token, i.invited_by, i.created_at, i.expires_at
      from invitations i where i.accepted_at is null and i.expires_at > now() order by i.created_at desc limit 50`;
  },

  async 'invite.revoke'(p, { user }) {
    await db()`update invitations set expires_at = now() where id = ${p.id} and accepted_at is null`;
    return { ok: true };
  },

  /** Used by the join page before anyone is signed in. */
  async 'invite.preview'(p) {
    const row = await inviteByToken(text(p.token, 100));
    if (!row) return null;
    return { email: row.email, role: row.role };
  },

  /* ───────────── team ───────────── */
  async 'team.invite'(p, { user }) {
    adminOnly(user);
    return {
      code: await setting('invite_code', p.regenerate === 'member'),
      guestCode: await setting('guest_invite_code', p.regenerate === 'guest'),
    };
  },

  async 'team.update'(p, { user }) {
    adminOnly(user);
    const sql = db();
    const [target] = await sql`select * from users where id = ${p.id}`;
    if (!target) throw new HttpError(404, 'Member not found');
    if (target.role === 'owner') throw new HttpError(403, 'The workspace owner cannot be changed. Transfer ownership first.');
    if (target.id === user.id) throw new HttpError(403, 'You cannot change your own role');
    const u: any = {};
    if (typeof p.role === 'string') {
      if (!CAN_GRANT[user.role].includes(p.role as Role)) throw new HttpError(403, `You cannot make someone ${p.role}`);
      u.role = p.role;
    }
    if (typeof p.active === 'boolean') u.active = p.active;
    if (!Object.keys(u).length) return null;
    await sql`update users set ${sql(u)} where id = ${p.id}`;
    if (u.role === 'guest') {
      // a guest must not keep tasks assigned to them
      await sql`update tasks set assignees = assignees - ${String(p.id)} where jsonb_exists(assignees, ${String(p.id)})`;
    }
    return { ok: true };
  },

  /** Hands the workspace to someone else. The old owner becomes an admin. */
  async 'team.transfer'(p, { user }) {
    const sql = db();
    const [target] = await sql`select id, name, role, active from users where id = ${p.id}`;
    if (!target || !target.active) throw new HttpError(404, 'Member not found');
    if (target.id === user.id) throw new HttpError(400, 'You are already the owner');
    if (target.role === 'guest') throw new HttpError(400, 'A guest cannot own the workspace');
    await sql`update users set role = 'admin' where id = ${user.id}`;
    await sql`update users set role = 'owner' where id = ${target.id}`;
    await notify([target.id], user, { kind: 'workspace', text: 'made you the owner of this workspace' });
    return { ok: true };
  },

  async 'profile.update'(p, { user }) {
    const sql = db();
    const u: any = {};
    if (typeof p.name === 'string') u.name = need(p.name, 'Name');
    if (typeof p.color === 'string') u.color = text(p.color, 20);
    if (p.newPassword) {
      if (String(p.newPassword).length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
      const [row] = await sql`select password_hash from users where id = ${user.id}`;
      // accounts created through Google have no password yet, so there is nothing to confirm
      if (row.password_hash && !(await bcrypt.compare(String(p.currentPassword || ''), row.password_hash))) {
        throw new HttpError(400, 'Current password is incorrect');
      }
      u.password_hash = await bcrypt.hash(String(p.newPassword), 10);
    }
    if (!Object.keys(u).length) return null;
    await sql`update users set ${sql(u)} where id = ${user.id}`;
    return { ok: true };
  },
};
