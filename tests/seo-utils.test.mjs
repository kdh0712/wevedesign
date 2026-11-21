import test from 'node:test';
import assert from 'node:assert/strict';
import { findProjectByOldSlug, projectPath, projectSlug } from '../app/lib/seo-utils.ts';

// A 시공 사례 address is its category and name plus the last 8 characters of its id; after a rename the old address still
// ends with the same 8 characters, so it can be sent on to the new one.

test('findProjectByOldSlug finds the one project whose id ends with the address suffix', () => {
  const project = { id: 'project-0123456789abcdef01234567', title: '평촌 34평', categoryTitle: '아파트' };
  assert.equal(findProjectByOldSlug('아파트-예전-이름-01234567', [project]), project);
  assert.equal(projectSlug(project).endsWith('01234567'), true, 'the canonical slug ends with the same suffix');
});

test('findProjectByOldSlug refuses ambiguous or malformed addresses', () => {
  const a = { id: 'project-aaaa01234567' };
  const b = { id: 'project-bbbb01234567' };
  assert.equal(findProjectByOldSlug('x-01234567', [a, b]), null, 'two projects share the suffix');
  assert.equal(findProjectByOldSlug('x-0123', [a]), null);
  assert.equal(findProjectByOldSlug('', [a]), null);
  assert.equal(findProjectByOldSlug('x-zzzzzzzz', [a]), null);
});

test('findProjectByOldSlug compares in lower case, like the address', () => {
  const project = { _id: 'project-XXABCD1234' };
  assert.equal(findProjectByOldSlug('old-abcd1234', [project]), project);
});

test('canonicalRedirectPath is an ASCII path a Location header can carry', async () => {
  const { canonicalRedirectPath } = await import('../app/lib/seo-utils.ts');
  const project = { id: 'project-0123456789abcdef01234567', title: '평촌 34평', categoryTitle: '아파트' };
  const path = canonicalRedirectPath(project);
  assert.match(path, /^[\x21-\x7e]+$/, 'only visible ASCII characters');
  assert.equal(decodeURI(path), projectPath(project));
});
