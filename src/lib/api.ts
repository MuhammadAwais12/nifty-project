'use client';
import useSWR, { mutate, SWRConfiguration } from 'swr';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function rpc<T = any>(action: string, params?: any): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params }),
    });
  } catch {
    throw new ApiError(0, 'You appear to be offline. Check your connection and try again.');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new ApiError(res.status, json?.error || 'Something went wrong. Please try again.');
  return json.result as T;
}

/** Read data. Re-fetches automatically after any `act()` call. */
export function useQ<T = any>(action: string | null, params?: any, config?: SWRConfiguration) {
  return useSWR<T>(action ? [action, params ?? null] : null, ([a, p]: [string, any]) => rpc<T>(a, p), {
    revalidateOnFocus: true,
    keepPreviousData: true,
    ...config,
  });
}

export const refresh = () => mutate(() => true);

/** Write data, then refresh everything on screen. Shows a toast on failure. */
export async function act<T = any>(action: string, params?: any): Promise<T | undefined> {
  try {
    const result = await rpc<T>(action, params);
    await refresh();
    return result;
  } catch (e: any) {
    toast(e.message);
    refresh();
    return undefined;
  }
}

export function toast(message: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('tt-toast', { detail: message }));
}

export async function uploadFile(file: File, projectId: string, taskId?: string): Promise<boolean> {
  if (file.size > 4 * 1024 * 1024) {
    toast(`"${file.name}" is larger than 4 MB. Add it as a link instead.`);
    return false;
  }
  const form = new FormData();
  form.set('file', file);
  form.set('projectId', projectId);
  if (taskId) form.set('taskId', taskId);
  try {
    const res = await fetch('/api/files', { method: 'POST', body: form });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || 'Upload failed. Please try again.');
    return true;
  } catch (e: any) {
    toast(e.message);
    return false;
  }
}
