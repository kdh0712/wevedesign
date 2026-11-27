import test from 'node:test';
import assert from 'node:assert/strict';
import {
  folderInfoProblem,
  folderProjectInput,
  galleryGroupsFromFolder,
  readFolderUploadBody,
  isImageAssetId,
  parseUploadPath,
  newProjectId,
  newProjectFields,
  replacePhotoPatch,
  sameTitleProjects,
  uploadSummary,
} from '../app/lib/project-upload-rules.ts';

// Folder uploads of 시공 사례: staff choose per folder whether it makes a new project or replaces one project's photos.

const groups = [{ _type: 'object', _key: 'g', title: '거실', images: [] }];

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

test('isImageAssetId accepts only Sanity image asset ids', () => {
  assert.equal(isImageAssetId('image-3f2a9c0e1b7d4a6f8e5c2b1a0d9e8f7c6b5a4d3e-2048x1536-jpg'), true);
  assert.equal(isImageAssetId('image-x'), false);
  assert.equal(isImageAssetId('file-3f2a-pdf'), false);
  assert.equal(isImageAssetId(5), false);
});

// 정보·사진 정리 팝업 (spec docs/superpowers/specs/2026-11-27-project-upload-popup-design.md): each folder arrives arranged.
const A = (n) => `image-${'a'.repeat(39)}${n}-2048x1536-jpg`;
const folder = (extra = {}) => ({
  title: '평촌 34평',
  target: 'new',
  info: { title: ' 평촌 어바인퍼스트 34평 ', categoryId: 'cat-1', location: '안양', area: '34', year: '2026', materials: '', blogUrl: '', description: '', featured: true },
  coverAssetId: A(1),
  beforeAssetId: null,
  groups: [{ roomType: '거실', photos: [{ assetId: A(2), caption: '거실1' }, { assetId: A(3), caption: 'IMG_2041' }] }],
  ...extra,
});

test('readFolderUploadBody takes arranged folders and every asset id they use', () => {
  const read = readFolderUploadBody({ folders: [folder()] });
  assert.equal(read.folders.length, 1);
  assert.deepEqual(read.assetIds.sort(), [A(1), A(2), A(3)].sort());
  assert.deepEqual(readFolderUploadBody({ folders: [] }), { error: '올릴 시공 사례가 없습니다.' });
  assert.deepEqual(readFolderUploadBody(null), { error: '요청 형식이 올바르지 않습니다.' });
  assert.deepEqual(readFolderUploadBody({ folders: [folder({ coverAssetId: 'x' })] }), { error: '사진 정보가 올바르지 않습니다. 다시 올려 주세요.' });
  assert.deepEqual(readFolderUploadBody({ folders: [folder({ target: 'maybe' })] }), { error: '올릴 방법이 정해지지 않은 폴더가 있습니다.' });
  assert.deepEqual(readFolderUploadBody({ folders: [folder({ groups: [{ roomType: '', photos: [] }] })] }), { error: '공간 이름은 1~20자로 입력해 주세요.' });
  assert.deepEqual(readFolderUploadBody({ folders: [folder({ info: undefined })] }), { error: '새 시공 사례의 기본 정보가 없습니다.' });
  // a replace needs no information
  assert.equal(readFolderUploadBody({ folders: [folder({ target: 'replace:project-a', info: undefined })] }).folders[0].target.mode, 'replace');
});

test('folderProjectInput turns a new folder into the editor form, so the same rules save it', () => {
  const read = readFolderUploadBody({ folders: [folder()] });
  const input = folderProjectInput(read.folders[0], 'cat-1');
  assert.equal(input.title, ' 평촌 어바인퍼스트 34평 ');
  assert.equal(input.categoryId, 'cat-1');
  assert.equal(input.featured, true);
  assert.equal(input.mainImageAssetId, A(1));
  assert.equal(input.beforeImageAssetId, '');
  assert.deepEqual(input.galleryGroups, [
    { key: 'group-1', title: '거실', roomType: '거실', images: [{ key: 'image-1-1', assetId: A(2), caption: '거실1' }, { key: 'image-1-2', assetId: A(3), caption: 'IMG_2041' }] },
  ]);
});

test('galleryGroupsFromFolder writes a replacement’s groups in the order staff arranged', () => {
  const read = readFolderUploadBody({ folders: [folder({ target: 'replace:project-a', info: undefined })] });
  assert.deepEqual(galleryGroupsFromFolder('평촌 34평', read.folders[0].groups), [
    {
      _type: 'object',
      _key: 'group-1',
      roomType: '거실',
      title: '거실',
      displayOrder: 1,
      images: [
        { _type: 'image', _key: 'image-1-1', asset: { _type: 'reference', _ref: A(2) }, caption: '거실1', displayOrder: 1, alt: '평촌 34평 거실' },
        { _type: 'image', _key: 'image-1-2', asset: { _type: 'reference', _ref: A(3) }, caption: 'IMG_2041', displayOrder: 2, alt: '평촌 34평 거실' },
      ],
    },
  ]);
});

test('folderInfoProblem checks a new folder’s information with the editor’s rules', () => {
  const info = { title: '평촌 34평', categoryId: 'cat-1', newCategory: '', location: '', area: '', year: '', materials: '', blogUrl: '', description: '', featured: false };
  assert.equal(folderInfoProblem(info), null);
  assert.equal(folderInfoProblem({ ...info, categoryId: '', newCategory: '복층' }), null);
  assert.equal(folderInfoProblem({ ...info, title: ' ' }), '이름을 입력해 주세요.');
  assert.equal(folderInfoProblem({ ...info, categoryId: '' }), '공간 분류를 골라 주세요.');
  assert.equal(folderInfoProblem({ ...info, area: '삼십' }), '평수는 0보다 큰 숫자로 입력해 주세요.');
  assert.equal(folderInfoProblem({ ...info, year: '26' }), '시공 연도는 4자리로 입력해 주세요.');
});
