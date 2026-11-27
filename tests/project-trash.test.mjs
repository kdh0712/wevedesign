import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isTrashedProject, projectTrashBlock, readProjectTrashAction, splitTrashedProjects } from '../app/lib/project-trash.ts';

// 시공 사례 휴지통 (spec docs/superpowers/specs/2026-11-27-project-trash-design.md).

test('readProjectTrashAction knows the three 휴지통 actions and nothing else', () => {
  assert.equal(readProjectTrashAction('trash'), 'trash');
  assert.equal(readProjectTrashAction('restore'), 'restore');
  assert.equal(readProjectTrashAction('deleteForever'), 'deleteForever');
  assert.equal(readProjectTrashAction('setVisibility'), null);
  assert.equal(readProjectTrashAction(undefined), null);
  assert.equal(readProjectTrashAction(['trash']), null);
});

test('a project with a deletedAt is in the 휴지통', () => {
  assert.equal(isTrashedProject({ deletedAt: '2026-11-27T05:00:00.000Z' }), true);
  assert.equal(isTrashedProject({}), false);
  assert.equal(isTrashedProject({ deletedAt: null }), false);
  assert.equal(isTrashedProject({ deletedAt: '' }), false);
});

test('splitTrashedProjects keeps the list order for active ones and puts the newest deletion first', () => {
  const projects = [
    { _id: 'a' },
    { _id: 'b', deletedAt: '2026-11-20T01:00:00.000Z' },
    { _id: 'c' },
    { _id: 'd', deletedAt: '2026-11-27T01:00:00.000Z' },
  ];
  const { active, trashed } = splitTrashedProjects(projects);
  assert.deepEqual(active.map((project) => project._id), ['a', 'c']);
  assert.deepEqual(trashed.map((project) => project._id), ['d', 'b']);
});

test('projectTrashBlock: a missing project is not found, whatever the action', () => {
  for (const action of ['trash', 'restore', 'deleteForever']) {
    assert.equal(projectTrashBlock(action, null, true)?.status, 404);
  }
});

test('projectTrashBlock: trash only what is not trashed, restore only what is', () => {
  const live = { deletedAt: undefined };
  const gone = { deletedAt: '2026-11-27T05:00:00.000Z' };
  assert.equal(projectTrashBlock('trash', live, false), null);
  assert.deepEqual(projectTrashBlock('trash', gone, false), { status: 409, error: '이미 휴지통에 있는 시공 사례입니다.' });
  assert.equal(projectTrashBlock('restore', gone, false), null);
  assert.deepEqual(projectTrashBlock('restore', live, false), { status: 409, error: '휴지통에 없는 시공 사례입니다.' });
});

test('projectTrashBlock: only 총괄 관리자 deletes for good, and only from the 휴지통', () => {
  const live = {};
  const gone = { deletedAt: '2026-11-27T05:00:00.000Z' };
  assert.deepEqual(projectTrashBlock('deleteForever', gone, false), { status: 403, error: '완전히 삭제는 총괄 관리자만 할 수 있습니다.' });
  assert.deepEqual(projectTrashBlock('deleteForever', live, true), { status: 409, error: '휴지통에 있는 시공 사례만 완전히 삭제할 수 있습니다.' });
  assert.equal(projectTrashBlock('deleteForever', gone, true), null);
});

test('the homepage, the manager list and the CLI leave trashed 시공 사례 out or mark them', () => {
  const homepage = readFileSync(new URL('../app/lib/portfolio-data.ts', import.meta.url), 'utf8').match(/export const projectQuery = `([^`]*)`/)?.[1] || '';
  assert.match(homepage, /!defined\(deletedAt\)/);
  const office = readFileSync(new URL('../app/api/manager/office/route.ts', import.meta.url), 'utf8').match(/const PROJECTS_QUERY = `([^`]*)`/)?.[1] || '';
  assert.match(office, /deletedAt, deletedBy/);
  const cli = readFileSync(new URL('../scripts/upload-project-folders.mjs', import.meta.url), 'utf8');
  assert.match(cli, /title == \$title && !defined\(deletedAt\)/);
});
