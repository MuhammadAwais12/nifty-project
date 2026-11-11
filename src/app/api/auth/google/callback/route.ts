import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ready, HttpError } from '@/lib/db';
import { COOKIE, MAX_AGE, signSession, cookieOptions } from '@/server/auth';
import { exchange, googleEnabled, originOf } from '@/server/google';
import { signInWithGoogle } from '@/server/account';
import { seedWelcomeProject } from '@/server/seed';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const origin = originOf(req);
  const fail = (message: string) => NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);
  try {
    if (!googleEnabled()) return fail('Google sign-in is not configured for this workspace.');
    const url = new URL(req.url);
    if (url.searchParams.get('error')) return fail('Google sign-in was cancelled.');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const jar = await cookies();
    const raw = jar.get('tt_oauth')?.value;
    if (!code || !raw) return fail('That sign-in link expired. Please try again.');
    const saved = JSON.parse(raw) as { state: string; invite?: string };
    if (!state || state !== saved.state) return fail('That sign-in link expired. Please try again.');

    await ready();
    const [{ n }] = await db()`select count(*)::int as n from users`;
    const profile = await exchange(req, code);
    const userId = await signInWithGoogle(profile, saved.invite);
    if (n === 0) {
      const [u] = await db()`select id, name, email, role, color, avatar_url, active from users where id = ${userId}`;
      await seedWelcomeProject(u as any);
    }

    const res = NextResponse.redirect(`${origin}/`);
    res.cookies.set(COOKIE, await signSession(userId), cookieOptions(req, MAX_AGE));
    res.cookies.delete('tt_oauth');
    return res;
  } catch (e: any) {
    if (e instanceof HttpError) return fail(e.message);
    console.error('[google]', e);
    return fail('Google sign-in failed. Please try again or use your email and password.');
  }
}
