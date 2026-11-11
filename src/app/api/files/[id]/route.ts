import { NextResponse } from 'next/server';
import { db, ready } from '@/lib/db';
import { currentUser } from '@/server/auth';
import { canAccess } from '@/server/handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ready();
    const user = await currentUser();
    if (!user) return new NextResponse('Please sign in', { status: 401 });
    const { id } = await params;
    const [file] = await db()`select name, mime, data, project_id from files where id = ${id} and data is not null`;
    if (!file || !(await canAccess(user, file.project_id))) return new NextResponse('File not found', { status: 404 });
    const inline = /^(image\/(png|jpeg|gif|webp)|application\/pdf)$/.test(file.mime);
    return new NextResponse(file.data, {
      headers: {
        'Content-Type': inline ? file.mime : 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return new NextResponse('File not found', { status: 404 });
  }
}
