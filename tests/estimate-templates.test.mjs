import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NO_CATEGORY,
  NO_SPACE,
  filterTemplateLines,
  findTemplateMaterial,
  isBlankEstimateLine,
  normalizeTemplateLines,
  placeTemplateLines,
  refreshTemplateLines,
  templateCustomerTotal,
  templateLinesError,
  templateNameError,
  templateSelectionOptions,
} from '../app/lib/estimate-templates.ts';

const line = (overrides = {}) => ({
  id: 'l',
  space: '',
  category: '',
  process: '',
  name: '',
  spec: '',
  unit: '',
  quantity: 1,
  customerUnitPrice: 0,
  executionUnitPrice: 0,
  note: '',
  ...overrides,
});
const pick = (object, keys) => Object.fromEntries(keys.map((key) => [key, object[key]]));

test('selection options count categories and spaces, blanks get their own box', () => {
  const lines = [line({ category: '타일', space: '욕실' }), line({ category: '타일', space: '거실' }), line({ category: ' ', space: '' })];
  const options = templateSelectionOptions(lines);
  assert.deepEqual(options.categories, [{ label: '타일', count: 2 }, { label: NO_CATEGORY, count: 1 }]);
  assert.deepEqual(options.spaces, [{ label: '욕실', count: 1 }, { label: '거실', count: 1 }, { label: NO_SPACE, count: 1 }]);
});

test('a line comes in only when both its category and its space are on', () => {
  const lines = [line({ id: 'a', category: '타일', space: '욕실' }), line({ id: 'b', category: '타일', space: '거실' }), line({ id: 'c', category: '도배', space: '거실' })];
  assert.deepEqual(filterTemplateLines(lines, { categories: ['타일'], spaces: ['거실', '주방'] }).map((l) => l.id), ['b']);
  assert.deepEqual(filterTemplateLines([line({ id: 'd', category: '', space: '' })], { categories: [NO_CATEGORY], spaces: [NO_SPACE] }).map((l) => l.id), ['d']);
});

test('findTemplateMaterial: materialId first, then one exact name/spec/unit match', () => {
  const db = [{ _id: 'm1', name: '타일', spec: '600각', unit: 'm2', unitPrice: 30000 }, { _id: 'm2', name: '타일', spec: '300각', unit: 'm2', unitPrice: 20000 }];
  assert.equal(findTemplateMaterial(line({ materialId: 'm2', name: '바뀐 이름' }), db)._id, 'm2');
  assert.equal(findTemplateMaterial(line({ name: ' 타일 ', spec: '600각', unit: 'm2' }), db)._id, 'm1');
  assert.equal(findTemplateMaterial(line({ materialId: 'gone', name: '타일', spec: '600각', unit: 'm2' }), db)._id, 'm1', 'a deleted id falls back to the name match');
});

test('two DB items with the same name/spec/unit are not guessed', () => {
  const db = [{ _id: 'x', name: '실리콘', spec: '', unit: '개', unitPrice: 1 }, { _id: 'y', name: '실리콘', spec: '', unit: '개', unitPrice: 2 }];
  assert.equal(findTemplateMaterial(line({ name: '실리콘', spec: '', unit: '개' }), db), null);
});

test('a common line is never matched by name', () => {
  const db = [{ _id: 'c', name: '공통', spec: '', unit: '식', unitPrice: 5 }, { _id: 'n', name: '줄눈', spec: '', unit: '식', unitPrice: 7 }];
  assert.equal(findTemplateMaterial(line({ commonName: true, name: '줄눈', unit: '식' }), db), null);
  assert.equal(findTemplateMaterial(line({ commonName: true, name: '줄눈', materialId: 'c' }), db)._id, 'c');
});

test('refreshTemplateLines puts the DB price in both prices, keeps the rest, and reports', () => {
  const db = [{ _id: 'm1', name: '타일', spec: '600각(신)', unit: 'm2', unitPrice: 33000 }, { _id: 'c', name: '공통', spec: '', unit: '식', unitPrice: 9000 }];
  let n = 0;
  const result = refreshTemplateLines([
    line({ id: 't1', materialId: 'm1', name: '타일', spec: '600각', unit: 'm2', quantity: 12, customerUnitPrice: 30000, executionUnitPrice: 30000, space: '욕실', note: '벽' }),
    line({ id: 't2', materialId: 'c', commonName: true, name: '줄눈 시공', customerUnitPrice: 9000, executionUnitPrice: 9000 }),
    line({ id: 't3', name: '특수 시공비', customerUnitPrice: 500000, executionUnitPrice: 400000 }),
  ], db, () => `new-${++n}`);
  assert.deepEqual(result.lines.map((l) => l.id), ['new-1', 'new-2', 'new-3']);
  assert.deepEqual(pick(result.lines[0], ['customerUnitPrice', 'executionUnitPrice', 'spec', 'quantity', 'space', 'note', 'materialId']),
    { customerUnitPrice: 33000, executionUnitPrice: 33000, spec: '600각(신)', quantity: 12, space: '욕실', note: '벽', materialId: 'm1' });
  assert.equal(result.lines[1].name, '줄눈 시공', 'a common line keeps its own 품명');
  assert.deepEqual(pick(result.lines[2], ['customerUnitPrice', 'executionUnitPrice']), { customerUnitPrice: 500000, executionUnitPrice: 400000 });
  assert.deepEqual(result.changed, [{ name: '타일', before: 30000, after: 33000 }]);
  assert.deepEqual(result.notFound, ['특수 시공비']);
});

test('placing template lines: replace, append, and new ids never collide', () => {
  const current = [line({ id: 'a', name: '기존 1' }), line({ id: 'b', name: '기존 2' })];
  let n = 0;
  const first = refreshTemplateLines([line({ id: 'a', name: '템플릿' })], [], () => `line-${++n}`).lines;
  const second = refreshTemplateLines([line({ id: 'a', name: '템플릿' })], [], () => `line-${++n}`).lines;
  const all = placeTemplateLines(placeTemplateLines(current, first, 'append'), second, 'append');
  assert.equal(all.length, 4);
  assert.equal(new Set(all.map((l) => l.id)).size, 4);
  assert.deepEqual(placeTemplateLines(current, first, 'replace').map((l) => l.id), first.map((l) => l.id));
});

test('appending drops blank lines that were only placeholders', () => {
  const placed = placeTemplateLines([line({ id: 'blank' }), line({ id: 'kept', name: '제목' })], [line({ id: 'new', name: '타일' })], 'append');
  assert.deepEqual(placed.map((l) => l.id), ['kept', 'new']);
});

test('only a line with no 품명·규격·비고 and zero prices is blank; the new-version title line is not', () => {
  assert.equal(isBlankEstimateLine(line({ name: '', spec: '', note: '', customerUnitPrice: 0, executionUnitPrice: 0 })), true);
  assert.equal(isBlankEstimateLine(line({ name: '  ', customerUnitPrice: 0, executionUnitPrice: 0 })), true);
  assert.equal(isBlankEstimateLine(line({ name: '용호마을 24평 초안', customerUnitPrice: 0, executionUnitPrice: 0 })), false);
  assert.equal(isBlankEstimateLine(line({ executionUnitPrice: 5 })), false);
});

test('template name and size rules', () => {
  assert.notEqual(templateNameError('   ', []), '');
  assert.notEqual(templateNameError('가'.repeat(61), []), '');
  assert.equal(templateNameError('가'.repeat(60), []), '');
  assert.notEqual(templateNameError('30평형 풀공사', ['30 평형풀공사']), '', 'spaces are ignored');
  assert.notEqual(templateNameError('Full 30', ['full 30']), '', 'case is ignored');
  assert.equal(templateNameError(' 30평형 풀공사 ', ['20평형']), '');
  assert.notEqual(templateLinesError(new Array(2001).fill({})), '');
  assert.equal(templateLinesError(new Array(2000).fill({})), '');
});

test('normalizeTemplateLines takes JSON or arrays and never yields NaN', () => {
  const lines = normalizeTemplateLines(JSON.stringify([{ id: 'x', quantity: 'abc', customerUnitPrice: '1200' }, 3, null]));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantity, 0);
  assert.equal(lines[0].customerUnitPrice, 1200);
  assert.equal(normalizeTemplateLines([{ name: '타일' }])[0].quantity, 1, 'a missing 수량 is 1');
  assert.deepEqual(normalizeTemplateLines('{broken'), []);
  assert.deepEqual(normalizeTemplateLines(undefined), []);
  assert.equal(templateCustomerTotal([line({ quantity: 1.5, customerUnitPrice: 1001 })]), 1502);
});
