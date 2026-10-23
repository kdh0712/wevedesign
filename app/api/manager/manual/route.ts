import { handleManualRequest, readManualFile } from '../_manual.ts';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return handleManualRequest(request, readManualFile);
}
