import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MANAGER_MANUALS, isManualBook, manualContentDisposition } from '../../lib/manager-manuals.ts';
import { requireManager } from './_session.ts';

const json = (error: string, status: number) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

// GET /api/manager/manual?book=office|estimate (spec 2026-10-23 §5). The PDFs hold made-up data only, but they show how
// the manager works, so they are handed out after the session check, never from public/.
export async function handleManualRequest(
  request: Request,
  readManual: (file: string) => Promise<Uint8Array | null>,
): Promise<Response> {
  const book = new URL(request.url).searchParams.get('book');
  if (!isManualBook(book)) return json('알 수 없는 설명서입니다.', 400);

  const manual = MANAGER_MANUALS[book];
  const access = requireManager(request, manual.anyOf ? { anyOf: manual.anyOf } : {});
  if (access.error) return access.error;

  const bytes = await readManual(manual.file);
  if (!bytes) return json('설명서 파일이 없습니다. 관리자에게 문의해 주세요.', 404);

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': manualContentDisposition(book),
      'Cache-Control': 'private, no-store',
    },
  });
}

// next.config.ts lists manuals/*.pdf in outputFileTracingIncludes so the deployed function has them.
export async function readManualFile(file: string): Promise<Uint8Array | null> {
  try {
    return await readFile(path.join(process.cwd(), 'manuals', file));
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw caught;
  }
}
