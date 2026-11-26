import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDetailDisplay,
  detailDisplayChanges,
  detailDisplayPreview,
  detailDocumentLines,
  hasDetailDisplay,
  normalizeDetailDisplay,
} from '../app/lib/estimate-detail-display.ts';

// 세부내역서 표시 바꾸기 (spec docs/superpowers/specs/2026-11-26-detail-display-design.md).

const line = (id, name, spec, unit, quantity, customerUnitPrice, extra = {}) => ({
  id, space: '', category: '가구 공사', process: '가구공사', name, spec, unit, quantity, customerUnitPrice, executionUnitPrice: customerUnitPrice, note: '', ...extra,
});
const amount = (l) => l.quantity * l.customerUnitPrice;

test('normalizeDetailDisplay keeps what is set: a 품명 only when not blank, 규격/단위 even blank, a 수량 above 0', () => {
  assert.deepEqual(normalizeDetailDisplay({ name: ' 씽크대 ', spec: '', unit: ' 식 ', quantity: 1 }), { name: '씽크대', spec: '', unit: '식', quantity: 1 });
  assert.deepEqual(normalizeDetailDisplay({ name: '   ', quantity: 0 }), undefined);
  assert.deepEqual(normalizeDetailDisplay({ quantity: -2, unit: 3 }), undefined);
  assert.deepEqual(normalizeDetailDisplay({ quantity: '2' }), undefined);
  assert.deepEqual(normalizeDetailDisplay({ unit: '  ' }), undefined, 'a blank 단위 prints 식 anyway, so it is not kept');
  assert.deepEqual(normalizeDetailDisplay({ for: '씽크대' }), undefined, 'the 품명 it was set for alone shows nothing');
  assert.deepEqual(normalizeDetailDisplay({ for: ' 씽크대 ', unit: '식' }), { unit: '식', for: '씽크대' });
  assert.equal(normalizeDetailDisplay(null), undefined);
  assert.equal(normalizeDetailDisplay([]), undefined);
  assert.equal(normalizeDetailDisplay({ name: 'x'.repeat(200) }).name.length, 120);
});

test('applyDetailDisplay shows another 단위 and 수량 for the same amount: 5.4 M × 410,000 → 식 1 × 2,214,000', () => {
  const sink = line('a', '씽크대(사재)-PET', 'LX 하이막스 대리석', 'M', 5.4, 410_000, { executionUnitPrice: 300_000, detailDisplay: { unit: '식', quantity: 1 } });
  const shown = applyDetailDisplay(sink);
  assert.equal(shown.unit, '식');
  assert.equal(shown.quantity, 1);
  assert.equal(shown.customerUnitPrice, 2_214_000);
  assert.equal(shown.executionUnitPrice, 1_620_000);
  assert.equal(shown.name, '씽크대(사재)-PET');
  assert.equal(shown.spec, 'LX 하이막스 대리석');
  assert.equal(Math.round(amount(shown)), Math.round(amount(sink)));
});

test('applyDetailDisplay can rename, blank the 규격, and leaves a line without a display as it is', () => {
  const plain = line('a', '하부장', '대리석', '자', 5, 250_000);
  assert.equal(applyDetailDisplay(plain), plain);
  const shown = applyDetailDisplay({ ...plain, detailDisplay: { name: '주방 하부장', spec: '' } });
  assert.deepEqual([shown.name, shown.spec, shown.unit, shown.quantity, shown.customerUnitPrice], ['주방 하부장', '', '자', 5, 250_000]);
  const blankName = applyDetailDisplay({ ...plain, detailDisplay: { name: '  ' } });
  assert.deepEqual([blankName.name, blankName.spec, blankName.unit, blankName.quantity, blankName.customerUnitPrice], ['하부장', '대리석', '자', 5, 250_000]);
});

test('detailDocumentLines: a 품명 set to 한 줄로 is merged and ignores its lines\' displays; the other lines show theirs', () => {
  const lines = [
    line('a', '냉장고장', '상부장', 'M', 1, 230_000, { detailOneLine: '냉장고장', detailDisplay: { name: '냉장고 상부장', quantity: 2 } }),
    line('b', '냉장고장', '롱 EP', 'EA', 2, 140_000),
    line('c', '씽크대', '대리석', 'M', 5.4, 410_000, { detailDisplay: { unit: '식', quantity: 1 } }),
  ];
  const shown = detailDocumentLines(lines);
  assert.deepEqual(shown.map((l) => l.id), ['a-one-line', 'c']);
  assert.deepEqual([shown[0].name, shown[0].unit, shown[0].quantity, shown[0].customerUnitPrice], ['냉장고장', '식', 1, 510_000]);
  assert.equal('detailDisplay' in shown[0], false);
  assert.deepEqual([shown[1].unit, shown[1].quantity, shown[1].customerUnitPrice], ['식', 1, 2_214_000]);
});

test('hasDetailDisplay and detailDisplayPreview (the dialog): the shown 단가 and whether it has a fraction', () => {
  const sink = line('a', '씽크대', '대리석', 'M', 5.4, 410_000);
  assert.equal(hasDetailDisplay(sink), false);
  assert.equal(hasDetailDisplay({ ...sink, detailDisplay: { unit: '식' } }), true);
  assert.deepEqual(detailDisplayPreview(sink, { unit: '식', quantity: 1 }), { amount: 2_214_000, unitPrice: 2_214_000, fractional: false });
  assert.deepEqual(detailDisplayPreview(sink, { quantity: 7 }), { amount: 2_214_000, unitPrice: 316_285.714286, fractional: true });
});

test('detailDisplayChanges keeps only what differs from the estimate line, so 원래대로 values store nothing', () => {
  const sink = line('a', '씽크대', '대리석', 'M', 5.4, 410_000);
  assert.deepEqual(detailDisplayChanges(sink, { name: '씽크대', spec: '대리석', unit: '식', quantity: 1 }), { unit: '식', quantity: 1, for: '씽크대' });
  assert.deepEqual(detailDisplayChanges(sink, { name: ' 씽크대 ', spec: '대리석', unit: 'M', quantity: 5.4 }), undefined);
  assert.deepEqual(detailDisplayChanges(sink, { name: '', spec: '', unit: 'M', quantity: 0 }), { spec: '', for: '씽크대' });
  assert.deepEqual(detailDisplayChanges(sink, { name: '주방 씽크대', spec: '대리석', unit: 'M', quantity: 5.4 }), { name: '주방 씽크대', for: '씽크대' });
});

test('a display counts only for the 품명 it was set for, so a line re-picked as another item drops it', () => {
  const display = { for: '씽크대', name: '주방 씽크대', unit: '식', quantity: 1 };
  const repicked = line('a', '욕실 타일', '600각', 'm2', 12, 30_000, { detailDisplay: display });
  assert.equal(hasDetailDisplay(repicked), false);
  assert.equal(applyDetailDisplay(repicked), repicked);
  const same = line('b', '씽크대', '대리석', 'M', 5.4, 410_000, { detailDisplay: display });
  assert.equal(hasDetailDisplay(same), true);
  assert.equal(applyDetailDisplay(same).name, '주방 씽크대');
});

test('a blank 규격 prints blank: the 공간 that the documents would show in its place is cleared too', () => {
  const kitchen = line('a', '하부장', '대리석', '자', 5, 250_000, { space: '주방', detailDisplay: { spec: '' } });
  const shown = applyDetailDisplay(kitchen);
  assert.deepEqual([shown.spec, shown.space], ['', '']);
});

test('a large shown 수량 still multiplies back to the amount within a thousandth of a won', () => {
  const shown = applyDetailDisplay(line('a', '공사비', '', '식', 1, 1_000_000, { detailDisplay: { quantity: 3000 } }));
  assert.ok(Math.abs(shown.quantity * shown.customerUnitPrice - 1_000_000) < 0.0005);
  const odd = applyDetailDisplay(line('b', '공사비', '', '식', 1, 100_000, { detailDisplay: { quantity: 1069 } }));
  assert.ok(Math.abs(odd.quantity * odd.customerUnitPrice - 100_000) < 0.0005);
});
