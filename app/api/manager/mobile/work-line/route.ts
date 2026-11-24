import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  newPhoneWorkLine,
  normalizeWorkLines,
  parsePhoneWorkLine,
  pickWorkLineTarget,
  workLineProcesses,
  workLineTotals,
  type WorkLineInput,
} from '../../../../lib/estimate-work-lines';
import { isOfficeRecordId } from '../../../../lib/mobile-overview';
import { MOBILE_STORE_MISSING } from '../../_mobile-devices';
import { isProgressStoreReady } from '../../_progress-store';
import { requireManager } from '../../_session';
import {
  getFirestoreDocument,
  getFirestoreDocumentWithVersion,
  isFirestoreConflictError,
  officeFirestoreCollections,
  patchFirestoreFields,
  queryFirestoreCollectionByField,
} from '../../firestore';

export const runtime = 'nodejs';

// 폰 실행내역서 직접 등록 (spec docs/superpowers/specs/2026-11-24-phone-work-lines-design.md). Anyone who sees sites may add
// one line to the site's 실행내역서 (the newest 최종안, else the newest version). The phone gets the 공종 names only, never
// amounts. The line is added with a conditional write (tried again when another write got there first), the stored 실행
// totals are recomputed, and updatedAt is left alone so an office editor's next save does not conflict; that save keeps
// the line (app/lib/estimate-work-lines.ts unseenPhoneLines).
const ESTIMATES = 'siteEstimates';
const NO_ESTIMATE = '이 현장은 견적이 없어 실행내역서에 바로 넣을 수 없어요. 영수증 첨부로 남겨 주세요.';
const SAVE_FAILED = '실행내역서에 넣지 못했어요. 잠시 후 다시 시도해 주세요.';
const ATTEMPTS = 3;

type Row = Record<string, unknown>;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (error: string, status: number) => json({ error }, status);
const str = (value: unknown) => (typeof value === 'string' ? value : '');

async function liveSite(siteId: string): Promise<boolean> {
  const site = await getFirestoreDocument<Row>(officeFirestoreCollections.site, siteId);
  return Boolean(site && !site.deletedAt);
}

async function targetOf(siteId: string): Promise<Row | null> {
  return pickWorkLineTarget(await queryFirestoreCollectionByField<Row>(ESTIMATES, 'siteId', siteId));
}

const labelOf = (estimate: Row) => str(estimate.versionLabel) || '견적';

export async function GET(request: Request) {
  const access = requireManager(request, { anyOf: ['sites'] });
  if (access.error) return access.error;
  if (!isProgressStoreReady()) return fail(MOBILE_STORE_MISSING, 503);

  const siteId = new URL(request.url).searchParams.get('siteId');
  if (!isOfficeRecordId(siteId)) return fail('현장을 골라 주세요.', 400);
  try {
    if (!(await liveSite(siteId))) return fail('현장을 찾을 수 없어요.', 404);
    const target = await targetOf(siteId);
    if (!target) return json({ target: null, processes: [] });
    return json({ target: { id: String(target._id), label: labelOf(target) }, processes: workLineProcesses(target.linesJson, target.workLinesJson) });
  } catch (error) {
    console.error('Phone work line target failed:', error);
    return fail('실행내역서를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.', 500);
  }
}

export async function POST(request: Request) {
  const access = requireManager(request, { anyOf: ['sites'] });
  if (access.error) return access.error;
  if (!isProgressStoreReady()) return fail(MOBILE_STORE_MISSING, 503);

  const parsed = parsePhoneWorkLine(await request.json().catch(() => null));
  if (!parsed.ok) return fail(parsed.error, 400);
  const { session } = access;
  const input = parsed.value;

  try {
    if (!(await liveSite(input.siteId))) return fail('현장을 찾을 수 없어요.', 404);
    const line = newPhoneWorkLine(input, { name: session.name, loginId: session.loginId }, new Date().toISOString(), randomBytes(12).toString('hex'));
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      const target = await targetOf(input.siteId);
      if (!target) return fail(NO_ESTIMATE, 409);
      const id = String(target._id);
      const current = await getFirestoreDocumentWithVersion<Row>(ESTIMATES, id);
      if (!current || current.record.deletedAt) continue;
      const stored = (() => {
        try {
          const parsedLines = JSON.parse(str(current.record.workLinesJson) || '[]');
          return Array.isArray(parsedLines) ? (parsedLines as WorkLineInput[]) : [];
        } catch {
          return [];
        }
      })();
      const workLines = [...normalizeWorkLines(stored), line];
      const totals = workLineTotals(workLines, {
        customerEstimateTotal: Number(current.record.customerEstimateTotal) || 0,
        additionalCostTotal: Number(current.record.additionalCostTotal) || 0,
      });
      try {
        await patchFirestoreFields(ESTIMATES, id, { workLinesJson: JSON.stringify(workLines), ...totals }, { precondition: { updateTime: current.updateTime } });
        return json({ line, target: { id, label: labelOf(current.record) } });
      } catch (error) {
        if (!isFirestoreConflictError(error) || attempt === ATTEMPTS) throw error;
      }
    }
    return fail(SAVE_FAILED, 409);
  } catch (error) {
    console.error('Phone work line save failed:', error);
    return fail(SAVE_FAILED, 500);
  }
}
