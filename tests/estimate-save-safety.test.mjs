import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMaterialSettingsOp,
  changeMaterialSettingsSafely,
  decodeMaterialSettings,
  encodeMaterialSettingsFields,
  estimateSaveConflict,
  estimateSaveConflictMessage,
  linkMaterialToEstimateCategory,
  linkedWorkLineCount,
  removeMaterialFromSettings,
  unlinkWorkLinesFromLine,
  unnamedPricedLineCount,
} from '../app/lib/estimate-save-safety.ts';

const stored = {
  estimateCategories: ['욕실 공사', '목공사'],
  estimateItems: { m1: '욕실 공사', m2: '목공사' },
  materialOrder: ['m2', 'm1', 'm3'],
};

test('settings survive an encode and decode round trip, and a missing document decodes as empty', () => {
  assert.deepEqual(decodeMaterialSettings(encodeMaterialSettingsFields(stored, '2026-10-20T00:00:00.000Z')), stored);
  assert.deepEqual(decodeMaterialSettings(null), { estimateCategories: [], estimateItems: {}, materialOrder: [] });
  assert.deepEqual(decodeMaterialSettings({ estimateCategoriesJson: 'not json' }).estimateCategories, []);
});

test('decode drops links to categories that no longer exist', () => {
  const settings = decodeMaterialSettings({
    estimateCategoriesJson: JSON.stringify(['욕실 공사']),
    estimateItemsJson: JSON.stringify({ m1: '욕실 공사', m2: '없는 카테고리' }),
  });
  assert.deepEqual(settings.estimateItems, { m1: '욕실 공사' });
});

test('addCategory appends to the stored list and refuses blanks and duplicates', () => {
  const added = applyMaterialSettingsOp(stored, { op: 'addCategory', name: '  도장  공사 ' });
  assert.equal(added.ok, true);
  assert.equal(added.changed, true);
  assert.deepEqual(added.settings.estimateCategories, ['욕실 공사', '목공사', '도장 공사']);
  assert.deepEqual(added.settings.estimateItems, stored.estimateItems, 'links stay');
  assert.deepEqual(applyMaterialSettingsOp(stored, { op: 'addCategory', name: ' ' }), { ok: false, status: 400, error: '추가할 견적 카테고리 이름을 입력해주세요.' });
  assert.equal(applyMaterialSettingsOp(stored, { op: 'addCategory', name: '목공사' }).ok, false);
});

test('deleteCategory removes the category and only its links', () => {
  const result = applyMaterialSettingsOp(stored, { op: 'deleteCategory', name: '목공사' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.settings.estimateCategories, ['욕실 공사']);
  assert.deepEqual(result.settings.estimateItems, { m1: '욕실 공사' });
  assert.deepEqual(result.settings.materialOrder, stored.materialOrder);
  assert.equal(applyMaterialSettingsOp(stored, { op: 'deleteCategory', name: '없음' }).ok, false);
});

test('assign links, moves and unlinks items; the same assignment changes nothing', () => {
  const moved = applyMaterialSettingsOp(stored, { op: 'assign', ids: ['m2', 'm3'], category: '욕실 공사' });
  assert.deepEqual(moved.settings.estimateItems, { m1: '욕실 공사', m2: '욕실 공사', m3: '욕실 공사' });
  const unlinked = applyMaterialSettingsOp(stored, { op: 'assign', ids: ['m1'], category: '' });
  assert.deepEqual(unlinked.settings.estimateItems, { m2: '목공사' });
  const same = applyMaterialSettingsOp(stored, { op: 'assign', ids: ['m1'], category: '욕실 공사' });
  assert.equal(same.ok && same.changed, false);
  assert.equal(applyMaterialSettingsOp(stored, { op: 'assign', ids: ['m1'], category: '없는 카테고리' }).ok, false);
  assert.equal(applyMaterialSettingsOp(stored, { op: 'assign', ids: [], category: '욕실 공사' }).ok, false);
});

test('assignMany creates missing categories in order and keeps the other links', () => {
  const result = applyMaterialSettingsOp(stored, { op: 'assignMany', assignments: { m3: '가구공사', m4: '도기', m1: '목공사' } });
  assert.deepEqual(result.settings.estimateCategories, ['욕실 공사', '목공사', '가구공사', '도기']);
  assert.deepEqual(result.settings.estimateItems, { m1: '목공사', m2: '목공사', m3: '가구공사', m4: '도기' });
  assert.equal(applyMaterialSettingsOp(stored, { op: 'assignMany', assignments: { m1: ' ' } }).ok, false);
});

test('reorder saves only when the page started from the stored order', () => {
  const order = ['m1', 'm2', 'm3'];
  const fromStored = applyMaterialSettingsOp(stored, { op: 'reorder', order, baseOrder: ['m2', 'm1', 'm3'] });
  assert.deepEqual(fromStored.settings.materialOrder, order);
  const stale = applyMaterialSettingsOp(stored, { op: 'reorder', order, baseOrder: [] });
  assert.deepEqual(stale, { ok: false, status: 409, error: '다른 곳에서 자재 순서가 바뀌었습니다. 새로고침한 뒤 다시 순서를 바꿔 주세요.' });
  const olderPage = applyMaterialSettingsOp(stored, { op: 'reorder', order });
  assert.deepEqual(olderPage.settings.materialOrder, order, 'a page without a base is let through');
});

test('an unknown action is refused', () => {
  assert.equal(applyMaterialSettingsOp(stored, { op: 'wipe' }).ok, false);
});

test('linkMaterialToEstimateCategory links, unlinks, and ignores unknown categories', () => {
  assert.deepEqual(linkMaterialToEstimateCategory(stored, 'm3', '목공사').settings.estimateItems, { ...stored.estimateItems, m3: '목공사' });
  assert.deepEqual(linkMaterialToEstimateCategory(stored, 'm1', '').settings.estimateItems, { m2: '목공사' });
  const unknown = linkMaterialToEstimateCategory(stored, 'm3', '없는 카테고리');
  assert.equal(unknown.ok && unknown.changed, false);
  const same = linkMaterialToEstimateCategory(stored, 'm1', '욕실 공사');
  assert.equal(same.ok && same.changed, false);
});

test('removeMaterialFromSettings drops the link and the order entry of a deleted material', () => {
  const result = removeMaterialFromSettings(stored, 'm1');
  assert.deepEqual(result.settings.estimateItems, { m2: '목공사' });
  assert.deepEqual(result.settings.materialOrder, ['m2', 'm3']);
  const untouched = removeMaterialFromSettings(stored, 'zzz');
  assert.equal(untouched.ok && untouched.changed, false);
});

const empty = { estimateCategories: [], estimateItems: {}, materialOrder: [] };

function fakeStore(initial) {
  const store = { settings: initial, version: 1, writes: 0, reads: 0 };
  return {
    store,
    read: async () => {
      store.reads += 1;
      return { settings: store.settings, version: store.version };
    },
    write: async (settings, version) => {
      if (version !== store.version) {
        const error = new Error('conflict');
        error.name = 'FirestoreConflictError';
        throw error;
      }
      store.writes += 1;
      store.settings = settings;
      store.version += 1;
    },
    isConflict: (error) => error instanceof Error && error.name === 'FirestoreConflictError',
  };
}

test('a failed read never writes, so it can never wipe the settings', async () => {
  let writes = 0;
  await assert.rejects(
    changeMaterialSettingsSafely(
      {
        read: async () => {
          throw new Error('Firestore document read failed');
        },
        write: async () => {
          writes += 1;
        },
        isConflict: () => false,
      },
      (settings) => applyMaterialSettingsOp(settings, { op: 'addCategory', name: '새 카테고리' }),
    ),
    /read failed/,
  );
  assert.equal(writes, 0);
});

test('a write that lost to another save starts over from a fresh read and keeps both changes', async () => {
  const fake = fakeStore(stored);
  let interfered = false;
  const result = await changeMaterialSettingsSafely(
    {
      read: fake.read,
      write: async (settings, version) => {
        if (!interfered) {
          // Someone else adds a category between this read and this write.
          interfered = true;
          fake.store.settings = applyMaterialSettingsOp(fake.store.settings, { op: 'addCategory', name: '다른 사람 카테고리' }).settings;
          fake.store.version += 1;
        }
        await fake.write(settings, version);
      },
      isConflict: fake.isConflict,
    },
    (settings) => applyMaterialSettingsOp(settings, { op: 'addCategory', name: '내 카테고리' }),
  );
  assert.equal(result.ok, true);
  assert.equal(fake.store.reads, 2);
  assert.deepEqual(fake.store.settings.estimateCategories, ['욕실 공사', '목공사', '다른 사람 카테고리', '내 카테고리']);
});

test('a write that keeps losing gives up after the allowed attempts', async () => {
  const fake = fakeStore(empty);
  await assert.rejects(
    changeMaterialSettingsSafely(
      {
        read: fake.read,
        write: async () => {
          const error = new Error('conflict');
          error.name = 'FirestoreConflictError';
          throw error;
        },
        isConflict: fake.isConflict,
        attempts: 3,
      },
      (settings) => applyMaterialSettingsOp(settings, { op: 'addCategory', name: 'a' }),
    ),
    /conflict/,
  );
  assert.equal(fake.store.reads, 3);
});

test('a refused or unchanged change writes nothing', async () => {
  const fake = fakeStore(stored);
  const refused = await changeMaterialSettingsSafely(fake, (settings) => applyMaterialSettingsOp(settings, { op: 'addCategory', name: '목공사' }));
  assert.equal(refused.ok, false);
  const unchanged = await changeMaterialSettingsSafely(fake, (settings) => linkMaterialToEstimateCategory(settings, 'm1', '욕실 공사'));
  assert.equal(unchanged.ok && unchanged.changed, false);
  assert.equal(fake.store.writes, 0);
});

test('estimateSaveConflict compares the stored updatedAt with the one the page loaded', () => {
  const base = '2026-10-20T01:00:00.000Z';
  assert.equal(estimateSaveConflict(null, { existingId: '' }), '', 'a new version has nothing to compare');
  assert.equal(estimateSaveConflict({ updatedAt: 'x' }, { existingId: 'e1' }), '', 'a page without a base is let through');
  assert.equal(estimateSaveConflict({ updatedAt: base }, { existingId: 'e1', baseUpdatedAt: base }), '');
  assert.equal(estimateSaveConflict({ updatedAt: '2026-10-20T02:00:00.000Z' }, { existingId: 'e1', baseUpdatedAt: base }), 'changed');
  assert.equal(estimateSaveConflict(null, { existingId: 'e1', baseUpdatedAt: base }), 'deleted');
  assert.match(estimateSaveConflictMessage('changed'), /다른 컴퓨터/);
  assert.match(estimateSaveConflictMessage('deleted'), /삭제/);
  assert.equal(estimateSaveConflictMessage(''), '');
});

test('unnamedPricedLineCount finds lines the documents leave out but the totals count', () => {
  const lines = [
    { name: '거실 철거', quantity: 1, customerUnitPrice: 100 },
    { name: '', quantity: 2, customerUnitPrice: 50 },
    { name: '  ', quantity: 1, customerUnitPrice: 10 },
    { name: '', quantity: 1, customerUnitPrice: 0 },
  ];
  assert.equal(unnamedPricedLineCount(lines), 2);
});

test('deleting an estimate line keeps its 실행 내역 rows and only unlinks them', () => {
  const workLines = [
    { id: 'w1', sourceLineId: 'l1', expense: 5000 },
    { id: 'w2', sourceLineId: 'l2', expense: 100 },
    { id: 'w3', sourceLineId: 'l1', payment: 3000 },
  ];
  assert.equal(linkedWorkLineCount(workLines, 'l1'), 2);
  const next = unlinkWorkLinesFromLine(workLines, 'l1');
  assert.equal(next.length, 3);
  assert.deepEqual(next.map((line) => line.sourceLineId), ['', 'l2', '']);
  assert.equal(next[0].expense, 5000);
  assert.equal(next[2].payment, 3000);
});
