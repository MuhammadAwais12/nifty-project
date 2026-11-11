import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { googleEnabled, authorizeUrl, originOf } from '@/server/google';
import { cookieOptions } from '@/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const origin = originOf(req);
  if (!googleEnabled()) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('Google sign-in is not configured for this workspace.')}`);
  }
  const invite = new URL(req.url).searchParams.get('invite') || '';
  const state = crypto.randomBytes(16).toString('base64url');
  const res = NextResponse.redirect(authorizeUrl(req, state));
  res.cookies.set('tt_oauth', JSON.stringify({ state, invite }), cookieOptions(req, 600));
  return res;
}
