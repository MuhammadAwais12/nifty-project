import { NextResponse } from 'next/server';
import { ready, HttpError } from '@/lib/db';
import { COOKIE, MAX_AGE, currentUser, signSession, cookieOptions } from '@/server/auth';
import { handlers } from '@/server/handlers';
import { allowed, forbiddenMessage } from '@/server/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    await ready();
    const { action, params } = await req.json();
    const handler = handlers[action];
    if (!handler) throw new HttpError(404, 'Unknown action');
    const user = await currentUser();
    const verdict = allowed(action, user?.role ?? null);
    if (verdict === 'signin') throw new HttpError(401, 'Please sign in');
    if (verdict === 'forbidden') throw new HttpError(403, user ? forbiddenMessage(user.role) : 'Not allowed');
    const ctx: any = { user };
    const result = await handler(params || {}, ctx);
    const res = NextResponse.json({ ok: true, result: result ?? null });
    if (ctx.session) {
      res.cookies.set(COOKIE, await signSession(ctx.session), cookieOptions(req, MAX_AGE));
    } else if (ctx.session === null) {
      res.cookies.delete(COOKIE);
    }
    return res;
  } catch (e: any) {
    if (e instanceof HttpError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e?.code === '22P02') return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
    console.error('[rpc]', e);
    const dbDown = ['ECONNREFUSED', 'ENOTFOUND', 'CONNECT_TIMEOUT', '28P01', '3D000'].includes(e?.code);
    return NextResponse.json(
      { ok: false, error: dbDown ? 'Could not reach the database. Check DATABASE_URL in your Vercel project settings.' : 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
