import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseUploadTargets,
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
