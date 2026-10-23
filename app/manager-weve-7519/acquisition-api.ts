// The manager's client for /api/manager/acquisition (유입 경로): the option list and a site's answer. Errors reach staff
// with the server's own message, through errorText like the progress screens.
import type { AcquisitionOption, SiteAcquisition } from '../lib/acquisition.ts';
import { ProgressRequestError, fetchOrNetworkError } from './progress-manager.ts';

export function createAcquisitionApi(authHeaders: () => Record<string, string>) {
  async function call<T>(init: RequestInit | undefined, fallback: string): Promise<T> {
    const response = await fetchOrNetworkError('/api/manager/acquisition', {
      ...init,
      headers: { ...authHeaders(), ...((init?.headers as Record<string, string> | undefined) ?? {}) },
    });
    const data = (await response.json().catch(() => ({}))) as { error?: unknown };
    if (!response.ok) {
      const message = typeof data.error === 'string' && data.error ? data.error : `${fallback} (HTTP ${response.status})`;
      throw new ProgressRequestError(message, response.status);
    }
    return data as T;
  }

  const post = <T>(body: Record<string, unknown>, fallback: string) =>
    call<T>({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, fallback);

  return {
    load: () => call<{ options: AcquisitionOption[]; updateTime: string }>(undefined, '유입 경로 보기를 불러오지 못했습니다.'),
    setSite: async (siteId: string, choice: { optionId: string; other?: string }) =>
      (await post<{ acquisition: SiteAcquisition }>({ action: 'setSite', siteId, ...choice }, '유입 경로를 저장하지 못했습니다.')).acquisition,
    clearSite: async (siteId: string) => {
      await post<{ acquisition: null }>({ action: 'clearSite', siteId }, '유입 경로를 지우지 못했습니다.');
    },
    saveOptions: (options: AcquisitionOption[], baseUpdateTime: string) =>
      post<{ options: AcquisitionOption[]; updateTime: string }>({ action: 'saveOptions', options, baseUpdateTime }, '보기 목록을 저장하지 못했습니다.'),
  };
}

export type AcquisitionApi = ReturnType<typeof createAcquisitionApi>;
