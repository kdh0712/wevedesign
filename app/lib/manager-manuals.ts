// The staff PDF manuals (spec 2026-10-23). Shared by the download route and the download buttons, so it must stay free of
// Node-only imports. The PDFs themselves are made by `npm run manuals` and live in manuals/ (outside public/).
import type { ManagerPermission } from './manager-permissions.ts';

export type ManualBook = 'office' | 'estimate';

export const MANAGER_MANUALS: Record<
  ManualBook,
  { file: string; downloadName: string; asciiName: string; anyOf?: readonly ManagerPermission[] }
> = {
  // Anyone who can log in to the manager may read how it works.
  office: { file: 'office.pdf', downloadName: 'WEVE 통합 매니저 사용 설명서.pdf', asciiName: 'weve-office-manual.pdf' },
  estimate: {
    file: 'estimate.pdf',
    downloadName: 'WEVE 견적 작업 사용 설명서.pdf',
    asciiName: 'weve-estimate-manual.pdf',
    anyOf: ['estimates'],
  },
};

export function isManualBook(value: unknown): value is ManualBook {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MANAGER_MANUALS, value);
}

// filename= is the ASCII fallback; browsers that read filename* use the Korean name.
export function manualContentDisposition(book: ManualBook): string {
  const manual = MANAGER_MANUALS[book];
  return `attachment; filename="${manual.asciiName}"; filename*=UTF-8''${encodeURIComponent(manual.downloadName)}`;
}

export function manualDownloadErrorMessage(status: number): string {
  if (status === 401) return '로그인이 끝났습니다. 다시 로그인해 주세요.';
  if (status === 403) return '이 설명서를 받을 권한이 없습니다.';
  return '설명서를 내려받지 못했습니다. 잠시 후 다시 시도해 주세요.';
}
