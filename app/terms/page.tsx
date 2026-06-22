import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '이용약관 | 위브디자인',
  description: '위브디자인 홈페이지와 인테리어 상담 서비스 이용 기준입니다.',
};

const sections = [
  ['서비스 목적', '본 홈페이지는 위브디자인의 포트폴리오, 시공 방식, 회사 정보와 인테리어 상담 신청 기능을 제공합니다.'],
  ['상담 신청', '사용자는 정확한 정보를 입력해야 하며, 접수된 상담은 현장 조건과 일정 확인 후 담당자가 별도로 안내합니다.'],
  ['견적과 계약', '홈페이지의 일반적인 안내는 확정 견적이나 계약을 의미하지 않습니다. 공사 범위, 자재, 일정과 금액은 별도 계약서에 따릅니다.'],
  ['콘텐츠 이용', '홈페이지의 사진, 글, 로고 등은 위브디자인 또는 정당한 권리자에게 권리가 있으며 사전 동의 없이 상업적으로 사용할 수 없습니다.'],
  ['책임 범위', '외부 서비스 장애, 사용자의 잘못된 정보 입력 등 회사가 통제하기 어려운 사유로 발생한 손해에 대해서는 관련 법령의 범위에서 책임이 제한될 수 있습니다.'],
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#fffdf8] px-5 py-16 text-[#171512] md:px-8 md:py-24">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#8f6f43]">WEVE DESIGN</p>
        <h1 className="mt-3 text-4xl font-semibold md:text-5xl">이용약관</h1>
        <p className="mt-5 leading-7 text-[#625d54]">위브디자인 홈페이지와 상담 서비스를 이용할 때 적용되는 기본 기준입니다.</p>
        <div className="mt-10 grid gap-4">
          {sections.map(([title, body]) => (
            <section key={title} className="border border-[#eadfcd] bg-white p-5 md:p-6">
              <h2 className="text-xl font-semibold">{title}</h2>
              <p className="mt-3 leading-7 text-[#625d54]">{body}</p>
            </section>
          ))}
        </div>
        <p className="mt-8 border-t border-[#eadfcd] pt-6 text-sm text-[#625d54]">시행일: 2026년 6월 22일</p>
        <Link href="/" className="mt-8 inline-flex rounded-md bg-[#171512] px-5 py-3 font-semibold text-white">홈으로 돌아가기</Link>
      </div>
    </main>
  );
}
