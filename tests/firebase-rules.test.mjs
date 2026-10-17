import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rules = JSON.parse(readFileSync(new URL('../firebase-database.rules.json', import.meta.url), 'utf8')).rules;
const user = rules.users.$uid;

test('staff cannot write their own role, permissions or active state', () => {
  assert.equal(user['.write'].includes('auth.uid === $uid'), false);
  for (const field of ['role', 'permissions', 'isActive']) assert.equal(user[field], undefined, field);
});

test('fields users write about themselves only accept short strings', () => {
  for (const field of ['name', 'updatedAt', 'createdAt']) {
    assert.match(user[field]['.validate'] || '', /^newData\.isString\(\) && newData\.val\(\)\.length < \d+$/, field);
  }
});

test('email can only be the signed-in account email unless an admin writes it', () => {
  const rule = user.email['.validate'] || '';
  assert.match(rule, /newData\.val\(\) === auth\.token\.email/);
  assert.match(rule, /launcher_admins/);
});
