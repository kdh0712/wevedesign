import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPriceEdit,
  executionFollowsCustomer,
  isPriceEditCommon,
  priceEditDbChanges,
  priceEditDbSaveError,
  priceEditDraft,
  priceEditMaterialSave,
  priceEditTotals,
  withCustomerPrice,
} from '../app/lib/estimate-price-edit.ts';

// 단가 칸 → 자재 DB 수정 팝업 (spec docs/superpowers/specs/2026-11-26-price-cell-db-popup-design.md).

const line = (extra = {}) => ({
  id: 'l1', space: '주방', category: '가구 공사', process: '주방가구', name: '싱크대 하부장', spec: 'PET 무광', unit: 'm',
  quantity: 2.4, customerUnitPrice: 450000, executionUnitPrice: 380000, note: '', materialId: 'm1', ...extra,
});
const material = (extra = {}) => ({
  _id: 'm1', category: '주방가구', process: '주방가구', name: '싱크대 하부장', spec: 'PET 무광', unit: 'm',
  unitPrice: 450000, executionUnitPrice: 380000, note: '한샘', sourceSheet: '견적서 입력', commonOptions: ['x'], updatedAt: 'old', ...extra,
});
const draft = (extra = {}) => ({ name: '싱크대 하부장', spec: 'PET 무광', unit: 'm', customerUnitPrice: 470000, executionUnitPrice: 395000, ...extra });

test('priceEditDraft starts from the line: 품명·규격·단위 and both prices', () => {
  assert.deepEqual(priceEditDraft(line()), { name: '싱크대 하부장', spec: 'PET 무광', unit: 'm', customerUnitPrice: 450000, executionUnitPrice: 380000 });
});

test('applyPriceEdit changes only 품명·규격·단위·prices, trimmed, and keeps the rest of the line (its DB link too)', () => {
  const next = applyPriceEdit(line(), draft({ name: ' 싱크대 하부장(고급) ', spec: ' PET 유광 ', unit: ' M ' }));
  assert.deepEqual(next, line({ name: '싱크대 하부장(고급)', spec: 'PET 유광', unit: 'M', customerUnitPrice: 470000, executionUnitPrice: 395000 }));
});

test('applyPriceEdit links the line to the DB item it was saved to', () => {
  const next = applyPriceEdit(line({ materialId: undefined }), draft(), 'm9');
  assert.equal(next.materialId, 'm9');
  assert.equal(applyPriceEdit(line(), draft()).materialId, 'm1');
});

test('applyPriceEdit reads a missing or broken price as 0', () => {
  const next = applyPriceEdit(line(), draft({ customerUnitPrice: Number.NaN, executionUnitPrice: undefined }));
  assert.equal(next.customerUnitPrice, 0);
  assert.equal(next.executionUnitPrice, 0);
});

test('priceEditMaterialSave writes the draft onto the same DB item and keeps its 분류·공종·비고·source', () => {
  assert.deepEqual(priceEditMaterialSave(material(), draft({ name: ' 싱크대 하부장(고급) ', spec: 'PET 유광' }), {}), {
    _id: 'm1', category: '주방가구', process: '주방가구', name: '싱크대 하부장(고급)', spec: 'PET 유광', unit: 'm',
    unitPrice: 470000, executionUnitPrice: 395000, note: '한샘', sourceSheet: '견적서 입력',
  });
});

test('priceEditMaterialSave never sends 공통 항목s, so the server keeps the stored list', () => {
  assert.equal('commonOptions' in priceEditMaterialSave(material(), draft(), {}), false);
});

test('priceEditMaterialSave saves a 실행단가 equal to the 견적단가 as 0 (견적단가와 같게)', () => {
  assert.equal(priceEditMaterialSave(material(), draft({ executionUnitPrice: 470000 }), {}).executionUnitPrice, 0);
});

test('priceEditMaterialSave keeps the DB 품명 for a 공통 line, whose 품명 is its own', () => {
  const saved = priceEditMaterialSave(material({ name: '공통', spec: '' }), draft({ name: '거실 몰딩', spec: '30mm' }), { commonName: true });
  assert.equal(saved.name, '공통');
  assert.equal(saved.spec, '30mm');
});

test('priceEditDbSaveError asks for a 품명 unless the line is a 공통 line', () => {
  assert.equal(priceEditDbSaveError(draft()), '');
  assert.equal(priceEditDbSaveError(draft({ name: '  ' })), '자재 DB에 저장할 품명을 입력해주세요.');
  assert.equal(priceEditDbSaveError(draft({ name: '' }), { commonName: true }), '');
});

test('priceEditTotals gives the line amount and margin before and after', () => {
  assert.deepEqual(priceEditTotals(line({ quantity: 2 }), draft()), {
    amountBefore: 900000, amountAfter: 940000, marginBefore: 140000, marginAfter: 150000,
  });
});

test('a line whose 실행단가 equals its 견적단가 lets the 실행단가 follow a new 견적단가 (review finding)', () => {
  assert.equal(executionFollowsCustomer(line({ executionUnitPrice: 450000 })), true);
  assert.equal(executionFollowsCustomer(line()), false);
  const start = draft({ customerUnitPrice: 450000, executionUnitPrice: 450000 });
  assert.deepEqual(withCustomerPrice(start, 470000, true), { ...start, customerUnitPrice: 470000, executionUnitPrice: 470000 });
  assert.deepEqual(withCustomerPrice(start, 470000, false), { ...start, customerUnitPrice: 470000 });
});

test('so a 견적단가-only DB save keeps the DB item without its own 실행단가 (review finding)', () => {
  const followed = withCustomerPrice(draft({ customerUnitPrice: 450000, executionUnitPrice: 450000 }), 470000, true);
  const saved = priceEditMaterialSave(material({ unitPrice: 450000, executionUnitPrice: 0 }), followed, {});
  assert.equal(saved.unitPrice, 470000);
  assert.equal(saved.executionUnitPrice, 0);
});

test('priceEditDbChanges names the DB values a DB save would change', () => {
  assert.deepEqual(priceEditDbChanges(material(), draft({ customerUnitPrice: 450000, executionUnitPrice: 380000 }), {}), []);
  assert.deepEqual(priceEditDbChanges(material(), draft(), {}), ['견적단가', '실행단가']);
  assert.deepEqual(priceEditDbChanges(material(), draft({ spec: 'PET 유광', unit: 'M', customerUnitPrice: 450000, executionUnitPrice: 380000 }), {}), ['규격', '단위']);
  // A DB item without its own 실행단가 stays so when the draft's 실행단가 equals its 견적단가.
  assert.deepEqual(priceEditDbChanges(material({ executionUnitPrice: 0 }), draft({ customerUnitPrice: 450000, executionUnitPrice: 450000 }), {}), []);
  assert.deepEqual(priceEditDbChanges(material({ executionUnitPrice: 0 }), draft({ customerUnitPrice: 450000, executionUnitPrice: 400000 }), {}), ['실행단가']);
  // A 공통 item keeps its 품명.
  assert.deepEqual(priceEditDbChanges(material({ name: '공통' }), draft({ name: '거실 몰딩', customerUnitPrice: 450000, executionUnitPrice: 380000 }), { commonName: true }), []);
});

test('a line matched to the 공통 item counts as a 공통 line even without commonName (review finding)', () => {
  assert.equal(isPriceEditCommon(line(), material({ name: '공통' })), true);
  assert.equal(isPriceEditCommon(line({ commonName: true }), null), true);
  assert.equal(isPriceEditCommon(line(), material()), false);
  assert.equal(priceEditMaterialSave(material({ name: '공통' }), draft({ name: '거실 몰딩' }), {}).name, '공통');
});
