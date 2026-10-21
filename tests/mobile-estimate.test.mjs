import test from 'node:test';
import assert from 'node:assert/strict';
import { toCustomerEstimateView } from '../app/lib/mobile-estimate.ts';

const estimate = {
  versionLabel: '2차 확정',
  versionType: 'final',
  updatedAt: '2026-10-20T01:00:00Z',
  memo: '내부 메모',
  executionCostTotal: 9,
  marginAmount: 1,
  marginRate: 0.1,
  workLinesJson: '[]',
  purchaseOrdersJson: '[]',
  linesJson: JSON.stringify([
    { category: '목공', name: '천장', spec: '석고', unit: 'm2', quantity: 10, customerUnitPrice: 1000, executionUnitPrice: 700, executionAmount: 7000, note: '우물천장' },
    { process: '전기', name: '조명', space: '거실', unit: '', quantity: 2, customerUnitPrice: 5000 },
    { category: '목공', name: '', quantity: 1, customerUnitPrice: 999 },
    { name: '기타', quantity: 'x', customerUnitPrice: -5 },
  ]),
};

test('groups by category, then process, then 기타 공사, and skips nameless lines', () => {
  const view = toCustomerEstimateView(estimate);
  assert.deepEqual(
    view.groups.map((group) => [group.category, group.subtotal, group.lines.length]),
    [
      ['목공', 10000, 1],
      ['전기', 10000, 1],
      ['기타 공사', 0, 1],
    ],
  );
  assert.equal(view.total, 20000);
  assert.deepEqual(view.groups[0].lines[0], { name: '천장', spec: '석고', unit: 'm2', quantity: 10, unitPrice: 1000, amount: 10000, note: '우물천장' });
  assert.deepEqual(view.groups[1].lines[0], { name: '조명', spec: '거실', unit: '식', quantity: 2, unitPrice: 5000, amount: 10000, note: '' });
  assert.deepEqual(
    [view.versionLabel, view.versionType, view.updatedAt, view.vatNote],
    ['2차 확정', 'final', '2026-10-20T01:00:00Z', '부가세 별도'],
  );
});

test('never carries costs, margins or internal notes', () => {
  const json = JSON.stringify(toCustomerEstimateView(estimate));
  for (const word of ['execution', 'margin', 'workLines', 'purchase', '내부', '700', '7000', '"9"']) {
    assert.ok(!json.includes(word), word);
  }
});

test('discount lines keep their minus, and amounts round like the PC estimate', () => {
  const view = toCustomerEstimateView({
    linesJson: JSON.stringify([
      { category: '목공', name: '천장', quantity: 1, customerUnitPrice: 1000000 },
      { category: '할인', name: '네고', quantity: 1, customerUnitPrice: -500000 },
      { category: '도장', name: '벽', quantity: 2.5, customerUnitPrice: 166665 },
    ]),
  });
  assert.deepEqual(view.groups[1].lines[0], { name: '네고', spec: '', unit: '식', quantity: 1, unitPrice: -500000, amount: -500000, note: '' });
  assert.equal(view.groups[1].subtotal, -500000);
  assert.equal(view.groups[2].lines[0].amount, 416663);
  assert.equal(view.groups[2].subtotal, 416663);
  assert.equal(view.total, 916663);
});

test('coerces bad numbers to 0', () => {
  const [line] = toCustomerEstimateView(estimate).groups[2].lines;
  assert.deepEqual([line.quantity, line.unitPrice, line.amount], [0, -5, 0]);
  const json = JSON.stringify(toCustomerEstimateView({ linesJson: JSON.stringify([{ name: 'a', quantity: '3', customerUnitPrice: '1500' }]) }));
  assert.ok(!json.includes('NaN') && !json.includes('null'), json);
  assert.equal(toCustomerEstimateView({ linesJson: JSON.stringify([{ name: 'a', quantity: '3', customerUnitPrice: '1500' }]) }).total, 4500);
});

test('broken or missing lines JSON gives an empty estimate', () => {
  for (const linesJson of ['{oops', '', undefined, '{"a":1}', '[1, null, "x"]']) {
    const view = toCustomerEstimateView({ linesJson });
    assert.deepEqual([view.groups, view.total], [[], 0], String(linesJson));
  }
});
