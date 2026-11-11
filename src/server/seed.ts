import { db } from '@/lib/db';
import type { User } from './auth';
import { COLORS } from './account';

async function log(projectId: string, userId: string, message: string) {
  await db()`insert into activity (project_id, user_id, text) values (${projectId}, ${userId}, ${message})`;
}

/** First-run sample project, so a brand new workspace is not an empty screen. */
export async function seedWelcomeProject(user: User) {
  const sql = db();
  const userId = user.id;
  const [p] = await sql`insert into projects (name, description, color, portfolio, created_by)
    values ('Welcome to Teqnite Tasks', 'A sample project to show how everything fits together. Delete it whenever you like.', ${COLORS[0]}, 'Internal', ${userId}) returning id`;
  await sql`insert into project_members (project_id, user_id) values (${p.id}, ${userId})`;
  const names = ['To do', 'In progress', 'Review', 'Done'];
  const statuses: any[] = [];
  for (let i = 0; i < names.length; i++) {
    const [s] = await sql`insert into statuses (project_id, name, position, is_done) values (${p.id}, ${names[i]}, ${i}, ${i === 3}) returning id`;
    statuses.push(s.id);
  }
  const [m] = await sql`insert into milestones (project_id, name, start_date, end_date, color)
    values (${p.id}, 'Get the team onboard', current_date, current_date + 14, ${COLORS[1]}) returning id`;
  const tasks: [string, number, string][] = [
    ['Invite your team from the Team page', 0, 'high'],
    ['Create your first client project', 0, 'medium'],
    ['Drag this card to another list', 1, 'none'],
    ['Open a task to add subtasks, comments and files', 1, 'low'],
    ['Sign up and log in', 3, 'none'],
  ];
  for (let i = 0; i < tasks.length; i++) {
    const [title, si, priority] = tasks[i];
    await sql`insert into tasks (project_id, status_id, milestone_id, title, priority, position, assignees, completed_at, created_by, start_date, due_date)
      values (${p.id}, ${statuses[si]}, ${m.id}, ${title}, ${priority}, ${i}, ${sql.json([userId])}, ${si === 3 ? sql`now()` : null}, ${userId}, current_date + ${i}::int, current_date + ${i + 2}::int)`;
  }
  await sql`insert into messages (project_id, user_id, body) values (${p.id}, ${userId}, 'Discussions keep project conversation next to the work. Type @ to mention a teammate, and hover a message to turn it into a task.')`;
  await sql`insert into docs (project_id, title, content, updated_by) values (${p.id}, 'How we use this workspace', ${'# How we use this workspace\n\nDocs support **Markdown**. Use them for briefs, meeting notes and process write-ups.\n\n- One project per client or initiative\n- Milestones mark the big delivery dates\n- Tasks live in lists you can rename to match your workflow\n'}, ${userId})`;
  await log(p.id, userId, 'created the project');
}
