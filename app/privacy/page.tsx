import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '개인정보처리방침 | 위브디자인',
  description: '위브디자인 홈페이지와 인테리어 상담 서비스의 개인정보 처리 기준입니다.',
};

const sections = [
  ['수집하는 개인정보', '상담 신청 시 이름, 연락처, 시공 주소, 공간 정보, 예산, 일정, 요청사항을 수집합니다.'],
  ['이용 목적', '인테리어 상담, 현장 확인, 견적 안내, 계약 및 시공 관리, 문의 응대를 위해 사용합니다.'],
  ['보유 기간', '상담 완료 후 1년 또는 정보주체의 삭제 요청 시까지 보유하며, 관련 법령에 별도 보존 의무가 있는 경우 해당 기간을 따릅니다.'],
  ['제3자 제공', '법령에 근거가 있거나 고객이 별도로 동의한 경우를 제외하고 개인정보를 외부에 제공하지 않습니다.'],
  ['처리 위탁', '홈페이지 운영과 상담 접수를 위해 Vercel, Sanity, Resend 등 필요한 서비스가 사용될 수 있으며 최소한의 정보만 처리합니다.'],
  ['정보주체의 권리', '개인정보 열람, 정정, 삭제, 처리정지를 요청할 수 있습니다. 요청은 대표 연락처를 통해 접수합니다.'],
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#fffdf8] px-5 py-16 text-[#171512] md:px-8 md:py-24">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#8f6f43]">WEVE DESIGN</p>
        <h1 className="mt-3 text-4xl font-semibold md:text-5xl">개인정보처리방침</h1>
        <p className="mt-5 leading-7 text-[#625d54]">위브디자인은 상담 과정에서 필요한 개인정보를 안전하게 처리합니다.</p>
        <div className="mt-10 grid gap-4">
          {sections.map(([title, body]) => (
            <section key={title} className="border border-[#eadfcd] bg-white p-5 md:p-6">
              <h2 className="text-xl font-semibold">{title}</h2>
              <p className="mt-3 leading-7 text-[#625d54]">{body}</p>
            </section>
          ))}
        </div>
        <div className="mt-8 border-t border-[#eadfcd] pt-6 text-sm leading-7 text-[#625d54]">
          <p>개인정보 보호책임자: 대표 김현종</p>
          <p>연락처: 031-381-0489</p>
          <p>시행일: 2026년 6월 22일</p>
        </div>
        <Link href="/" className="mt-8 inline-flex rounded-md bg-[#171512] px-5 py-3 font-semibold text-white">홈으로 돌아가기</Link>
      </div>
    </main>
  );
}
