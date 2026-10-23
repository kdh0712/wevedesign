import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NO_CATEGORY,
  namedTemplateLines,
  templateLineLabel,
  appendTemplateLines,
  findTemplateGroupLabel,
  withTemplateSpace,
  templateAreaRatio,
  isAreaUnit,
  normalizeBaseArea,
  scaleTemplateQuantities,
  templateBaseAreaError,
  templateUnitOptions,
  GROUP_COLORS,
  copyTemplateGroup,
  duplicateTemplateLine,
  groupColor,
  moveTemplateGroupBefore,
  moveTemplateLineBefore,
  pinBaseGroupFirst,
  removeTemplateGroup,
  renameTemplateGroup,
  templateCopyGroupName,
  templateGroupExists,
  NO_SPACE,
  filterTemplateLines,
  findTemplateMaterial,
  groupTemplateLines,
  insertIntoTemplateGroup,
  moveTemplateGroup,
  moveTemplateLineInGroup,
  orderTemplateLinesByGroup,
  setTemplateLineCategory,
  templateGroupLabel,
  isBlankEstimateLine,
  isMaterialListCurrent,
  normalizeTemplateLines,
  placeTemplateLines,
  refreshTemplateLines,
  repickTemplateLine,
  templateCopyName,
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

test('the material list is current only when both versions exist, match, and the cache is not empty', () => {
  assert.equal(isMaterialListCurrent('v1|t|10', 'v1|t|10', 10), true);
  assert.equal(isMaterialListCurrent('v1|t|10', 'v2|t|10', 10), false);
  assert.equal(isMaterialListCurrent(null, 'v1|t|10', 10), false);
  assert.equal(isMaterialListCurrent('v1|t|10', null, 10), false, 'no server version is not proof of freshness');
  assert.equal(isMaterialListCurrent('v1|t|10', 'v1|t|10', 0), false);
});

test('templateCopyName never hangs on a long name and stays within 60 characters', () => {
  const long = '가'.repeat(58);
  const name = templateCopyName(long, [long]);
  assert.ok(name.length <= 60);
  assert.equal(templateNameError(name, [long]), '');
  assert.equal(templateCopyName('30평형', ['30평형', '30평형 복사']), '30평형 복사 2');
  assert.equal(templateCopyName('30평형', ['30평형']), '30평형 복사');
});

test('repickTemplateLine puts the DB pick in place of a line and keeps its 공간·수량·비고', () => {
  const lines = [line({ id: 'a', name: '앞' }), line({ id: 'b', space: '욕실', quantity: 4, note: '벽', name: '실리콘' }), line({ id: 'c', name: '뒤' })];
  const picked = [
    line({ id: 'p1', name: '줄눈 시공', category: '욕실', unit: '식', customerUnitPrice: 9000, executionUnitPrice: 9000, materialId: 'm3', commonName: true }),
    line({ id: 'p2', name: '실리콘 시공', category: '욕실', unit: '식', customerUnitPrice: 9000, executionUnitPrice: 9000, materialId: 'm3', commonName: true }),
  ];
  const next = repickTemplateLine(lines, 'b', picked);
  assert.deepEqual(next.map((l) => l.id), ['a', 'b', 'p2', 'c']);
  assert.deepEqual(pick(next[1], ['space', 'quantity', 'note', 'name', 'materialId', 'customerUnitPrice']), { space: '욕실', quantity: 4, note: '벽', name: '줄눈 시공', materialId: 'm3', customerUnitPrice: 9000 });
  assert.equal(next[2].space, '욕실', 'extra rows of a 공통 pick take the 공간 of the line');
  assert.deepEqual(repickTemplateLine(lines, 'gone', picked), lines, 'a line that is no longer there changes nothing');
});

const grouped = () => [
  line({ id: 'a', category: '철거 공사', quantity: 2, customerUnitPrice: 500, executionUnitPrice: 400 }),
  line({ id: 'b', category: '욕실 공사', customerUnitPrice: 100, executionUnitPrice: 80 }),
  line({ id: 'c', category: '철거 공사', customerUnitPrice: 10, executionUnitPrice: 10 }),
  line({ id: 'd', category: '', process: '도배', customerUnitPrice: 1, executionUnitPrice: 1 }),
  line({ id: 'e', category: ' ', process: '' }),
];

test('lines group by 카테고리, else 공정, else 기타 공사, in first-appearance order with subtotals', () => {
  assert.equal(templateGroupLabel(line({ category: ' 욕실 공사 ' })), '욕실 공사');
  assert.equal(templateGroupLabel(line({ category: '', process: '도배' })), '도배');
  assert.equal(templateGroupLabel(line({})), '기타 공사');
  const groups = groupTemplateLines(grouped());
  assert.deepEqual(groups.map((g) => [g.label, g.lines.map((l) => l.id)]), [['철거 공사', ['a', 'c']], ['욕실 공사', ['b']], ['도배', ['d']], ['기타 공사', ['e']]]);
  assert.deepEqual(pick(groups[0], ['customerTotal', 'executionTotal']), { customerTotal: 1010, executionTotal: 810 });
});

test('moving a 공사 moves all its lines past the neighbouring 공사', () => {
  const ids = (lines) => lines.map((l) => l.id);
  assert.deepEqual(ids(moveTemplateGroup(grouped(), '욕실 공사', -1)), ['b', 'a', 'c', 'd', 'e']);
  assert.deepEqual(ids(moveTemplateGroup(grouped(), '철거 공사', 1)), ['b', 'a', 'c', 'd', 'e']);
  assert.deepEqual(ids(moveTemplateGroup(grouped(), '철거 공사', -1)), ['a', 'c', 'b', 'd', 'e'], 'the first 공사 cannot go up; lines are only gathered');
  assert.deepEqual(ids(moveTemplateGroup(grouped(), '없는 공사', 1)), ['a', 'c', 'b', 'd', 'e']);
});

test('a line moves only within its own 공사', () => {
  const ids = (lines) => lines.map((l) => l.id);
  assert.deepEqual(ids(moveTemplateLineInGroup(grouped(), 'c', -1)), ['c', 'a', 'b', 'd', 'e']);
  assert.deepEqual(ids(moveTemplateLineInGroup(grouped(), 'a', -1)), ['a', 'c', 'b', 'd', 'e'], 'the first line of a 공사 stays first');
  assert.deepEqual(ids(moveTemplateLineInGroup(grouped(), 'c', 1)), ['a', 'c', 'b', 'd', 'e'], 'the last line does not jump into the next 공사');
});

test('changing a line’s 카테고리 moves it to the end of that 공사, or to a new 공사 at the end', () => {
  const ids = (lines) => lines.map((l) => [l.id, l.category]);
  assert.deepEqual(ids(setTemplateLineCategory(grouped(), 'b', '철거 공사')).slice(0, 3), [['a', '철거 공사'], ['c', '철거 공사'], ['b', '철거 공사']]);
  const moved = setTemplateLineCategory(grouped(), 'a', '가구공사');
  assert.deepEqual(moved.map((l) => l.id), ['c', 'b', 'd', 'e', 'a']);
  assert.equal(moved[4].category, '가구공사');
  assert.deepEqual(setTemplateLineCategory(grouped(), 'a', ' 철거 공사 ').map((l) => l.id), ['a', 'c', 'b', 'd', 'e'], 'the same 공사 keeps the line where it is');
});

test('lines added to a 공사 go after its last line and take its 카테고리', () => {
  const added = insertIntoTemplateGroup(grouped(), '철거 공사', [line({ id: 'n1', category: '타일' }), line({ id: 'n2' })]);
  assert.deepEqual(added.map((l) => l.id), ['a', 'c', 'n1', 'n2', 'b', 'd', 'e']);
  assert.deepEqual([added[2].category, added[3].category], ['철거 공사', '철거 공사']);
  const fresh = insertIntoTemplateGroup(grouped(), '가구공사', [line({ id: 'n3' })]);
  assert.deepEqual(fresh.map((l) => l.id), ['a', 'c', 'b', 'd', 'e', 'n3'], 'a new 공사 starts at the end');
  assert.equal(fresh[5].category, '가구공사');
});

test('an older template opens with each 공사 gathered, in first-appearance order', () => {
  assert.deepEqual(orderTemplateLinesByGroup(grouped()).map((l) => l.id), ['a', 'c', 'b', 'd', 'e']);
  assert.deepEqual(orderTemplateLinesByGroup([]), []);
});

test('renaming a 공사 renames every line, and an existing name merges after it', () => {
  const renamed = renameTemplateGroup(grouped(), '철거 공사', '해체 공사');
  assert.deepEqual(groupTemplateLines(renamed).map((g) => [g.label, g.lines.map((l) => l.id)]), [['해체 공사', ['a', 'c']], ['욕실 공사', ['b']], ['도배', ['d']], ['기타 공사', ['e']]]);
  const merged = renameTemplateGroup(grouped(), '철거 공사', ' 욕실 공사 ');
  assert.deepEqual(groupTemplateLines(merged).map((g) => [g.label, g.lines.map((l) => l.id)]), [['욕실 공사', ['b', 'a', 'c']], ['도배', ['d']], ['기타 공사', ['e']]]);
  assert.equal(renameTemplateGroup(grouped(), '도배', '도배 공사').find((l) => l.id === 'd').category, '도배 공사', 'a 공정-labelled 공사 gets a 카테고리');
  assert.deepEqual(renameTemplateGroup(grouped(), '철거 공사', '  ').map((l) => l.id), grouped().map((l) => l.id));
  assert.equal(templateGroupExists(grouped(), ' 욕실 공사'), true);
  assert.equal(templateGroupExists(grouped(), '가구공사'), false);
});

test('copying a 공사 puts new-id lines right after it under the new name', () => {
  assert.equal(templateCopyGroupName('욕실 공사', ['욕실 공사', '욕실 공사 복사']), '욕실 공사 복사 2');
  assert.equal(templateCopyGroupName('욕실 공사', ['욕실 공사']), '욕실 공사 복사');
  let n = 0;
  const copied = copyTemplateGroup(grouped(), '철거 공사', '철거 공사 복사', () => `n${++n}`);
  assert.deepEqual(copied.map((l) => l.id), ['a', 'c', 'n1', 'n2', 'b', 'd', 'e']);
  assert.deepEqual(copied.slice(2, 4).map((l) => [l.category, l.customerUnitPrice]), [['철거 공사 복사', 500], ['철거 공사 복사', 10]]);
});

test('removing a 공사 reports the removed ids', () => {
  const { lines, removedIds } = removeTemplateGroup(grouped(), '철거 공사');
  assert.deepEqual(lines.map((l) => l.id), ['b', 'd', 'e']);
  assert.deepEqual(removedIds, ['a', 'c']);
});

test('a duplicated line sits right below the original', () => {
  assert.deepEqual(duplicateTemplateLine(grouped(), 'a', () => 'z').map((l) => l.id), ['a', 'z', 'c', 'b', 'd', 'e']);
  assert.deepEqual(duplicateTemplateLine(grouped(), 'gone', () => 'z').map((l) => l.id), ['a', 'b', 'c', 'd', 'e'], 'a missing line changes nothing');
});

test('dragging a line only lands inside its own 공사', () => {
  const lines = [...grouped(), line({ id: 'f', category: '철거 공사' })];
  const ids = (ls) => ls.map((l) => l.id);
  assert.deepEqual(ids(moveTemplateLineBefore(lines, 'f', 'a')).slice(0, 3), ['f', 'a', 'c']);
  assert.deepEqual(ids(moveTemplateLineBefore(lines, 'a', null)).slice(0, 3), ['c', 'f', 'a']);
  assert.deepEqual(ids(moveTemplateLineBefore(lines, 'a', 'b')), ids(lines), 'another 공사 is not a drop target');
});

test('dragging a 공사 moves it before another, or to the end', () => {
  const labels = (ls) => groupTemplateLines(ls).map((g) => g.label);
  assert.deepEqual(labels(moveTemplateGroupBefore(grouped(), '도배', '철거 공사')), ['도배', '철거 공사', '욕실 공사', '기타 공사']);
  assert.deepEqual(labels(moveTemplateGroupBefore(grouped(), '철거 공사', null)), ['욕실 공사', '도배', '기타 공사', '철거 공사']);
});

test('the 기본견적 공사 stays first and neighbouring 공사 never share a color', () => {
  const pinned = pinBaseGroupFirst(grouped(), (l) => l.id === 'd');
  assert.deepEqual(groupTemplateLines(pinned).map((g) => g.label), ['도배', '철거 공사', '욕실 공사', '기타 공사']);
  assert.equal(GROUP_COLORS.length, 8);
  for (let i = 0; i < 20; i += 1) assert.notDeepEqual(groupColor(i), groupColor(i + 1));
});

test('the 세부내역서 keeps only lines with a 품명 and survives saved lines missing fields', () => {
  const saved = [{ id: 'x' }, line({ id: 'y', name: '  ' }), line({ id: 'z', name: '타일' }), { id: 'w', name: null }];
  assert.deepEqual(namedTemplateLines(saved).map((l) => l.id), ['z']);
  assert.equal(templateLineLabel({ id: 'q' }), '이 항목');
  assert.equal(templateLineLabel(line({ name: '타일', spec: '600각' })), '타일 · 600각');
});

test('area units are recognised loosely', () => {
  for (const unit of ['m2', 'M2', ' ㎡ ', 'm²', '평', 'm 2']) assert.equal(isAreaUnit(unit), true, unit);
  for (const unit of ['m', '식', 'EA', 'SET', '']) assert.equal(isAreaUnit(unit), false, unit);
});

test('scaling changes only ticked units and rounds to one decimal', () => {
  const lines = [line({ id: 'a', unit: 'm2', quantity: 20 }), line({ id: 'b', unit: '식', quantity: 1 }), line({ id: 'c', unit: 'm', quantity: 7 })];
  const { lines: out, scaledCount } = scaleTemplateQuantities(lines, 33 / 30, ['m2', 'm']);
  assert.deepEqual(out.map((l) => l.quantity), [22, 1, 7.7]);
  assert.equal(scaledCount, 2);
  assert.deepEqual(scaleTemplateQuantities(lines, 0, ['m2']).lines.map((l) => l.quantity), [20, 1, 7]);
  assert.deepEqual(scaleTemplateQuantities(lines, Number.NaN, ['m2']).lines.map((l) => l.quantity), [20, 1, 7]);
  assert.deepEqual(templateUnitOptions(lines), [{ unit: 'm2', count: 1, area: true }, { unit: '식', count: 1, area: false }, { unit: 'm', count: 1, area: false }]);
  assert.deepEqual(templateUnitOptions([line({ unit: ' ' }), line({ unit: 'm2' }), line({ unit: 'm2' })]), [{ unit: 'm2', count: 2, area: true }]);
});

test('기준 평형 is optional and must be 1–500', () => {
  for (const ok of ['', null, undefined, 1, 30, '24.5', ' 30 ', 500]) assert.equal(templateBaseAreaError(ok), '', String(ok));
  for (const bad of [0, -3, 501, 'abc']) assert.notEqual(templateBaseAreaError(bad), '', String(bad));
  assert.equal(normalizeBaseArea(' 30 '), 30);
  assert.equal(normalizeBaseArea(''), null);
  assert.equal(normalizeBaseArea(null), null);
});

test('the 평형 ratio needs both areas as positive numbers', () => {
  assert.equal(templateAreaRatio('30', '33'), 1.1);
  assert.ok(Number.isNaN(templateAreaRatio('30', '')));
  assert.ok(Number.isNaN(templateAreaRatio('', '33')));
  assert.ok(Number.isNaN(templateAreaRatio('0', '33')));
  assert.ok(Number.isNaN(templateAreaRatio('abc', '33')));
});

test('lines added while a 공간 filter is on take that 공간, so they stay in view', () => {
  const added = [line({ id: 'a', space: '' }), line({ id: 'b', space: '거실' })];
  assert.deepEqual(withTemplateSpace(added, '욕실').map((l) => l.space), ['욕실', '욕실']);
  assert.equal(withTemplateSpace(added, ''), added, 'no filter changes nothing');
});

test('renaming to a name that differs only in spaces or case merges into the existing 공사', () => {
  assert.equal(findTemplateGroupLabel(grouped(), '욕실공사'), '욕실 공사');
  assert.equal(findTemplateGroupLabel(grouped(), '가구공사'), null);
  assert.equal(templateGroupExists(grouped(), '욕실공사'), true);
  const merged = renameTemplateGroup(grouped(), '철거 공사', '욕실공사');
  assert.deepEqual(groupTemplateLines(merged).map((g) => [g.label, g.lines.map((l) => l.id)]), [['욕실 공사', ['b', 'a', 'c']], ['도배', ['d']], ['기타 공사', ['e']]]);
  assert.ok(merged.filter((l) => ['a', 'c'].includes(l.id)).every((l) => l.category === '욕실 공사'), 'merged lines take the existing name');
});

test('appending lines keeps blank rows the user already added', () => {
  const current = [line({ id: 'a', category: '도배', name: '벽지' }), line({ id: 'blank', category: '도배' })];
  const out = appendTemplateLines(current, [line({ id: 'n', category: '도배', name: '합지' })]);
  assert.deepEqual(out.map((l) => l.id), ['a', 'blank', 'n']);
});

test('기준 평형 accepts only plain numbers', () => {
  for (const bad of [true, [30], '1e2', '30평', '0x1f']) assert.notEqual(templateBaseAreaError(bad), '', String(bad));
  for (const ok of [30, 24.5, '24.5', ' 30 ', '']) assert.equal(templateBaseAreaError(ok), '', String(ok));
});
