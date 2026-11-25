import test from 'node:test';
import assert from 'node:assert/strict';
import { templateDocumentTotals } from '../app/lib/estimate-document-totals.ts';

const documentLine = (id, category, name, customerUnitPrice, executionUnitPrice = customerUnitPrice) => ({
  id, space: '', category, process: '', name, spec: '', unit: '식', quantity: 1, customerUnitPrice, executionUnitPrice, note: '',
});

test('templateDocumentTotals keeps lines without a 품명 in the 합계, apart from the 공사', () => {
  const lines = [
    documentLine('a', '목공', '목공 일식', 18_959_000),
    documentLine('b', '기타 공사', '입주청소', 1_268_000),
    documentLine('c', '목공', '', 2_000_000, 1_500_000),
    documentLine('d', '전기', '  ', 1_570_000, 1_000_000),
    documentLine('e', '전기', '', 0, 0),
  ];
  const totals = templateDocumentTotals(lines, 3);
  assert.deepEqual(totals.groups.map((group) => [group.label, group.customerTotal]), [['목공', 18_959_000], ['기타 공사', 1_268_000]]);
  assert.deepEqual(totals.unnamed, { count: 2, customerTotal: 3_570_000, executionTotal: 2_500_000 });
  assert.equal(totals.constructionTotal, 23_797_000);
  assert.equal(totals.overhead, 713_910);
  assert.equal(totals.customerTotal, 24_510_910);
  assert.equal(totals.executionTotal, 18_959_000 + 1_268_000 + 2_500_000);
});

test('templateDocumentTotals with every line named sets nothing apart', () => {
  const totals = templateDocumentTotals([documentLine('a', '목공', '목공 일식', 100, 60), documentLine('b', '목공', '', 0, 0)]);
  assert.deepEqual(totals.unnamed, { count: 0, customerTotal: 0, executionTotal: 0 });
  assert.equal(totals.overhead, 0);
  assert.equal(totals.customerTotal, 100);
  assert.equal(totals.executionTotal, 60);
});

// The estimate page (calculateTotals) rounds the sum of every line once; the preview must land on the same 견적 금액.
test('templateDocumentTotals rounds the whole sum once, as the 견적 금액 does', () => {
  const half = (id, category, name) => ({ ...documentLine(id, category, name, 1_001, 1_001), quantity: 0.5 });
  const apart = templateDocumentTotals([half('a', '목공', '문틀'), half('b', '전기', '조명')], 3);
  assert.equal(apart.constructionTotal, 1_001);
  assert.equal(apart.customerTotal, 1_031);
  assert.equal(apart.executionTotal, 1_001);
  const withUnnamed = templateDocumentTotals([half('a', '목공', '문틀'), half('b', '목공', '')], 3);
  assert.equal(withUnnamed.constructionTotal, 1_001);
  assert.equal(withUnnamed.customerTotal, 1_031);
});
