import { overheadAmount } from './estimate-overhead.ts';
import { groupTemplateLines, namedTemplateLines, templateCustomerTotal, type TemplateGroup, type TemplateLine } from './estimate-templates.ts';

// The sums of the live 세부내역서 beside the estimate and template editors (template-document-preview.tsx). Its 공사 hold
// the lines with a 품명, as on the printed documents; lines without one are summed apart, so the 합계 is the estimate
// total the estimate page and the printed 총합계 show. The totals add every line and round once, as calculateTotals on
// the estimate page does, so fractional amounts land on the same won. unnamed.count: those of them with an amount.
// drawnLines: the rows to draw when they differ from the lines (세부내역서에서 한 줄로 merges some); the 공사 come from them,
// every total from the lines, so a merge never moves the 합계.
export type TemplateDocumentTotals<T extends TemplateLine> = {
  groups: Array<TemplateGroup<T>>;
  unnamed: { count: number; customerTotal: number; executionTotal: number };
  constructionTotal: number;
  overhead: number;
  customerTotal: number;
  executionTotal: number;
};

const amount = (quantity: unknown, unitPrice: unknown) => (Number(quantity) || 0) * (Number(unitPrice) || 0);

export function templateDocumentTotals<T extends TemplateLine>(lines: T[], overheadRate = 0, drawnLines: T[] = lines): TemplateDocumentTotals<T> {
  const groups = groupTemplateLines(namedTemplateLines(drawnLines));
  const named = new Set(namedTemplateLines(lines));
  const unnamedLines = lines.filter((line) => !named.has(line));
  const unnamed = {
    count: unnamedLines.filter((line) => amount(line.quantity, line.customerUnitPrice) !== 0 || amount(line.quantity, line.executionUnitPrice) !== 0).length,
    customerTotal: templateCustomerTotal(unnamedLines),
    executionTotal: Math.round(unnamedLines.reduce((sum, line) => sum + amount(line.quantity, line.executionUnitPrice), 0)) || 0,
  };
  const constructionTotal = templateCustomerTotal(lines);
  const overhead = overheadAmount(constructionTotal, overheadRate);
  return {
    groups,
    unnamed,
    constructionTotal,
    overhead,
    customerTotal: constructionTotal + overhead,
    executionTotal: Math.round(lines.reduce((sum, line) => sum + amount(line.quantity, line.executionUnitPrice), 0)) || 0,
  };
}
