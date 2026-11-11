import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export const googleEnabled = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/** The public origin of this deployment, used to build the OAuth redirect URI. */
export function originOf(req: Request): string {
  const configured = process.env.AUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, '');
  const h = req.headers;
  const host = h.get('x-forwarded-host') || h.get('host');
  if (host) return `${h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')}://${host}`;
  return new URL(req.url).origin;
}

export const redirectUri = (req: Request) => `${originOf(req)}/api/auth/google/callback`;

export function authorizeUrl(req: Request, state: string): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID!);
  u.searchParams.set('redirect_uri', redirectUri(req));
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('state', state);
  u.searchParams.set('prompt', 'select_account');
  return u.toString();
}

export type GoogleProfile = { sub: string; email: string; name: string; picture: string; emailVerified: boolean };

/** Swap the one-time code for an ID token and verify it against Google's keys. */
export async function exchange(req: Request, code: string): Promise<GoogleProfile> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(req),
      grant_type: 'authorization_code',
    }),
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok || !json?.id_token) throw new Error(json?.error_description || json?.error || 'Google did not return a token');
  const { payload } = await jwtVerify(json.id_token, JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: process.env.GOOGLE_CLIENT_ID!,
  });
  const email = String(payload.email || '').toLowerCase();
  if (!email) throw new Error('Google did not share an email address');
  return {
    sub: String(payload.sub),
    email,
    name: String(payload.name || email.split('@')[0]),
    picture: String(payload.picture || ''),
    emailVerified: payload.email_verified !== false,
  };
}
