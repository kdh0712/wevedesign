// Small pieces shared by the manager page and the 고객·현장 tab.
import type { ReactNode } from 'react';

export const SITE_STATUSES = ['상담중', '상담완료', '실측 예정', '견적', '계약', '시공중', '완료', '보류'];

export const SITE_TYPES = ['아파트', '주택', '상가', '오피스', '기타'];

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[#d5dde2] bg-white p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <span className="h-2 w-2 rounded-full bg-[#38bcd4]" />
        {title}
      </h2>
      {children}
    </section>
  );
}

// '상담완료' is checked before '완료' so a finished consultation does not look like a finished site.
export function statusBadgeClass(status: string) {
  if (status.includes('상담완료')) return 'bg-[#eef6ff] text-[#286da8]';
  if (status.includes('완료')) return 'bg-[#e8f5ed] text-[#277a46]';
  if (status.includes('계약')) return 'bg-[#edf8fb] text-[#14798a]';
  if (status.includes('견적')) return 'bg-[#fff3d6] text-[#8a6215]';
  if (status.includes('시공')) return 'bg-[#efeafa] text-[#6341a3]';
  if (status.includes('보류')) return 'bg-[#f1f3f5] text-[#5f6b73]';
  if (status.includes('신규')) return 'bg-[#fcecec] text-[#b24a4a]';
  return 'bg-[#eef6ff] text-[#286da8]';
}

// Shared with Node tests (app/lib/office-format.ts).
export { formatPhoneNumber, shortDate } from '../lib/office-format';
