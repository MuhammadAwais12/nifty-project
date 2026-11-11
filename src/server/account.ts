import crypto from 'crypto';
import { db, HttpError } from '@/lib/db';
import type { Role } from './roles';
import { ROLES } from './roles';

export const COLORS = ['#ff5a36', '#5b6cff', '#12b886', '#f59f00', '#e64980', '#7950f2', '#1c7ed6', '#0ca678'];
export const pickColor = (n: number) => COLORS[n % COLORS.length];
export const newToken = () => crypto.randomBytes(18).toString('base64url');

export type Invitation = { id: string; email: string; role: Role; token: string; project_ids: string[] };

/** A pending, unexpired invitation by token. */
export async function inviteByToken(token: string): Promise<Invitation | null> {
  if (!token) return null;
  const [row] = await db()`select id, email, role, token, project_ids from invitations
    where token = ${token} and accepted_at is null and expires_at > now()`;
  return (row as Invitation) || null;
}

/** The newest pending invitation for an email address. */
export async function inviteForEmail(email: string): Promise<Invitation | null> {
  if (!email) return null;
  const [row] = await db()`select id, email, role, token, project_ids from invitations
    where lower(email) = ${email.toLowerCase()} and accepted_at is null and expires_at > now()
    order by created_at desc limit 1`;
  return (row as Invitation) || null;
}

/** Shared workspace link codes: one for team members, one for guests. */
export async function setting(key: string, regenerate = false): Promise<string> {
  const sql = db();
  const fresh = crypto.randomBytes(9).toString('base64url');
  if (regenerate) await sql`insert into settings (key, value) values (${key}, ${fresh}) on conflict (key) do update set value = excluded.value`;
  else await sql`insert into settings (key, value) values (${key}, ${fresh}) on conflict (key) do nothing`;
  const [row] = await sql`select value from settings where key = ${key}`;
  return row.value;
}

/**
 * Works out which role a new account gets, or refuses the signup.
 * The very first account always becomes the owner.
 */
export async function roleForNewAccount(opts: { email: string; token?: string; code?: string }): Promise<{ role: Role; invite: Invitation | null }> {
  const sql = db();
  const [{ n }] = await sql`select count(*)::int as n from users`;
  if (n === 0) return { role: 'owner', invite: null };

  const invite = (await inviteByToken(opts.token || '')) || (await inviteForEmail(opts.email));
  if (invite) {
    if (invite.email.toLowerCase() !== opts.email.toLowerCase()) {
      throw new HttpError(403, `That invitation was sent to ${invite.email}. Sign in with that address, or ask for a new invitation.`);
    }
    return { role: (ROLES.includes(invite.role) ? invite.role : 'member') as Role, invite };
  }

  const code = (opts.code || '').trim();
  if (code && code === (await setting('invite_code'))) return { role: 'member', invite: null };
  if (code && code === (await setting('guest_invite_code'))) return { role: 'guest', invite: null };

  throw new HttpError(403, 'You need an invitation to join this workspace. Ask an admin to invite your email address.');
}

/** Marks the invitation used and puts the new person on any projects it named. */
export async function acceptInvite(invite: Invitation | null, userId: string) {
  if (!invite) return;
  const sql = db();
  await sql`update invitations set accepted_at = now(), accepted_by = ${userId} where id = ${invite.id}`;
  for (const pid of invite.project_ids || []) {
    await sql`insert into project_members (project_id, user_id) values (${pid}, ${userId}) on conflict do nothing`;
  }
}

/** Finds or creates the account behind a verified Google profile. Returns the user id. */
export async function signInWithGoogle(raw: { sub: string; email: string; name: string; picture: string }, token?: string): Promise<string> {
  const sql = db();
  const profile = { ...raw, email: String(raw.email || '').trim().toLowerCase() };
  const [byGoogle] = await sql`select id, active from users where google_id = ${profile.sub}`;
  if (byGoogle) {
    if (!byGoogle.active) throw new HttpError(403, 'This account has been deactivated');
    await sql`update users set avatar_url = ${profile.picture} where id = ${byGoogle.id}`;
    return byGoogle.id;
  }

  const [byEmail] = await sql`select id, active from users where lower(email) = ${profile.email}`;
  if (byEmail) {
    if (!byEmail.active) throw new HttpError(403, 'This account has been deactivated');
    await sql`update users set google_id = ${profile.sub}, avatar_url = ${profile.picture} where id = ${byEmail.id}`;
    return byEmail.id;
  }

  const { role, invite } = await roleForNewAccount({ email: profile.email, token });
  const [{ n }] = await sql`select count(*)::int as n from users`;
  const [user] = await sql`insert into users (name, email, google_id, avatar_url, role, color)
    values (${profile.name}, ${profile.email}, ${profile.sub}, ${profile.picture}, ${role}, ${pickColor(n)}) returning id`;
  await acceptInvite(invite, user.id);
  if (n === 0) {
    await setting('invite_code');
    await setting('guest_invite_code');
  }
  return user.id;
}
