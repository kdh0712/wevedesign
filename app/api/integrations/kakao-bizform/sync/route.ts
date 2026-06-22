import { NextResponse } from 'next/server';
import { assertManager, hashId, managerClient } from '../../../manager/_utils';

export const runtime = 'nodejs';

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

export async function POST(request: Request) {
  const authError = assertManager(request);
  if (authError) return authError;

  const accessToken = process.env.KAKAO_BUSINESS_ACCESS_TOKEN?.trim();
  const adAccountId = process.env.KAKAO_MOMENT_AD_ACCOUNT_ID?.trim();
  const formId = process.env.KAKAO_BIZFORM_PLUS_ID?.trim();
  if (!accessToken || !adAccountId || !formId) {
    return NextResponse.json({ configured: false, imported: 0 });
  }

  try {
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
    const entryIds = entries.map((entry) => `kakao-bizform-${hashId(`${formId}:${entry.applyId}`)}`);
    const existingIds = entryIds.length
      ? await managerClient.fetch<string[]>('*[_id in $ids]._id', { ids: entryIds })
      : [];
    const existingIdSet = new Set(existingIds);
    const newEntries = entries.filter((entry) => !existingIdSet.has(`kakao-bizform-${hashId(`${formId}:${entry.applyId}`)}`));
    const transaction = managerClient.transaction();

    newEntries.forEach((entry) => {
      const answers = Array.isArray(entry.answers) ? entry.answers : [];
      const answerText = answers
        .map((item) => [item.question, item.answer].filter(Boolean).join(': '))
        .filter(Boolean)
        .join('\n');
      const inflowSource = String(entry.inflowSource || '기타').trim();

      transaction.createIfNotExists({
        _id: `kakao-bizform-${hashId(`${formId}:${entry.applyId}`)}`,
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
      });
    });

    if (newEntries.length > 0) await transaction.commit();
    return NextResponse.json({ configured: true, imported: newEntries.length, checkedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json(
      { configured: true, error: error instanceof Error ? error.message : '카카오 비즈니스폼+ 동기화에 실패했습니다.' },
      { status: 502 },
    );
  }
}
