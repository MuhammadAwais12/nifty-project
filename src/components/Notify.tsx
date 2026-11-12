'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BellOff, BellRing, Check } from 'lucide-react';
import { rpc, toast, useQ } from '@/lib/api';

type Permission = 'default' | 'granted' | 'denied' | 'unsupported';

const supported = () => typeof window !== 'undefined' && 'Notification' in window;

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Desktop notifications.
 *
 * While the tab is open, new items on the bell are shown straight away.
 * If the workspace has VAPID keys set, the browser also subscribes for
 * push, so notifications still arrive once the tab is closed.
 */
export function useNotifications() {
  const router = useRouter();
  const [permission, setPermission] = useState<Permission>('default');
  const [busy, setBusy] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const { data: config } = useQ<any>('push.config');
  const on = permission === 'granted';

  useEffect(() => {
    setPermission(supported() ? (Notification.permission as Permission) : 'unsupported');
  }, []);

  // poll the bell so we can raise a notification the moment something lands
  const { data: list } = useQ<any[]>(on ? 'notif.list' : null, undefined, { refreshInterval: 10000 });

  useEffect(() => {
    if (!on || !list) return;
    if (seen.current === null) {
      // first load after turning them on: treat everything as already seen
      seen.current = new Set(list.map((n) => n.id));
      return;
    }
    const fresh = list.filter((n) => !seen.current!.has(n.id) && !n.read).reverse();
    for (const n of fresh) {
      seen.current.add(n.id);
      try {
        const who = n.actor_name || 'Someone';
        const note = new Notification(`${who} — Teqnite Tasks`, {
          body: `${who} ${n.text}`,
          tag: n.id,
          icon: '/icon-192.png',
        });
        note.onclick = () => {
          window.focus();
          router.push(n.link || (n.task_id ? `/tasks/${n.task_id}` : '/'));
          note.close();
        };
      } catch {
        /* some browsers refuse constructed notifications; the bell still shows it */
      }
    }
    for (const n of list) seen.current.add(n.id);
  }, [list, on, router]);

  /** Registers the service worker and stores the push subscription. */
  const subscribe = useCallback(async () => {
    if (!config?.enabled || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub = existing || (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      }));
      await rpc('push.subscribe', { subscription: sub.toJSON(), userAgent: navigator.userAgent });
    } catch (e: any) {
      console.warn('[push]', e?.message || e);
    }
  }, [config]);

  useEffect(() => {
    if (on) void subscribe();
  }, [on, subscribe]);

  const enable = useCallback(async () => {
    if (!supported()) {
      toast('This browser cannot show desktop notifications.');
      return;
    }
    setBusy(true);
    const result = await Notification.requestPermission();
    setPermission(result as Permission);
    setBusy(false);
    if (result === 'granted') {
      seen.current = null;
      await subscribe();
      toast('Desktop notifications are on for this device.');
    } else if (result === 'denied') {
      toast('Your browser blocked notifications. Turn them back on in the site settings.');
    }
  }, [subscribe]);

  const disable = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker?.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await rpc('push.unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe();
      } else {
        await rpc('push.unsubscribe', {}).catch(() => {});
      }
    } catch {
      /* nothing registered */
    }
    toast('This device will stop receiving notifications. Your browser still remembers the permission.');
  }, []);

  return { permission, enable, disable, busy, pushReady: !!config?.enabled, devices: config?.devices ?? 0 };
}

/** The row shown at the top of the bell panel until notifications are on. */
export function NotificationPrompt({ n }: { n: ReturnType<typeof useNotifications> }) {
  if (n.permission === 'granted') return null;
  if (n.permission === 'unsupported') return null;
  if (n.permission === 'denied') {
    return (
      <div className="flex items-start gap-2 border-b border-line bg-paper px-4 py-2.5 text-xs text-fg/60">
        <BellOff size={14} className="mt-0.5 shrink-0" />
        <p>Your browser is blocking notifications for this site. Allow them in the padlock menu next to the address bar.</p>
      </div>
    );
  }
  return (
    <button onClick={n.enable} disabled={n.busy} className="flex w-full items-center gap-2 border-b border-line bg-ember/10 px-4 py-2.5 text-left text-xs font-semibold text-ember hover:bg-ember/15">
      <BellRing size={14} className="shrink-0" />
      <span className="flex-1">Get notified on this device when someone mentions, messages or assigns you.</span>
      <span className="shrink-0 rounded-md bg-ember px-2 py-1 text-[11px] text-white">{n.busy ? 'Asking…' : 'Turn on'}</span>
    </button>
  );
}

/** The control inside Your profile. */
export function NotificationSetting({ n }: { n: ReturnType<typeof useNotifications> }) {
  return (
    <div className="border-t border-line pt-4">
      <p className="mb-1 text-sm font-bold">Desktop notifications</p>
      {n.permission === 'unsupported' ? (
        <p className="text-xs text-fg/50">This browser cannot show desktop notifications.</p>
      ) : n.permission === 'granted' ? (
        <>
          <p className="flex items-center gap-1.5 text-xs text-emerald-600"><Check size={13} /> On for this device{n.devices > 1 ? ` and ${n.devices - 1} other` : ''}.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn-outline py-1 text-xs" onClick={() => rpc('push.test').then(() => toast('Test notification sent'), (e) => toast(e.message))} disabled={!n.pushReady}>
              <Bell size={13} /> Send a test
            </button>
            <button type="button" className="btn-ghost py-1 text-xs" onClick={n.disable}><BellOff size={13} /> Turn off on this device</button>
          </div>
          {!n.pushReady && <p className="mt-1.5 text-xs text-fg/45">Notifications show while Teqnite Tasks is open in a tab. To receive them with the tab closed, add VAPID keys to the deployment.</p>}
        </>
      ) : n.permission === 'denied' ? (
        <p className="text-xs text-fg/50">Your browser is blocking notifications for this site. Allow them in the padlock menu next to the address bar, then reload.</p>
      ) : (
        <>
          <p className="text-xs text-fg/55">Be told when someone mentions you, messages you, comments on your task or assigns you something.</p>
          <button type="button" className="btn-primary mt-2 py-1 text-xs" onClick={n.enable} disabled={n.busy}><BellRing size={13} /> {n.busy ? 'Asking…' : 'Turn on'}</button>
        </>
      )}
    </div>
  );
}
