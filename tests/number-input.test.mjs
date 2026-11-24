import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTypedNumber, parseTypedNumber, reformatWithCaret } from '../app/lib/number-input.ts';

// Money and quantity fields show thousands commas while typing (10,000), with the caret kept where the person was typing.

test('formatTypedNumber: commas in the whole part as it is typed', () => {
  assert.equal(formatTypedNumber(''), '');
  assert.equal(formatTypedNumber('1'), '1');
  assert.equal(formatTypedNumber('1000'), '1,000');
  assert.equal(formatTypedNumber('1234567'), '1,234,567');
  assert.equal(formatTypedNumber('1,23,4567'), '1,234,567');
  assert.equal(formatTypedNumber('32000원'), '32,000');
  assert.equal(formatTypedNumber(' 1 000 '), '1,000');
});

test('formatTypedNumber: a decimal point and a leading minus stay while typing', () => {
  assert.equal(formatTypedNumber('1234.5'), '1,234.5');
  assert.equal(formatTypedNumber('1234.'), '1,234.');
  assert.equal(formatTypedNumber('0.25'), '0.25');
  assert.equal(formatTypedNumber('.5'), '0.5');
  assert.equal(formatTypedNumber('1.2.3'), '1.23');
  assert.equal(formatTypedNumber('-'), '-');
  assert.equal(formatTypedNumber('-12000'), '-12,000');
  assert.equal(formatTypedNumber('12-3'), '123');
  // Leading zeros go, but a lone 0 (or 0.) stays.
  assert.equal(formatTypedNumber('007'), '7');
  assert.equal(formatTypedNumber('0'), '0');
  assert.equal(formatTypedNumber('0.'), '0.');
});

test('formatTypedNumber: fields without decimals or minus drop them', () => {
  assert.equal(formatTypedNumber('1234.5', { decimals: false }), '12,345');
  assert.equal(formatTypedNumber('-500', { negative: false }), '500');
});

test('parseTypedNumber: the number behind the text', () => {
  assert.equal(parseTypedNumber('1,234,567'), 1234567);
  assert.equal(parseTypedNumber('1,234.5'), 1234.5);
  assert.equal(parseTypedNumber('-12,000'), -12000);
  for (const text of ['', '-', '.', '-.']) assert.equal(parseTypedNumber(text), 0, text);
});

test('reformatWithCaret: the caret stays after the same digit', () => {
  // Typing the 4th digit at the end: 100|0 → 1,000|
  assert.deepEqual(reformatWithCaret('1000', 4), { text: '1,000', caret: 5 });
  // Typing 5 in the middle of 1,000 → "1,0500" with the caret after the 5 → 10,500 with the caret after the 5.
  assert.deepEqual(reformatWithCaret('1,0500', 4), { text: '10,500', caret: 4 });
  // Deleting a digit: 12,345 → remove the 3 → "12,45" caret 3 → 1,245 caret after "1,2".
  assert.deepEqual(reformatWithCaret('12,45', 3), { text: '1,245', caret: 3 });
  // Caret at the start stays at the start.
  assert.deepEqual(reformatWithCaret('91000', 1), { text: '91,000', caret: 1 });
  assert.deepEqual(reformatWithCaret('', 0), { text: '', caret: 0 });
  // Decimals: 1234.5 caret at the end.
  assert.deepEqual(reformatWithCaret('1234.5', 6), { text: '1,234.5', caret: 7 });
});
