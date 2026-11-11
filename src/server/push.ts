import webpush from 'web-push';
import { db } from '@/lib/db';

const g = globalThis as any;

export const pushEnabled = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
export const publicKey = () => process.env.VAPID_PUBLIC_KEY || '';

function configure(): boolean {
  if (!pushEnabled()) return false;
  if (!g.__tt_vapid) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
    g.__tt_vapid = true;
  }
  return true;
}

export type PushPayload = { title: string; body: string; url: string; tag?: string };

/**
 * Sends a notification to every device a person has registered.
 * Does nothing when VAPID keys are not configured, and quietly drops
 * subscriptions the browser has thrown away.
 */
export async function sendPush(userId: string, payload: PushPayload) {
  if (!configure()) return;
  const sql = db();
  const rows = await sql`select id, endpoint, p256dh, auth from push_subscriptions where user_id = ${userId}`;
  await Promise.all(
    rows.map(async (row: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 }
        );
      } catch (e: any) {
        // 404 / 410 mean the browser dropped this subscription for good
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await sql`delete from push_subscriptions where id = ${row.id}`;
        } else {
          console.error('[push]', e?.statusCode || e?.message || e);
        }
      }
    })
  );
}
