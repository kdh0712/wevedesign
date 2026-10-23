'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  clusterTemplateLinesByName,
  groupColor,
  groupTemplateLines,
  namedTemplateLines,
  templateNameRowSpans,
  type TemplateGroup,
  type TemplateLine,
} from '../../lib/estimate-templates';

// The live 세부내역서 beside the template editor and the site estimate: grouped by 공사 like the estimate documents, lines
// without a 품명 left out as there. 공사 colors match the editor's (screen only; printing stays grey). 실행 금액 보기
// adds execution amounts and margins for internal checks; 크게 보기 shows the same document at full size.

const won = (value: number) => Math.round(value).toLocaleString('ko-KR');
const marginText = (customer: number, execution: number) =>
  `마진 ${won(customer - execution)}원${customer ? ` (${(((customer - execution) / customer) * 100).toFixed(1)}%)` : ''}`;

type PreviewProps = { title: string; subtitle?: string; lines: TemplateLine[]; onCollapse: () => void };

export function TemplateDocumentPreview({ title, subtitle, lines, onCollapse }: PreviewProps) {
  const [showExecution, setShowExecution] = useState(false);
  const [isLarge, setIsLarge] = useState(false);

  useEffect(() => {
    if (!isLarge) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsLarge(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [isLarge]);

  // Colors follow the 공사 order of every line, as in the editor, even when a 공사 has lines without a 품명 yet.
  const colorIndex = new Map(groupTemplateLines(lines).map((group, index) => [group.label, index]));
  const groups = groupTemplateLines(namedTemplateLines(lines));
  const executionButton = (
    <button type="button" onClick={() => setShowExecution((current) => !current)} className="rounded-md border border-[#d5dde2] bg-white px-2 py-1 text-xs font-semibold">
      {showExecution ? '고객용으로 보기' : '실행 금액 보기'}
    </button>
  );
  const body = (large: boolean) => (
    <DocumentBody title={title} subtitle={subtitle} groups={groups} colorIndex={colorIndex} showExecution={showExecution} large={large} />
  );

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-sm">세부내역서 미리보기</b>
        <div className="flex gap-1.5">
          {executionButton}
          <button type="button" onClick={() => setIsLarge(true)} className="rounded-md bg-[#171512] px-2 py-1 text-xs font-semibold text-white">크게 보기</button>
          <button type="button" onClick={onCollapse} className="rounded-md border border-[#d5dde2] bg-white px-2 py-1 text-xs font-semibold">미리보기 접기</button>
        </div>
      </div>
      {body(false)}
      {/* Drawn on document.body: inside the sticky preview column it would sit under the page header. */}
      {isLarge &&
        createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="세부내역서 크게 보기"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsLarge(false);
          }}
          className="no-print fixed inset-0 z-[80] flex items-start justify-center overflow-auto bg-[#171512]/60 p-6"
        >
          <section className="w-full max-w-[1120px] rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <b className="text-base">세부내역서 크게 보기</b>
              <div className="flex gap-2">
                {executionButton}
                <button type="button" onClick={() => setIsLarge(false)} className="rounded-md bg-[#171512] px-3 py-1 text-xs font-semibold text-white">닫기 (Esc)</button>
              </div>
            </div>
            {body(true)}
          </section>
        </div>,
        document.body,
        )}
    </div>
  );
}

function DocumentBody({
  title,
  subtitle,
  groups,
  colorIndex,
  showExecution,
  large,
}: {
  title: string;
  subtitle?: string;
  groups: TemplateGroup[];
  colorIndex: Map<string, number>;
  showExecution: boolean;
  large: boolean;
}) {
  const customerTotal = groups.reduce((sum, group) => sum + group.customerTotal, 0);
  const executionTotal = groups.reduce((sum, group) => sum + group.executionTotal, 0);
  const cell = large ? 'border border-[#333] px-2.5 py-1.5' : 'border border-[#333] px-1.5 py-1';
  const heading = [title.trim() || '이름 없는 템플릿', subtitle?.trim(), '부가세 별도'].filter(Boolean).join(' · ');

  return (
    <article className={`border border-[#111] bg-white text-[#111] ${large ? 'px-8 py-7 text-[14px]' : 'px-4 py-4 text-[12px]'}`}>
      <h3 className={`text-center font-semibold tracking-[0.5em] ${large ? 'text-2xl' : 'text-lg'}`}>세부내역서</h3>
      <p className={`mb-3 mt-1 text-center text-[#444] ${large ? 'text-[13px]' : 'text-[11px]'}`}>{heading}</p>
      {groups.length === 0 ? (
        <p className="py-6 text-center text-[#60717d]">품명을 넣은 항목이 여기에 내역서로 보여요.</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className={`bg-[#e5e5e5] ${large ? 'text-[13px]' : 'text-[11px]'}`}>
              <th className={cell}>품명</th>
              <th className={cell}>규격</th>
              <th className={cell}>단위</th>
              <th className={cell}>수량</th>
              <th className={cell}>단가</th>
              <th className={cell}>금액</th>
              {showExecution && <th className={`${cell} text-[#35596b]`}>실행 금액</th>}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <GroupRows key={group.label} group={group} color={groupColor(colorIndex.get(group.label) ?? 0)} showExecution={showExecution} cell={cell} />
            ))}
            <tr className={`bg-[#d9d9d9] font-semibold ${large ? 'text-[15px]' : 'text-[13px]'}`}>
              <td className={cell} colSpan={5}>합계 (부가세 별도)</td>
              <td className={`${cell} text-right`}>{won(customerTotal)}</td>
              {showExecution && <td className={`${cell} text-right text-[#35596b]`}>{won(executionTotal)}</td>}
            </tr>
          </tbody>
        </table>
      )}
      {showExecution && groups.length > 0 && (
        <p className="mt-2 text-[#35596b]">실행 합계 {won(executionTotal)}원 · 예상 {marginText(customerTotal, executionTotal)}</p>
      )}
    </article>
  );
}

function GroupRows({ group, color, showExecution, cell }: { group: TemplateGroup; color: { accent: string; soft: string }; showExecution: boolean; cell: string }) {
  // As the printed 세부내역서: lines gathered by 품명, and a run of the same 품명 shown once.
  const lines = clusterTemplateLinesByName(group.lines);
  const spans = templateNameRowSpans(lines);
  return (
    <>
      <tr className="font-semibold">
        {/* Screen colors only; print falls back to the grey of the estimate documents. */}
        <td
          className={`${cell} print:!border-l print:!bg-[#f3f3f3] print:!text-[#111]`}
          colSpan={showExecution ? 7 : 6}
          style={{ background: color.soft, color: color.accent, borderLeft: `4px solid ${color.accent}` }}
        >
          {group.label}
        </td>
      </tr>
      {lines.map((line, index) => (
        <tr key={line.id}>
          {spans[index] > 0 && (
            <td rowSpan={spans[index]} className={`${cell} break-all align-middle`}>
              {line.name}
            </td>
          )}
          <td className={`${cell} break-all`}>{line.spec}</td>
          <td className={cell}>{line.unit}</td>
          <td className={`${cell} text-right`}>{line.quantity.toLocaleString('ko-KR')}</td>
          <td className={`${cell} text-right`}>{won(line.customerUnitPrice)}</td>
          <td className={`${cell} text-right`}>{won(line.quantity * line.customerUnitPrice)}</td>
          {showExecution && <td className={`${cell} text-right text-[#35596b]`}>{won(line.quantity * line.executionUnitPrice)}</td>}
        </tr>
      ))}
      <tr className="bg-[#fafafa] font-semibold">
        <td className={cell} colSpan={5}>소계</td>
        <td className={`${cell} text-right`}>{won(group.customerTotal)}</td>
        {showExecution && (
          <td className={`${cell} text-right text-[#35596b]`}>
            {won(group.executionTotal)}
            <span className="block text-[10px] font-normal">{marginText(group.customerTotal, group.executionTotal)}</span>
          </td>
        )}
      </tr>
    </>
  );
}
