import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isTrashedProject,
  pickedProjectNames,
  planProjectTrashBatch,
  projectTrashBlock,
  readProjectTrashAction,
  readProjectTrashIds,
  splitTrashedProjects,
} from '../app/lib/project-trash.ts';

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

// [선택] (spec docs/superpowers/specs/2026-11-27-project-trash-bulk-design.md): several at once.

test('readProjectTrashIds takes 1 to 200 different project ids and nothing else', () => {
  assert.deepEqual(readProjectTrashIds(['a', 'b-1.x']), ['a', 'b-1.x']);
  assert.deepEqual(readProjectTrashIds([]), { error: '고른 시공 사례가 없습니다.' });
  for (const bad of ['a', ['a', 'a'], ['drafts.a'], [1], ['a b'], [''], null]) {
    assert.deepEqual(readProjectTrashIds(bad), { error: '고른 시공 사례 목록이 올바르지 않습니다.' }, JSON.stringify(bad));
  }
  const many = Array.from({ length: 201 }, (_, index) => `p${index}`);
  assert.equal(readProjectTrashIds(many.slice(0, 200)).length, 200);
  assert.deepEqual(readProjectTrashIds(many), { error: '한 번에 200개까지 고를 수 있습니다.' });
});

test('planProjectTrashBatch goes ahead with the ones it can and counts the rest', () => {
  const stored = [{ _id: 'live' }, { _id: 'gone', deletedAt: '2026-11-27T05:00:00.000Z' }];
  assert.deepEqual(planProjectTrashBatch('trash', ['live', 'gone', 'missing'], stored, false), { allowed: ['live'], skipped: 2 });
  assert.deepEqual(planProjectTrashBatch('restore', ['live', 'gone'], stored, false), { allowed: ['gone'], skipped: 1 });
  assert.deepEqual(planProjectTrashBatch('deleteForever', ['gone', 'live'], stored, true), { allowed: ['gone'], skipped: 1 });
});

test('planProjectTrashBatch refuses when none can go ahead, and 완전히 삭제 for anyone but 총괄 관리자', () => {
  const stored = [{ _id: 'gone', deletedAt: '2026-11-27T05:00:00.000Z' }];
  assert.deepEqual(planProjectTrashBatch('deleteForever', ['gone'], stored, false), {
    refused: { status: 403, error: '완전히 삭제는 총괄 관리자만 할 수 있습니다.' },
  });
  assert.deepEqual(planProjectTrashBatch('deleteForever', ['missing', 'gone'], stored, false), {
    refused: { status: 403, error: '완전히 삭제는 총괄 관리자만 할 수 있습니다.' },
  });
  assert.deepEqual(planProjectTrashBatch('trash', ['gone', 'missing'], stored, true), {
    refused: { status: 409, error: '고른 시공 사례는 이미 휴지통에 있거나 완전히 삭제되었습니다.' },
  });
  assert.deepEqual(planProjectTrashBatch('restore', ['missing'], [], true), {
    refused: { status: 409, error: '고른 시공 사례는 이미 되돌렸거나 완전히 삭제되었습니다.' },
  });
});

test('pickedProjectNames lists up to five names for the confirm box and counts the rest', () => {
  assert.equal(pickedProjectNames(['평촌 34평', '']), ['· 평촌 34평', '· 이름 없음'].join('\n'));
  assert.equal(pickedProjectNames(['a', 'b', 'c', 'd', 'e', 'f', 'g']), ['· a', '· b', '· c', '· d', '· e', '외 2개'].join('\n'));
});

test('several projects at once are handled before the office route would create a new project', () => {
  const route = readFileSync(new URL('../app/api/manager/office/route.ts', import.meta.url), 'utf8');
  const project = route.indexOf("if (type === 'project') {");
  const batch = route.indexOf('readProjectTrashIds(body?.ids)', project);
  const create = route.indexOf('if (!body?.id) {', project);
  assert.ok(project > 0 && batch > project && batch < create, 'the batch branch comes first');
});
