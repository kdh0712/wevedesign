import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, isPasswordHash, safeEqual, verifyPassword } from '../app/api/manager/_password.ts';

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
