import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMON_OPTION_MAX_LENGTH,
  COMMON_OPTIONS_MAX_COUNT,
  appendCommonOption,
  buildCommonBulkLines,
  commonOptionsForSave,
  defaultCommonBulkRows,
  formatCommonOptions,
  isCommonMaterialName,
  parseCommonOptions,
  placeCommonBulkLines,
  replaceLineAt,
  sanitizeCommonOptions,
  validateCommonBulkRows,
} from '../app/lib/estimate-common-options.ts';

test('parseCommonOptions splits lines, trims, strips list markers, drops empties and duplicates in order', () => {
  const text = ['1. 안방 욕실', '  2) 거실 욕실  ', '', '- 다용도실', '• 현관', '   ', '3.거실 욕실', '안방 욕실', '· 발코니', '* 드레스룸'].join('\n');
  assert.deepEqual(parseCommonOptions(text), ['안방 욕실', '거실 욕실', '다용도실', '현관', '발코니', '드레스룸']);
});

test('parseCommonOptions keeps numbers that are part of the name', () => {
  assert.deepEqual(parseCommonOptions('1.5m 타일\n12. 2층 욕실\n300x600 타일'), ['1.5m 타일', '2층 욕실', '300x600 타일']);
});

test('parseCommonOptions collapses inner whitespace', () => {
  assert.deepEqual(parseCommonOptions('안방   욕실\t벽'), ['안방 욕실 벽']);
});

test('parseCommonOptions caps the item count and the item length', () => {
  const many = Array.from({ length: 70 }, (_, index) => `항목 ${index + 1}`).join('\n');
  const parsed = parseCommonOptions(many);
  assert.equal(COMMON_OPTIONS_MAX_COUNT, 50);
  assert.equal(parsed.length, 50);
  assert.equal(parsed[0], '항목 1');
  assert.equal(parsed[49], '항목 50');

  assert.equal(COMMON_OPTION_MAX_LENGTH, 60);
  const long = '가'.repeat(80);
  assert.deepEqual(parseCommonOptions(long), ['가'.repeat(60)]);
});

test('parseCommonOptions removes duplicates that only appear after the length cap', () => {
  const base = '나'.repeat(60);
  assert.deepEqual(parseCommonOptions(`${base}A\n${base}B`), [base]);
});

test('parseCommonOptions handles CRLF and lone CR input', () => {
  assert.deepEqual(parseCommonOptions('1. 안방 욕실\r\n2. 거실 욕실\r\n'), ['안방 욕실', '거실 욕실']);
  assert.deepEqual(parseCommonOptions('안방\r거실'), ['안방', '거실']);
});

test('parseCommonOptions returns an empty list for blank text', () => {
  assert.deepEqual(parseCommonOptions(''), []);
  assert.deepEqual(parseCommonOptions('\n  \n-\n1.'), []);
});

test('formatCommonOptions writes one option per line and round-trips', () => {
  const options = ['안방 욕실', '거실 욕실', '다용도실'];
  assert.equal(formatCommonOptions(options), '안방 욕실\n거실 욕실\n다용도실');
  assert.deepEqual(parseCommonOptions(formatCommonOptions(options)), options);
  assert.equal(formatCommonOptions(undefined), '');
  assert.equal(formatCommonOptions([]), '');
});

test('sanitizeCommonOptions returns undefined when the field is absent or not an array', () => {
  assert.equal(sanitizeCommonOptions(undefined), undefined);
  assert.equal(sanitizeCommonOptions(null), undefined);
  assert.equal(sanitizeCommonOptions('안방 욕실'), undefined);
  assert.equal(sanitizeCommonOptions({ 0: '안방 욕실' }), undefined);
});

test('sanitizeCommonOptions drops non-string entries', () => {
  assert.deepEqual(sanitizeCommonOptions(['안방 욕실', 3, null, { name: '거실' }, ['현관'], '거실 욕실']), ['안방 욕실', '거실 욕실']);
  assert.deepEqual(sanitizeCommonOptions([]), []);
});

test('sanitizeCommonOptions applies the same rules as parseCommonOptions', () => {
  const raw = [' 1. 안방 욕실 ', '2) 거실 욕실', '', '- 안방 욕실', '라'.repeat(70), '현관\n신발장'];
  assert.deepEqual(sanitizeCommonOptions(raw), ['안방 욕실', '거실 욕실', '라'.repeat(60), '현관 신발장']);
  const many = Array.from({ length: 55 }, (_, index) => `항목 ${index + 1}`);
  assert.equal(sanitizeCommonOptions(many)?.length, 50);
});

test('isCommonMaterialName ignores spaces', () => {
  assert.equal(isCommonMaterialName('공통'), true);
  assert.equal(isCommonMaterialName(' 공 통 '), true);
  assert.equal(isCommonMaterialName('공통 자재'), false);
  assert.equal(isCommonMaterialName(undefined), false);
});

test('commonOptionsForSave stores sanitized options only for a 공통 name', () => {
  assert.deepEqual(commonOptionsForSave('공통', ['1. 안방 욕실', '안방 욕실', 7, '거실 욕실']), ['안방 욕실', '거실 욕실']);
  assert.deepEqual(commonOptionsForSave(' 공 통', ['안방 욕실']), ['안방 욕실']);
  assert.deepEqual(commonOptionsForSave('공통', []), []);
});

test('commonOptionsForSave stores an empty list for any other name', () => {
  assert.deepEqual(commonOptionsForSave('타일', ['안방 욕실']), []);
  assert.deepEqual(commonOptionsForSave('', []), []);
});

test('commonOptionsForSave omits the field when the request leaves it out', () => {
  assert.equal(commonOptionsForSave('공통', undefined), undefined);
  assert.equal(commonOptionsForSave('공통', 'not a list'), undefined);
  assert.equal(commonOptionsForSave('타일', undefined), undefined);
});

test('appendCommonOption adds the typed name once, after the saved options', () => {
  assert.deepEqual(appendCommonOption(['안방 욕실', '거실 욕실'], '현관'), ['안방 욕실', '거실 욕실', '현관']);
  assert.deepEqual(appendCommonOption(['안방 욕실', '거실 욕실'], ' 거실 욕실 '), ['안방 욕실', '거실 욕실']);
  assert.deepEqual(appendCommonOption(undefined, '현관'), ['현관']);
  assert.deepEqual(appendCommonOption(['안방 욕실'], ''), ['안방 욕실']);
  assert.deepEqual(appendCommonOption(undefined, '  '), []);
});

test('defaultCommonBulkRows starts each option at quantity 1 with the material price', () => {
  assert.deepEqual(defaultCommonBulkRows(['안방 욕실', '거실 욕실'], 35000), [
    { name: '안방 욕실', quantity: 1, customerUnitPrice: 35000, executionUnitPrice: 35000, note: '' },
    { name: '거실 욕실', quantity: 1, customerUnitPrice: 35000, executionUnitPrice: 35000, note: '' },
  ]);
  assert.deepEqual(defaultCommonBulkRows(['현관'], undefined), [{ name: '현관', quantity: 1, customerUnitPrice: 0, executionUnitPrice: 0, note: '' }]);
});

const template = {
  id: 'template',
  space: '거실',
  category: '욕실 공사',
  process: '설비',
  name: '',
  spec: '300x600',
  unit: 'EA',
  quantity: 3,
  customerUnitPrice: 35000,
  executionUnitPrice: 35000,
  note: '템플릿 비고',
  commonName: true,
};

const rows = [
  { name: ' 안방 욕실 ', quantity: 2, customerUnitPrice: 40000, executionUnitPrice: 30000, note: '벽만' },
  { name: '거실 욕실', quantity: 1.5, customerUnitPrice: 35000, executionUnitPrice: 35000, note: '' },
  { name: '다용도실', quantity: 0, customerUnitPrice: 0, executionUnitPrice: 0, note: '' },
];

const counterIds = () => {
  let next = 0;
  return () => `new-${++next}`;
};

test('buildCommonBulkLines gives one common line per row with the shared fields and the row values', () => {
  const lines = buildCommonBulkLines(template, { space: '욕실', spec: '600x600', unit: 'm2' }, rows, counterIds());
  assert.equal(lines.length, 3);
  assert.deepEqual(lines[0], {
    id: 'new-1',
    space: '욕실',
    category: '욕실 공사',
    process: '설비',
    name: '안방 욕실',
    spec: '600x600',
    unit: 'm2',
    quantity: 2,
    customerUnitPrice: 40000,
    executionUnitPrice: 30000,
    note: '벽만',
    commonName: true,
  });
  assert.deepEqual(lines.map((line) => line.id), ['new-1', 'new-2', 'new-3']);
  assert.deepEqual(lines.map((line) => line.name), ['안방 욕실', '거실 욕실', '다용도실']);
  assert.ok(lines.every((line) => line.commonName === true && line.space === '욕실' && line.category === '욕실 공사' && line.process === '설비'));
  assert.deepEqual(lines.map((line) => line.quantity), [2, 1.5, 0]);
  assert.equal(lines[1].note, '');
});

test('buildCommonBulkLines marks lines common even when the template was not', () => {
  const lines = buildCommonBulkLines({ ...template, commonName: false }, { space: '', spec: '', unit: '' }, rows.slice(0, 1), counterIds());
  assert.equal(lines[0].commonName, true);
});

test('validateCommonBulkRows accepts complete rows', () => {
  assert.equal(validateCommonBulkRows(rows), '');
});

test('validateCommonBulkRows reports an empty 품명', () => {
  const message = validateCommonBulkRows([rows[0], { ...rows[1], name: '   ' }]);
  assert.equal(message, '2번째 항목의 품명을 입력해주세요.');
});

test('validateCommonBulkRows reports a negative or invalid quantity', () => {
  assert.equal(validateCommonBulkRows([{ ...rows[0], quantity: -1 }]), '1번째 항목의 수량은 0 이상으로 입력해주세요.');
  assert.equal(validateCommonBulkRows([rows[0], rows[1], { ...rows[2], quantity: Number.NaN }]), '3번째 항목의 수량은 0 이상으로 입력해주세요.');
});

test('validateCommonBulkRows reports an empty list', () => {
  assert.equal(validateCommonBulkRows([]), '추가할 공통 항목이 없습니다.');
});

const existing = [
  { id: 'a', name: 'A' },
  { id: 'b', name: 'B' },
  { id: 'c', name: 'C' },
];
const added = [
  { id: 'n1', name: 'N1' },
  { id: 'n2', name: 'N2' },
  { id: 'n3', name: 'N3' },
];

test('replaceLineAt keeps the original id for row 1 and puts the rest right after it', () => {
  assert.deepEqual(replaceLineAt(existing, 1, added), [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'N1' },
    { id: 'n2', name: 'N2' },
    { id: 'n3', name: 'N3' },
    { id: 'c', name: 'C' },
  ]);
  assert.deepEqual(replaceLineAt(existing, 0, added.slice(0, 1)), [
    { id: 'a', name: 'N1' },
    { id: 'b', name: 'B' },
    { id: 'c', name: 'C' },
  ]);
  assert.deepEqual(replaceLineAt(existing, 2, added.slice(0, 2)).map((line) => line.id), ['a', 'b', 'c', 'n2']);
});

test('replaceLineAt appends when the index is outside the list', () => {
  assert.deepEqual(replaceLineAt(existing, -1, added).map((line) => line.id), ['a', 'b', 'c', 'n1', 'n2', 'n3']);
  assert.deepEqual(replaceLineAt(existing, 3, added).map((line) => line.id), ['a', 'b', 'c', 'n1', 'n2', 'n3']);
});

test('replaceLineAt does not change the input lists', () => {
  const before = JSON.stringify(existing);
  replaceLineAt(existing, 1, added);
  assert.equal(JSON.stringify(existing), before);
});

test('placeCommonBulkLines replaces the target line in place', () => {
  assert.deepEqual(placeCommonBulkLines(existing, added, 'b').map((line) => line.id), ['a', 'b', 'n2', 'n3', 'c']);
  assert.equal(placeCommonBulkLines(existing, added, 'b')[1].name, 'N1');
});

test('placeCommonBulkLines appends to the end without a target', () => {
  assert.deepEqual(placeCommonBulkLines(existing, added, '').map((line) => line.id), ['a', 'b', 'c', 'n1', 'n2', 'n3']);
  assert.deepEqual(placeCommonBulkLines(existing, added, 'missing').map((line) => line.id), ['a', 'b', 'c', 'n1', 'n2', 'n3']);
  assert.deepEqual(placeCommonBulkLines([], added, '').map((line) => line.id), ['n1', 'n2', 'n3']);
});
