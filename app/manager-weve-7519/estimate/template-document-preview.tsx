'use client';

import { useState } from 'react';
import { groupTemplateLines, type TemplateLine } from '../../lib/estimate-templates';

// The template editor's live 세부내역서: grouped by 공사 like the estimate documents, lines without a 품명 left out as there.
// The customer view is the default; 실행 금액 보기 adds execution amounts and margins for internal checks.

const won = (value: number) => Math.round(value).toLocaleString('ko-KR');
const marginText = (customer: number, execution: number) =>
  `마진 ${won(customer - execution)}원${customer ? ` (${(((customer - execution) / customer) * 100).toFixed(1)}%)` : ''}`;

export function TemplateDocumentPreview({ name, lines, onCollapse }: { name: string; lines: TemplateLine[]; onCollapse: () => void }) {
  const [showExecution, setShowExecution] = useState(false);
  const groups = groupTemplateLines(lines.filter((line) => line.name.trim()));
  const customerTotal = groups.reduce((sum, group) => sum + group.customerTotal, 0);
  const executionTotal = groups.reduce((sum, group) => sum + group.executionTotal, 0);
  const cell = 'border border-[#333] px-1.5 py-1';

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <b className="text-sm">세부내역서 미리보기</b>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setShowExecution((current) => !current)} className="rounded-md border border-[#d5dde2] bg-white px-2 py-1 text-xs font-semibold">
            {showExecution ? '고객용으로 보기' : '실행 금액 보기'}
          </button>
          <button type="button" onClick={onCollapse} className="rounded-md border border-[#d5dde2] bg-white px-2 py-1 text-xs font-semibold">미리보기 접기</button>
        </div>
      </div>
      <article className="border border-[#111] bg-white px-4 py-4 text-[12px] text-[#111]">
        <h3 className="text-center text-lg font-semibold tracking-[0.5em]">세부내역서</h3>
        <p className="mb-3 mt-1 text-center text-[11px] text-[#444]">{name.trim() || '이름 없는 템플릿'} · 부가세 별도</p>
        {groups.length === 0 ? (
          <p className="py-6 text-center text-[#60717d]">품명을 넣은 항목이 여기에 내역서로 보여요.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#e5e5e5] text-[11px]">
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
                <GroupRows key={group.label} group={group} showExecution={showExecution} cell={cell} />
              ))}
              <tr className="bg-[#d9d9d9] text-[13px] font-semibold">
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
    </div>
  );
}

function GroupRows({ group, showExecution, cell }: { group: ReturnType<typeof groupTemplateLines>[number]; showExecution: boolean; cell: string }) {
  return (
    <>
      <tr className="bg-[#f3f3f3] font-semibold">
        <td className={cell} colSpan={showExecution ? 7 : 6}>{group.label}</td>
      </tr>
      {group.lines.map((line) => (
        <tr key={line.id}>
          <td className={`${cell} break-all`}>{line.name}</td>
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
