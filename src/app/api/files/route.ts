import { NextResponse } from 'next/server';
import { db, ready } from '@/lib/db';
import { currentUser } from '@/server/auth';
import { canAccess } from '@/server/handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 4 * 1024 * 1024; // Vercel functions accept request bodies up to ~4.5 MB

export async function POST(req: Request) {
  try {
    await ready();
    const user = await currentUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Please sign in' }, { status: 401 });
    const form = await req.formData();
    const file = form.get('file');
    const projectId = String(form.get('projectId') || '');
    const taskId = String(form.get('taskId') || '') || null;
    if (!(file instanceof File) || !projectId) return NextResponse.json({ ok: false, error: 'No file received' }, { status: 400 });
    if (!/^[0-9a-f-]{36}$/i.test(projectId) || !(await canAccess(user, projectId))) return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: `"${file.name}" is larger than 4 MB. Add it as a link instead.` }, { status: 413 });
    const data = Buffer.from(await file.arrayBuffer());
    const [row] = await db()`insert into files (project_id, task_id, name, mime, size, data, uploaded_by)
      values (${projectId}, ${taskId}, ${file.name.slice(0, 200)}, ${file.type || 'application/octet-stream'}, ${file.size}, ${data}, ${user.id})
      returning id, name`;
    return NextResponse.json({ ok: true, result: row });
  } catch (e) {
    console.error('[files]', e);
    return NextResponse.json({ ok: false, error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
