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

export function formatPhoneNumber(value: string) {
  const rawDigits = value.replace(/\D/g, '');
  const maxLength = rawDigits.startsWith('050') ? 12 : 11;
  const digits = rawDigits.slice(0, maxLength);

  if (digits.startsWith('02')) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 10) return `${digits.slice(0, 2)}-${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
  }

  if (digits.startsWith('050')) {
    if (digits.length <= 4) return digits;
    if (digits.length <= 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
  }

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

// "11/2" for an ISO time, '' when there is none.
export function shortDate(value?: string) {
  if (!value) return '';
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' }).format(time).replace(/\.\s?/g, '/').replace(/\/$/, '');
}
