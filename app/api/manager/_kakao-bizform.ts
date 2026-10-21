import { hashId, managerClient } from './_utils';
import { canUseFirestoreOnServer, findExistingFirestoreDocumentIds, saveServerRecordToFirestore, shouldUseFirestoreErp } from './firestore';

// Imports new Kakao BizForm+ responses as consultations. Called by the PC dashboard's sync (POST
// /api/integrations/kakao-bizform/sync) and by the scheduled run (POST /api/cron/kakao-bizform), so a response arrives
// even when no PC is open. Entries already imported are skipped by their id; the new records are returned for alerts.

type KakaoAnswer = {
  question?: string;
  answer?: string;
};

type KakaoBizFormResponse = {
  applyId?: number;
  submittedAt?: string;
  email?: string;
  name?: string;
  phoneNumber?: string;
  address?: string;
  answers?: KakaoAnswer[];
  channelAddStatus?: string;
  inflowSource?: string;
};

type KakaoReport = {
  code?: number;
  message?: string;
  data?: KakaoBizFormResponse[];
  hasNext?: boolean;
  nextCursor?: number;
};

const answerFor = (answers: KakaoAnswer[], keywords: string[]) => {
  const match = answers.find((item) => {
    const question = String(item.question || '').replace(/\s+/g, '').toLowerCase();
    return keywords.some((keyword) => question.includes(keyword));
  });
  return String(match?.answer || '').trim();
};

const reportUrl = (formId: string, cursorId?: number) => {
  const url = new URL('https://apis.moment.kakao.com/openapi/v4/adAccounts/bizFormPlus/report');
  url.searchParams.set('formId', formId);
  url.searchParams.set('size', '1000');
  if (cursorId) url.searchParams.set('cursorId', String(cursorId));
  return url;
};

const kakaoConsultationId = (formId: string, applyId: number) => `kakao-bizform-${hashId(`${formId}:${applyId}`)}`;

function toKakaoConsultationRecord(formId: string, entry: KakaoBizFormResponse & { applyId: number }) {
  const answers = Array.isArray(entry.answers) ? entry.answers : [];
  const answerText = answers
    .map((item) => [item.question, item.answer].filter(Boolean).join(': '))
    .filter(Boolean)
    .join('\n');
  const inflowSource = String(entry.inflowSource || '기타').trim();

  return {
    _id: kakaoConsultationId(formId, entry.applyId),
    _type: 'officeConsultation',
    name: String(entry.name || '').trim(),
    phone: String(entry.phoneNumber || '').trim(),
    address: String(entry.address || '').trim(),
    fullAddress: String(entry.address || '').trim(),
    siteType: answerFor(answers, ['공간유형', '현장종류', '주거형태', '건물유형']),
    propertyType: answerFor(answers, ['공간유형', '현장종류', '주거형태', '건물유형']),
    areaRange: answerFor(answers, ['평수', '면적']),
    homeStatus: answerFor(answers, ['거주상태', '공간상태', '현재상태']),
    reason: answerFor(answers, ['인테리어이유', '공사이유', '상담목적']),
    budget: answerFor(answers, ['예산']),
    timeline: answerFor(answers, ['희망일정', '공사일정', '시작일', '시공시기']),
    message: answerText,
    memo: [entry.email ? `이메일: ${entry.email}` : '', entry.channelAddStatus ? `채널 추가: ${entry.channelAddStatus}` : '']
      .filter(Boolean)
      .join('\n'),
    privacyAgreed: true,
    status: '신규',
    source: `카카오 비즈니스폼+ · ${inflowSource}`,
    createdAt: entry.submittedAt || new Date().toISOString(),
  };
}

export const isKakaoBizFormConfigured = () =>
  Boolean(process.env.KAKAO_BUSINESS_ACCESS_TOKEN?.trim() && process.env.KAKAO_MOMENT_AD_ACCOUNT_ID?.trim() && process.env.KAKAO_BIZFORM_PLUS_ID?.trim());

// Throws when Kakao or the store fails; nothing is half-reported (a record is returned only once it is saved).
export async function importKakaoBizForm(): Promise<{ configured: boolean; imported: Array<Record<string, unknown>> }> {
  const accessToken = process.env.KAKAO_BUSINESS_ACCESS_TOKEN?.trim();
  const adAccountId = process.env.KAKAO_MOMENT_AD_ACCOUNT_ID?.trim();
  const formId = process.env.KAKAO_BIZFORM_PLUS_ID?.trim();
  if (!accessToken || !adAccountId || !formId) return { configured: false, imported: [] };

  const responses: KakaoBizFormResponse[] = [];
  let cursorId: number | undefined;

  for (let page = 0; page < 10; page += 1) {
    const response = await fetch(reportUrl(formId, cursorId), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        adAccountId,
      },
      cache: 'no-store',
    });
    const report = (await response.json()) as KakaoReport;
    if (!response.ok || report.code !== 200) {
      throw new Error(report.message || `카카오 API 요청 실패 (${response.status})`);
    }

    responses.push(...(report.data || []));
    if (!report.hasNext || !report.nextCursor) break;
    cursorId = report.nextCursor;
  }

  const entries = responses.filter((entry): entry is KakaoBizFormResponse & { applyId: number } => Boolean(entry.applyId));
  if (shouldUseFirestoreErp() && canUseFirestoreOnServer()) {
    // One batch read finds the entries already imported, instead of one read per entry on every sync.
    const existingIds = await findExistingFirestoreDocumentIds(
      'officeConsultations',
      entries.map((entry) => kakaoConsultationId(formId, entry.applyId)),
    );
    const imported: Array<Record<string, unknown>> = [];
    for (const entry of entries) {
      const id = kakaoConsultationId(formId, entry.applyId);
      if (existingIds.has(id)) continue;
      const record = toKakaoConsultationRecord(formId, entry);
      await saveServerRecordToFirestore('officeConsultations', record, id);
      imported.push(record);
    }
    return { configured: true, imported };
  }

  const entryIds = entries.map((entry) => kakaoConsultationId(formId, entry.applyId));
  const existingIds = entryIds.length ? await managerClient.fetch<string[]>('*[_id in $ids]._id', { ids: entryIds }) : [];
  const existingIdSet = new Set(existingIds);
  const imported = entries
    .filter((entry) => !existingIdSet.has(kakaoConsultationId(formId, entry.applyId)))
    .map((entry) => toKakaoConsultationRecord(formId, entry));
  const transaction = managerClient.transaction();
  imported.forEach((record) => transaction.createIfNotExists(record));
  if (imported.length > 0) await transaction.commit();
  return { configured: true, imported };
}
