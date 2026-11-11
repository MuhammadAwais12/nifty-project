import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { db } from '@/lib/db';

export const COOKIE = 'tt_session';

/** Only mark cookies Secure when the request really is https, so http://localhost still works. */
export function secureCookie(req?: Request): boolean {
  if (!req) return process.env.NODE_ENV === 'production';
  const proto = req.headers.get('x-forwarded-proto');
  if (proto) return proto.split(',')[0].trim() === 'https';
  try { return new URL(req.url).protocol === 'https:'; } catch { return true; }
}

/** The cookie options used for both the session and the short-lived OAuth state. */
export const cookieOptions = (req: Request | undefined, maxAge: number) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: secureCookie(req),
  path: '/',
  maxAge,
});
export const MAX_AGE = 60 * 60 * 24 * 30;
const g = globalThis as any;

async function secret(): Promise<Uint8Array> {
  if (!g.__tt_secret) {
    let s = process.env.AUTH_SECRET;
    if (!s) {
      const sql = db();
      await sql`insert into settings (key, value) values ('auth_secret', ${crypto.randomBytes(32).toString('hex')}) on conflict (key) do nothing`;
      const [row] = await sql`select value from settings where key = 'auth_secret'`;
      s = row.value as string;
    }
    g.__tt_secret = new TextEncoder().encode(s);
  }
  return g.__tt_secret;
}

export async function signSession(uid: string): Promise<string> {
  return new SignJWT({ uid })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(await secret());
}

import type { Role } from './roles';

export type User = { id: string; name: string; email: string; role: Role; color: string; avatar_url: string; active: boolean };

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await secret());
    const [user] = await db()`select id, name, email, role, color, avatar_url, active from users where id = ${payload.uid as string} and active`;
    return (user as User) || null;
  } catch {
    return null;
  }
}
