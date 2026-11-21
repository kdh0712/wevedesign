import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBlogUrl,
  isSanityImageAssetId,
  buildProjectPatch,
  publishBlockReason,
  legacyGalleryToGroup,
  hasDuplicateTitle,
  isProjectFormDirty,
} from '../app/lib/project-form.ts';

// The 시공 사례 form: what it accepts and the Sanity patch it saves (spec 2026-11-21-portfolio-project-editor-design.md §4).

const asset = (name) => `image-${name}-800x600-jpg`;
const base = () => ({
  title: '평촌 34평',
  categoryId: 'cat-1',
  location: '안양',
  area: '34',
  year: '2026',
  materials: '',
  blogUrl: 'blog.naver.com/x',
  description: ' 첫 줄\n둘째 줄 ',
  displayOrder: '',
  featured: false,
  mainImageAssetId: asset('main'),
  mainImagePositionX: 50,
  mainImagePositionY: 40,
  beforeImageAssetId: '',
  galleryGroups: [
    {
      key: 'g1',
      title: '거실',
      images: [
        { key: 'i1', assetId: asset('a'), caption: '거실1' },
        { key: 'i2', assetId: asset('b'), caption: '거실2' },
      ],
    },
  ],
});

const patchOf = (input) => {
  const result = buildProjectPatch(input);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.patch;
};
const errorOf = (input) => {
  const result = buildProjectPatch(input);
  assert.equal(result.ok, false);
  return result.error;
};

test('normalizeBlogUrl adds https and accepts only http(s) links', () => {
  assert.equal(normalizeBlogUrl(''), '');
  assert.equal(normalizeBlogUrl('blog.naver.com/weve'), 'https://blog.naver.com/weve');
  assert.equal(normalizeBlogUrl('http://a.kr/x'), 'http://a.kr/x');
  assert.equal(normalizeBlogUrl(' https://a.kr '), 'https://a.kr');
  assert.equal(normalizeBlogUrl('javascript:alert(1)'), null);
  assert.equal(normalizeBlogUrl('ftp://a.kr'), null);
  assert.equal(normalizeBlogUrl('not a url with space'), null);
});

test('isSanityImageAssetId recognises Sanity image asset ids only', () => {
  assert.equal(isSanityImageAssetId(asset('abc123')), true);
  assert.equal(isSanityImageAssetId('image-abc-800x600-png'), true);
  assert.equal(isSanityImageAssetId('abc'), false);
  assert.equal(isSanityImageAssetId('file-abc-pdf'), false);
});

test('buildProjectPatch turns a valid form into the Sanity set and unset lists', () => {
  const patch = patchOf(base());
  assert.equal(patch.set.title, '평촌 34평');
  assert.deepEqual(patch.set.category, { _type: 'reference', _ref: 'cat-1' });
  assert.equal(patch.set.area, 34);
  assert.equal(patch.set.year, '2026');
  assert.equal(patch.set.location, '안양');
  assert.equal(patch.set.blogUrl, 'https://blog.naver.com/x');
  assert.equal(patch.set.description, '첫 줄\n둘째 줄', 'line breaks stay, only the ends are trimmed');
  assert.equal(patch.set.featured, false);
  assert.deepEqual(patch.set.mainImage, { _type: 'image', asset: { _type: 'reference', _ref: asset('main') }, alt: '평촌 34평 대표 사진' });
  assert.equal(patch.set.mainImagePositionX, 50);
  assert.equal(patch.set.mainImagePositionY, 40);
  assert.deepEqual(patch.set.galleryGroups, [
    {
      _type: 'object',
      _key: 'g1',
      title: '거실',
      roomType: '거실',
      displayOrder: 1,
      images: [
        { _type: 'image', _key: 'i1', asset: { _type: 'reference', _ref: asset('a') }, alt: '평촌 34평 거실', caption: '거실1', displayOrder: 1 },
        { _type: 'image', _key: 'i2', asset: { _type: 'reference', _ref: asset('b') }, alt: '평촌 34평 거실', caption: '거실2', displayOrder: 2 },
      ],
    },
  ]);
  for (const key of ['displayOrder', 'beforeImage', 'gallery', 'materials']) assert.ok(patch.unset.includes(key), key);
  assert.equal(patch.unset.includes('area'), false);
  assert.equal(Object.hasOwn(patch.set, 'displayOrder'), false);
});

test('blank numbers are removed, never saved as 0; a typed 0 order stays', () => {
  const blankArea = patchOf({ ...base(), area: '' });
  assert.ok(blankArea.unset.includes('area'));
  assert.equal(Object.hasOwn(blankArea.set, 'area'), false);
  assert.equal(errorOf({ ...base(), area: '0' }), '평수는 0보다 큰 숫자로 입력해 주세요.');
  assert.equal(errorOf({ ...base(), area: '삼십' }), '평수는 0보다 큰 숫자로 입력해 주세요.');
  assert.equal(patchOf({ ...base(), area: '32.5' }).set.area, 32.5);
  assert.equal(patchOf({ ...base(), displayOrder: '0' }).set.displayOrder, 0);
  assert.equal(patchOf({ ...base(), displayOrder: '3' }).set.displayOrder, 3);
  assert.equal(errorOf({ ...base(), displayOrder: '1.5' }), '보이는 순서는 0 이상의 정수로 입력해 주세요.');
  assert.equal(errorOf({ ...base(), displayOrder: '-1' }), '보이는 순서는 0 이상의 정수로 입력해 주세요.');
});

test('buildProjectPatch refuses what the form must not save', () => {
  assert.equal(errorOf({ ...base(), title: '   ' }), '이름을 입력해 주세요.');
  assert.equal(errorOf({ ...base(), title: '가'.repeat(81) }), '이름은 80자까지 입력할 수 있습니다.');
  assert.equal(errorOf({ ...base(), categoryId: '' }), '공간 분류를 골라 주세요.');
  assert.equal(errorOf({ ...base(), year: '26' }), '시공 연도는 4자리로 입력해 주세요.');
  assert.equal(errorOf({ ...base(), blogUrl: 'javascript:x' }), '블로그 주소를 확인해 주세요.');
  const longGroup = base();
  longGroup.galleryGroups[0].title = '가'.repeat(21);
  assert.equal(errorOf(longGroup), '묶음 이름은 1~20자로 입력해 주세요.');
  const badAsset = base();
  badAsset.galleryGroups[0].images[0].assetId = 'abc';
  assert.equal(errorOf(badAsset), '사진 정보가 올바르지 않습니다. 새로고침한 뒤 다시 시도해 주세요.');
  assert.equal(errorOf({ ...base(), mainImageAssetId: 'abc' }), '사진 정보가 올바르지 않습니다. 새로고침한 뒤 다시 시도해 주세요.');
});

test('a project with only old single photos keeps them when saved without groups', () => {
  const patch = patchOf({ ...base(), galleryGroups: [] });
  assert.deepEqual(patch.set.galleryGroups, []);
  assert.equal(patch.unset.includes('gallery'), false);
});

test('the representative photo is never removed, the before photo can be', () => {
  const noMain = patchOf({ ...base(), mainImageAssetId: '' });
  assert.equal(Object.hasOwn(noMain.set, 'mainImage'), false);
  assert.equal(noMain.unset.includes('mainImage'), false);
  const withBefore = patchOf({ ...base(), beforeImageAssetId: asset('before') });
  assert.deepEqual(withBefore.set.beforeImage, { _type: 'image', asset: { _type: 'reference', _ref: asset('before') }, alt: '평촌 34평 시공 전 사진' });
  assert.equal(withBefore.unset.includes('beforeImage'), false);
});

test('the focus point is kept within 0-100 and defaults to 50', () => {
  const patch = patchOf({ ...base(), mainImagePositionX: -5, mainImagePositionY: 120 });
  assert.equal(patch.set.mainImagePositionX, 0);
  assert.equal(patch.set.mainImagePositionY, 100);
  assert.equal(patchOf({ ...base(), mainImagePositionX: Number.NaN }).set.mainImagePositionX, 50);
});

test('publishBlockReason needs a name, a category and a representative photo', () => {
  assert.equal(publishBlockReason({ title: '평촌', categoryId: 'cat-1', mainImageAssetId: asset('m') }), null);
  assert.equal(publishBlockReason({ title: ' ', categoryId: 'cat-1', mainImageAssetId: asset('m') }), '이름을 입력해 주세요.');
  assert.equal(publishBlockReason({ title: '평촌', categoryId: '', mainImageAssetId: asset('m') }), '공간 분류를 골라 주세요.');
  assert.equal(publishBlockReason({ title: '평촌', categoryId: 'cat-1' }), '대표 사진을 골라 주세요.');
});

test('legacyGalleryToGroup keeps the old photos in order in one group', () => {
  const a = { key: 'a', assetId: asset('a') };
  const b = { key: 'b', assetId: asset('b') };
  assert.deepEqual(legacyGalleryToGroup([a, b]), { key: 'group-legacy', title: '사진', roomType: '사진', images: [a, b] });
});

test('hasDuplicateTitle ignores the project itself and surrounding spaces', () => {
  const projects = [
    { _id: 'p1', title: '평촌' },
    { _id: 'p2', title: '평촌' },
    { _id: 'p3', title: '산본' },
  ];
  assert.equal(hasDuplicateTitle(' 평촌 ', 'p1', projects), true);
  assert.equal(hasDuplicateTitle('산본', 'p3', projects), false);
  assert.equal(hasDuplicateTitle('', 'p1', projects), false);
});

test('isProjectFormDirty ignores surrounding spaces but sees order and removed photos', () => {
  assert.equal(isProjectFormDirty(base(), { ...base(), title: ' 평촌 34평 ' }), false);
  const reordered = base();
  reordered.galleryGroups[0].images.reverse();
  assert.equal(isProjectFormDirty(base(), reordered), true);
  const removed = base();
  removed.galleryGroups[0].images.pop();
  assert.equal(isProjectFormDirty(base(), removed), true);
  assert.equal(isProjectFormDirty(base(), { ...base(), featured: true }), true);
});

test('formFromStoredProject follows the stored photo order, like the homepage', async () => {
  const { formFromStoredProject } = await import('../app/lib/project-form.ts');
  const form = formFromStoredProject({
    _id: 'p',
    title: '평촌',
    area: 0,
    displayOrder: 0,
    galleryGroups: [
      { _key: 'g-late', title: '주방', displayOrder: 2, images: [{ _key: 'i3', assetId: asset('c'), displayOrder: 1 }] },
      {
        _key: 'g-first',
        title: '거실',
        displayOrder: 1,
        images: [
          { _key: 'i2', assetId: asset('b'), displayOrder: 2 },
          { _key: 'i1', assetId: asset('a'), displayOrder: 1 },
          { _key: 'i0', assetId: asset('z') },
        ],
      },
      { _key: 'g-none', title: '욕실', images: [] },
    ],
  });
  assert.deepEqual(form.galleryGroups.map((group) => group.key), ['g-first', 'g-late', 'g-none'], 'groups by displayOrder, missing last');
  assert.deepEqual(form.galleryGroups[0].images.map((image) => image.key), ['i1', 'i2', 'i0'], 'photos by displayOrder, missing last');
  assert.equal(form.area, '', 'a stored 0 area reads as none');
  assert.equal(form.displayOrder, '0', 'a stored 0 order stays 0');
});

test('formFromStoredProject turns an old position word into the focus point it meant', async () => {
  const { formFromStoredProject } = await import('../app/lib/project-form.ts');
  assert.deepEqual([formFromStoredProject({ _id: 'p', mainImagePosition: 'top' }).mainImagePositionX, formFromStoredProject({ _id: 'p', mainImagePosition: 'top' }).mainImagePositionY], [50, 0]);
  assert.equal(formFromStoredProject({ _id: 'p', mainImagePosition: 'left' }).mainImagePositionX, 0);
  assert.equal(formFromStoredProject({ _id: 'p', mainImagePosition: 'bottom' }).mainImagePositionY, 100);
  const kept = formFromStoredProject({ _id: 'p', mainImagePosition: 'top', mainImagePositionX: 30, mainImagePositionY: 70 });
  assert.deepEqual([kept.mainImagePositionX, kept.mainImagePositionY], [30, 70], 'numbers win over the old word');
});

test('legacyImagesFromStored keeps the old photos in their homepage order', async () => {
  const { legacyImagesFromStored } = await import('../app/lib/project-form.ts');
  const images = legacyImagesFromStored([
    { _key: 'b', assetId: asset('b'), displayOrder: 2 },
    { _key: 'a', assetId: asset('a'), displayOrder: 1 },
    { _key: 'x' },
  ]);
  assert.deepEqual(images.map((image) => image.key), ['a', 'b'], 'ordered, and photos without an asset are left out');
});

test('isSanityRevisionConflict recognises a save that lost to a newer version', async () => {
  const { isSanityRevisionConflict } = await import('../app/lib/project-form.ts');
  assert.equal(isSanityRevisionConflict({ statusCode: 409, message: 'Document "p" has unexpected revision ID ("x"), blocking mutation' }), true);
  assert.equal(isSanityRevisionConflict({ statusCode: 409 }), true);
  assert.equal(isSanityRevisionConflict(new Error('network down')), false);
  assert.equal(isSanityRevisionConflict(null), false);
});
