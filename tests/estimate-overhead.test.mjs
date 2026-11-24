import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_OVERHEAD_RATE, normalizeOverheadRate, overheadAmount, overheadLabel } from '../app/lib/estimate-overhead.ts';

test('a new estimate starts at 3%', () => {
  assert.equal(DEFAULT_OVERHEAD_RATE, 3);
});

test('normalizeOverheadRate keeps 0-20% to one decimal and reads anything else as 0', () => {
  assert.equal(normalizeOverheadRate(3), 3);
  assert.equal(normalizeOverheadRate('2.5'), 2.5);
  assert.equal(normalizeOverheadRate(' 3 '), 3);
  assert.equal(normalizeOverheadRate(2.55), 2.6);
  assert.equal(normalizeOverheadRate(20), 20);
  for (const value of [-1, 21, 'abc', undefined, null, '', NaN, Infinity]) {
    assert.equal(normalizeOverheadRate(value), 0, String(value));
  }
});

test('overheadAmount is the construction total times the rate, rounded to the won', () => {
  assert.equal(overheadAmount(8471000, 3), 254130);
  assert.equal(overheadAmount(1000, 2.5), 25);
  assert.equal(overheadAmount(0, 3), 0);
  assert.equal(overheadAmount(8471000, 0), 0);
  assert.equal(overheadAmount(-10000, 3), -300, 'a discount-heavy estimate gives a negative amount, never NaN');
  assert.equal(Object.is(overheadAmount(-10, 3), -0), false, 'no -0');
});

test('overheadLabel shows the rate without trailing zeros', () => {
  assert.equal(overheadLabel(3), '공과잡비 (3%)');
  assert.equal(overheadLabel(2.5), '공과잡비 (2.5%)');
});
