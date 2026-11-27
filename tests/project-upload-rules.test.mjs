import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findUploadTarget,
  galleryGroupsFromPhotos,
  isImageAssetId,
  parseUploadPath,
  parseUploadTargets,
  planProjectPhotos,
  readBulkUploadBody,
  newProjectId,
  newProjectFields,
  replacePhotoPatch,
  sameTitleProjects,
  uploadSummary,
} from '../app/lib/project-upload-rules.ts';

// Folder uploads of 시공 사례: staff choose per folder whether it makes a new project or replaces one project's photos.

const groups = [{ _type: 'object', _key: 'g', title: '거실', images: [] }];

test('parseUploadTargets keeps only new and replace:<id> per folder', () => {
  const targets = parseUploadTargets('{"A":"new","B":"replace:project-abc","C":"replace:","D":"x","E":5}');
  assert.deepEqual(targets.get('A'), { mode: 'new' });
  assert.deepEqual(targets.get('B'), { mode: 'replace', projectId: 'project-abc' });
  assert.equal(targets.has('C'), false);
  assert.equal(targets.has('D'), false);
  assert.equal(targets.has('E'), false);
  assert.equal(parseUploadTargets('not json').size, 0);
  assert.equal(parseUploadTargets(null).size, 0);
  assert.equal(parseUploadTargets('["new"]').size, 0);
});

test('newProjectId is project- plus 24 random hex characters', () => {
  assert.equal(newProjectId('0123456789abcdef01234567'), 'project-0123456789abcdef01234567');
  assert.throws(() => newProjectId('xyz'));
});

test('a new project starts hidden and not on the main page', () => {
  const fields = newProjectFields({ title: '평촌', categoryRef: 'cat-1', mainAssetId: 'image-m-1x1-jpg', beforeAssetId: null, galleryGroups: groups });
  assert.equal(fields.isVisible, false);
  assert.equal(fields.featured, false);
  assert.equal(fields.title, '평촌');
  assert.deepEqual(fields.category, { _type: 'reference', _ref: 'cat-1' });
  assert.deepEqual(fields.mainImage, { _type: 'image', asset: { _type: 'reference', _ref: 'image-m-1x1-jpg' }, alt: '평촌 대표 사진' });
  assert.deepEqual(fields.galleryGroups, groups);
  assert.equal(Object.hasOwn(fields, 'beforeImage'), false);
  const withBefore = newProjectFields({ title: '평촌', categoryRef: 'cat-1', mainAssetId: 'image-m-1x1-jpg', beforeAssetId: 'image-b-1x1-jpg', galleryGroups: groups });
  assert.deepEqual(withBefore.beforeImage, { _type: 'image', asset: { _type: 'reference', _ref: 'image-b-1x1-jpg' }, alt: '평촌 시공 전 사진' });
});

test('replacing photos changes only the photos and resets the focus point', () => {
  const patch = replacePhotoPatch({ title: '평촌(수정)', mainAssetId: 'image-m-1x1-jpg', beforeAssetId: null, galleryGroups: groups });
  assert.deepEqual(Object.keys(patch.set).sort(), ['galleryGroups', 'mainImage', 'mainImagePositionX', 'mainImagePositionY']);
  assert.equal(patch.set.mainImagePositionX, 50);
  assert.equal(patch.set.mainImagePositionY, 50);
  assert.equal(patch.set.mainImage.alt, '평촌(수정) 대표 사진');
  assert.deepEqual(patch.unset, ['gallery']);
  for (const kept of ['title', 'isVisible', 'featured', 'category', 'location', 'area', 'description', 'year', 'materials', 'blogUrl', 'displayOrder']) {
    assert.equal(Object.hasOwn(patch.set, kept), false, kept);
    assert.equal(patch.unset.includes(kept), false, kept);
  }
  const withBefore = replacePhotoPatch({ title: '평촌', mainAssetId: 'image-m-1x1-jpg', beforeAssetId: 'image-b-1x1-jpg', galleryGroups: groups });
  assert.ok(Object.hasOwn(withBefore.set, 'beforeImage'), 'a before photo in the new folder replaces the old one');
});

test('sameTitleProjects finds every project with the folder name', () => {
  const projects = [
    { _id: 'a', title: '평촌' },
    { _id: 'b', title: '산본' },
    { _id: 'c', title: ' 평촌 ' },
  ];
  assert.deepEqual(sameTitleProjects(' 평촌 ', projects).map((project) => project._id), ['a', 'c']);
  assert.deepEqual(sameTitleProjects('', projects), []);
});

test('uploadSummary counts the results and mentions failures only when there are some', () => {
  assert.equal(
    uploadSummary([
      { projectTitle: 'A', status: 'created' },
      { projectTitle: 'B', status: 'replaced' },
    ]),
    '새로 만듦 1 · 사진 바꿈 1 · 건너뜀 0',
  );
  assert.equal(
    uploadSummary([
      { projectTitle: 'A', status: 'skipped' },
      { projectTitle: 'B', status: 'failed' },
    ]),
    '새로 만듦 0 · 사진 바꿈 0 · 건너뜀 1 · 실패 1',
  );
});

test('afterUploadSelection says which project the editor reopens from fresh data', async () => {
  const { afterUploadSelection } = await import('../app/lib/project-upload-rules.ts');
  const created = (id) => ({ projectTitle: id, status: 'created', projectId: id });
  // Replacing one project's photos reopens it, so the form never keeps the old photos.
  assert.deepEqual(afterUploadSelection({ results: [{ projectTitle: 'A', status: 'replaced', projectId: 'p1' }], replaceTargetId: 'p1', currentSelectedId: 'p1' }), { openProjectId: 'p1', showHidden: false });
  // A single new project opens.
  assert.deepEqual(afterUploadSelection({ results: [created('n1')], replaceTargetId: '', currentSelectedId: 'p1' }), { openProjectId: 'n1', showHidden: false });
  // Several new projects: the list shows hidden ones, and the project that was open reopens fresh (its photos may have been replaced too).
  assert.deepEqual(
    afterUploadSelection({ results: [created('n1'), created('n2'), { projectTitle: 'B', status: 'replaced', projectId: 'p1' }], replaceTargetId: '', currentSelectedId: 'p1' }),
    { openProjectId: 'p1', showHidden: true },
  );
  // Nothing created and nothing open: nothing to open.
  assert.deepEqual(afterUploadSelection({ results: [{ projectTitle: 'A', status: 'failed' }], replaceTargetId: '', currentSelectedId: '' }), { openProjectId: '', showHidden: false });
});

// 나눠 올리기 (spec docs/superpowers/specs/2026-11-27-project-upload-per-photo-design.md): each photo is uploaded on its own,
// then the projects are made from the photos' folder paths and asset ids.
const photo = (path, assetId) => ({ path, assetId });

test('parseUploadPath reads the folder, 대표 / 시공전 and the room with its number from a photo path', () => {
  assert.deepEqual(parseUploadPath('평촌 34평/대표.jpg'), { projectTitle: '평촌 34평', kind: 'cover', roomType: '대표', order: 1 });
  assert.deepEqual(parseUploadPath('평촌 34평/시공 전.JPG'), { projectTitle: '평촌 34평', kind: 'before', roomType: '시공 전', order: 1 });
  assert.deepEqual(parseUploadPath('평촌 34평/거실 12.jpeg'), { projectTitle: '평촌 34평', kind: 'detail', roomType: '거실', order: 12 });
  assert.deepEqual(parseUploadPath('사진/평촌/주방_3.png'), { projectTitle: '평촌', kind: 'detail', roomType: '주방', order: 3 });
  assert.deepEqual(parseUploadPath('현관.jpg'), { projectTitle: '현관', kind: 'detail', roomType: '현관', order: 1 });
  assert.deepEqual(parseUploadPath('평촌/12.jpg'), { projectTitle: '평촌', kind: 'detail', roomType: '상세', order: 12 });
  assert.deepEqual(parseUploadPath('사진\\평촌\\욕실2.jpg'), { projectTitle: '평촌', kind: 'detail', roomType: '욕실', order: 2 });
});

test('planProjectPhotos sorts each folder into its cover, its 시공 전 photo and room groups in number order', () => {
  const plan = planProjectPhotos([
    photo('A/거실10.jpg', 'image-a10'),
    photo('A/주방1.jpg', 'image-k1'),
    photo('A/거실2.jpg', 'image-a2'),
    photo('A/대표.jpg', 'image-c'),
    photo('A/시공전.jpg', 'image-b'),
    photo('B/욕실1.jpg', 'image-y1'),
  ]);
  assert.deepEqual([...plan.keys()], ['A', 'B']);
  const a = plan.get('A');
  assert.equal(a.cover.assetId, 'image-c');
  assert.equal(a.before.assetId, 'image-b');
  assert.deepEqual(a.groups.map((group) => [group.roomType, group.photos.map((item) => item.assetId)]), [['거실', ['image-a2', 'image-a10']], ['주방', ['image-k1']]]);
  // A folder without a 대표 photo takes its first detail photo as the cover.
  assert.equal(plan.get('B').cover.assetId, 'image-y1');
  assert.equal(plan.get('B').before, null);
});

test('galleryGroupsFromPhotos makes the Sanity groups with one image per photo', () => {
  const plan = planProjectPhotos([photo('A/거실2.jpg', 'image-a2'), photo('A/거실1.jpg', 'image-a1'), photo('A/주방1.jpg', 'image-k1')]);
  const groups = galleryGroupsFromPhotos('평촌 34평', plan.get('A').groups);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], {
    _type: 'object',
    _key: 'group-1',
    roomType: '거실',
    title: '거실',
    displayOrder: 1,
    images: [
      { _type: 'image', _key: 'image-1-1', asset: { _type: 'reference', _ref: 'image-a1' }, caption: '거실1', displayOrder: 1, alt: '평촌 34평 거실' },
      { _type: 'image', _key: 'image-1-2', asset: { _type: 'reference', _ref: 'image-a2' }, caption: '거실2', displayOrder: 2, alt: '평촌 34평 거실' },
    ],
  });
  assert.equal(groups[1]._key, 'group-2');
});

test('isImageAssetId accepts only Sanity image asset ids', () => {
  assert.equal(isImageAssetId('image-3f2a9c0e1b7d4a6f8e5c2b1a0d9e8f7c6b5a4d3e-2048x1536-jpg'), true);
  assert.equal(isImageAssetId('image-x'), false);
  assert.equal(isImageAssetId('file-3f2a-pdf'), false);
  assert.equal(isImageAssetId(5), false);
});

test('readBulkUploadBody takes photos, targets and the category, and refuses a body with any bad photo (review finding)', () => {
  const asset = 'image-3f2a9c0e1b7d4a6f8e5c2b1a0d9e8f7c6b5a4d3e-2048x1536-jpg';
  assert.deepEqual(readBulkUploadBody({ photos: [{ path: 'A/거실1.jpg', assetId: asset }], targets: '{"A":"new"}', categoryId: 'c1', category: '아파트' }), {
    photos: [{ path: 'A/거실1.jpg', assetId: asset }],
    targets: '{"A":"new"}',
    categoryId: 'c1',
    category: '아파트',
  });
  // targets may come as an object too
  assert.equal(readBulkUploadBody({ photos: [{ path: 'A/1.jpg', assetId: asset }], targets: { A: 'new' } }).targets, '{"A":"new"}');
  assert.deepEqual(readBulkUploadBody(null), { error: '요청 형식이 올바르지 않습니다.' });
  assert.deepEqual(readBulkUploadBody({ photos: [] }), { error: '올린 사진이 없습니다.' });
  assert.deepEqual(readBulkUploadBody({ photos: [{ path: 'A/1.jpg', assetId: asset }, { path: 'A/2.jpg', assetId: 'nope' }] }), { error: '사진 정보가 올바르지 않습니다. 다시 올려 주세요.' });
});

test('findUploadTarget also finds a folder whose name has spaces around it (bug from before: such a folder was skipped)', () => {
  const targets = parseUploadTargets('{" 평촌 34평 ":"new","B":"replace:project-b"}');
  assert.deepEqual(findUploadTarget(targets, '평촌 34평'), { mode: 'new' });
  assert.deepEqual(findUploadTarget(targets, 'B'), { mode: 'replace', projectId: 'project-b' });
  assert.equal(findUploadTarget(targets, 'C'), undefined);
});
