import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { moveInOrder, readProjectOrder, sortProjectsByOrder } from '../app/lib/project-order.ts';

// 시공 사례 순서 변경 (spec docs/superpowers/specs/2026-11-27-project-order-drag-design.md).

test('sortProjectsByOrder: by 보이는 순서, projects without one last, then the given (newest first) order', () => {
  const projects = [
    { _id: 'new', featured: false },
    { _id: 'b', displayOrder: 2, featured: false },
    { _id: 'main', displayOrder: 3, featured: true },
    { _id: 'a', displayOrder: 1 },
    { _id: 'old' },
    { _id: 'zero', displayOrder: 0 },
  ];
  assert.deepEqual(sortProjectsByOrder(projects).map((p) => p._id), ['zero', 'a', 'b', 'main', 'new', 'old']);
});

test('moveInOrder moves one item to the place of another', () => {
  assert.deepEqual(moveInOrder(['a', 'b', 'c', 'd'], 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveInOrder(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveInOrder(['a', 'b'], 1, 1), ['a', 'b']);
  assert.deepEqual(moveInOrder(['a', 'b'], 5, 0), ['a', 'b']);
});

test('readProjectOrder takes unique project ids and refuses anything else', () => {
  assert.deepEqual(readProjectOrder(['project-a', 'project-b']), ['project-a', 'project-b']);
  assert.deepEqual(readProjectOrder([]), { error: '순서를 정할 시공 사례가 없습니다.' });
  assert.deepEqual(readProjectOrder('x'), { error: '순서를 정할 시공 사례가 없습니다.' });
  assert.deepEqual(readProjectOrder(['project-a', 'project-a']), { error: '시공 사례 목록이 올바르지 않습니다.' });
  assert.deepEqual(readProjectOrder(['drafts.project-a']), { error: '시공 사례 목록이 올바르지 않습니다.' });
  assert.deepEqual(readProjectOrder(['project a']), { error: '시공 사례 목록이 올바르지 않습니다.' });
  assert.deepEqual(readProjectOrder([5]), { error: '시공 사례 목록이 올바르지 않습니다.' });
});

test('the homepage orders 시공 사례 by 보이는 순서 only, no longer the main ones first', () => {
  const source = readFileSync(new URL('../app/lib/portfolio-data.ts', import.meta.url), 'utf8');
  const query = source.match(/export const projectQuery = `([^`]*)`/)?.[1] || '';
  assert.match(query, /order\(coalesce\(displayOrder, 1000000\) asc, _createdAt desc\)/);
  assert.doesNotMatch(query, /order\(featured/);
});
