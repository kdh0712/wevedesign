import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canMergeDetailLine,
  mergeDetailOneLines,
  mergedDetailLineIds,
  toggleDetailOneLine,
} from '../app/lib/estimate-detail-one-line.ts';

const line = (id, category, name, spec, unit, quantity, customerUnitPrice, extra = {}) => ({
  id, space: '', category, process: category, name, spec, unit, quantity, customerUnitPrice, executionUnitPrice: customerUnitPrice, note: '', ...extra,
});
const amount = (lines) => lines.reduce((sum, l) => sum + l.quantity * l.customerUnitPrice, 0);

test('mergeDetailOneLines turns a marked 품명 into one 식 line with the summed amount, where it first was', () => {
  const lines = [
    line('a', '가구 공사', '붙박이장-무광PET', '여닫이', '자', 8.5, 150_000),
    line('b', '가구 공사', '냉장고장', '상부장', 'M', 1, 230_000, { detailOneLine: true, note: '상부 몰딩' }),
    line('c', '가구 공사', '냉장고장', '롱 EP', 'EA', 2, 140_000, { executionUnitPrice: 100_000 }),
    line('d', '가구 공사', '하부장', '상판 대리석', '자', 5, 250_000),
  ];
  const merged = mergeDetailOneLines(lines);
  assert.deepEqual(merged.map((l) => l.id), ['a', 'b-one-line', 'd']);
  const one = merged[1];
  assert.equal(one.name, '냉장고장');
  assert.equal(one.spec, '');
  assert.equal(one.unit, '식');
  assert.equal(one.quantity, 1);
  assert.equal(one.customerUnitPrice, 510_000);
  assert.equal(one.executionUnitPrice, 230_000 + 200_000);
  assert.equal(one.note, '상부 몰딩');
  assert.equal(one.category, '가구 공사');
  assert.equal(amount(merged), amount(lines));
});

test('mergeDetailOneLines leaves unmarked 품명 and a marked 품명 with one line as they are', () => {
  const lines = [
    line('a', '가구 공사', '냉장고장', '상부장', 'M', 1, 230_000),
    line('b', '가구 공사', '냉장고장', '롱 EP', 'EA', 2, 140_000),
    line('c', '가구 공사', '화장대', '안방', '식', 1, 600_000, { detailOneLine: true }),
  ];
  assert.deepEqual(mergeDetailOneLines(lines), lines);
});

test('mergeDetailOneLines gathers a marked 품명 across its 공사 but not from another 공사', () => {
  const lines = [
    line('a', '가구 공사', '냉장고장', '상부장', 'M', 1, 230_000, { detailOneLine: true }),
    line('b', '가구 공사', '하부장', '', '자', 5, 250_000),
    line('c', '가구 공사', ' 냉장고장 ', '롱 EP', 'EA', 2, 140_000),
    line('d', '목공 공사', '냉장고장', '보강', '식', 1, 100_000),
  ];
  const merged = mergeDetailOneLines(lines);
  assert.deepEqual(merged.map((l) => l.id), ['a-one-line', 'b', 'd']);
  assert.equal(merged[0].customerUnitPrice, 510_000);
});

test('mergeDetailOneLines joins distinct notes and keeps fractional amounts exact', () => {
  const lines = [
    line('a', '가구 공사', '냉장고장', '상부장', 'M', 0.5, 1_001, { detailOneLine: true, note: '고객 지급' }),
    line('b', '가구 공사', '냉장고장', '롱 EP', 'EA', 1, 100, { note: '고객 지급' }),
    line('c', '가구 공사', '냉장고장', '측판', 'EA', 1, 50, { note: '현장 확인' }),
  ];
  const [one] = mergeDetailOneLines(lines);
  assert.equal(one.note, '고객 지급 · 현장 확인');
  assert.equal(one.customerUnitPrice, 650.5);
});

test('canMergeDetailLine needs a 품명 with two or more lines in its 공사', () => {
  const lines = [
    line('a', '가구 공사', '냉장고장', '상부장', 'M', 1, 230_000),
    line('b', '가구 공사', '냉장고장', '롱 EP', 'EA', 2, 140_000),
    line('c', '가구 공사', '화장대', '', '식', 1, 600_000),
    line('d', '목공 공사', '화장대', '', '식', 1, 100_000),
    line('e', '가구 공사', '', '', '식', 1, 10),
    line('f', '가구 공사', '  ', '', '식', 1, 10),
  ];
  assert.equal(canMergeDetailLine(lines, 'a'), true);
  assert.equal(canMergeDetailLine(lines, 'b'), true);
  assert.equal(canMergeDetailLine(lines, 'c'), false);
  assert.equal(canMergeDetailLine(lines, 'e'), false);
  assert.equal(canMergeDetailLine(lines, 'missing'), false);
});

test('toggleDetailOneLine marks every line of the 품명 in its 공사, then clears them all', () => {
  const lines = [
    line('a', '가구 공사', '냉장고장', '상부장', 'M', 1, 230_000),
    line('b', '가구 공사', '냉장고장', '롱 EP', 'EA', 2, 140_000),
    line('c', '가구 공사', '화장대', '', '식', 1, 600_000),
    line('d', '목공 공사', '냉장고장', '', '식', 1, 100_000),
  ];
  const on = toggleDetailOneLine(lines, 'b');
  assert.deepEqual(on.map((l) => Boolean(l.detailOneLine)), [true, true, false, false]);
  assert.equal(on[2], lines[2]);
  const off = toggleDetailOneLine(on, 'a');
  assert.deepEqual(off.map((l) => Boolean(l.detailOneLine)), [false, false, false, false]);
  assert.equal('detailOneLine' in off[0], false);
});

test('mergedDetailLineIds lists every line drawn as one, a later line of the same 품명 included', () => {
  const lines = [
    line('a', '가구 공사', '냉장고장', '상부장', 'M', 1, 230_000, { detailOneLine: true }),
    line('b', '가구 공사', '냉장고장', '롱 EP', 'EA', 2, 140_000, { detailOneLine: true }),
    line('c', '가구 공사', '냉장고장', '측판', 'EA', 1, 50_000),
    line('d', '가구 공사', '화장대', '', '식', 1, 600_000, { detailOneLine: true }),
  ];
  assert.deepEqual([...mergedDetailLineIds(lines)].sort(), ['a', 'b', 'c']);
});
