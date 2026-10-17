import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, isPasswordHash, parseStoredHash, safeEqual, verifyPassword, verifyPasswordOrDummy } from '../app/api/manager/_password.ts';

test('a login ID without a stored password still spends a full hash computation', async () => {
  await verifyPasswordOrDummy('warm-up', undefined);
  for (const stored of [undefined, '']) {
    const started = performance.now();
    assert.deepEqual(await verifyPasswordOrDummy('pw', stored), { ok: false, needsRehash: false });
    assert.ok(performance.now() - started >= 5, 'expected the dummy scrypt run to take measurable time');
  }
  assert.deepEqual(await verifyPasswordOrDummy('pw', await hashPassword('pw')), { ok: true, needsRehash: false });
});

test('stored hash parameters are bounded before any hashing', () => {
  assert.equal(parseStoredHash('scrypt$16384$8$1$c2FsdHNhbHQ=$aGFzaGhhc2g=')?.N, 16384);
  for (const oversized of [
    'scrypt$262144$8$1$c2FsdHNhbHQ=$aGFzaGhhc2g=',
    'scrypt$16384$32$1$c2FsdHNhbHQ=$aGFzaGhhc2g=',
    'scrypt$16384$8$8$c2FsdHNhbHQ=$aGFzaGhhc2g=',
    'scrypt$3$8$1$c2FsdHNhbHQ=$aGFzaGhhc2g=',
  ]) {
    assert.equal(parseStoredHash(oversized), null, oversized);
  }
});

test('hashes use the scrypt format with a random salt', async () => {
  const first = await hashPassword('pw');
  const second = await hashPassword('pw');
  assert.match(first, /^scrypt\$16384\$8\$1\$[^$]+\$[^$]+$/);
  assert.notEqual(first, second);
  assert.equal(isPasswordHash(first), true);
  assert.equal(isPasswordHash('pw'), false);
});

test('verifies hashed passwords', async () => {
  const stored = await hashPassword('pw');
  assert.deepEqual(await verifyPassword('pw', stored), { ok: true, needsRehash: false });
  assert.equal((await verifyPassword('nope', stored)).ok, false);
  assert.equal((await verifyPassword('pw', 'scrypt$broken')).ok, false);
});

test('accepts legacy plaintext once and asks for a rehash', async () => {
  assert.deepEqual(await verifyPassword('pw', 'pw'), { ok: true, needsRehash: true });
  assert.equal((await verifyPassword('pw', '')).ok, false);
  assert.equal((await verifyPassword('x', 'pw')).ok, false);
});

test('safeEqual compares values of any length', () => {
  assert.equal(safeEqual('a', 'a'), true);
  assert.equal(safeEqual('a', 'b'), false);
  assert.equal(safeEqual('a', 'aa'), false);
});
