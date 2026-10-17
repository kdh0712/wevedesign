import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FirestoreConflictError,
  buildPatchQuery,
  isFirestoreConflictError,
  isFirestoreConflictResponse,
  maskedWrite,
  quoteFieldPath,
} from '../app/api/manager/_firestore-rest.ts';

test('simple field names are used as they are', () => {
  for (const key of ['progressAccess', 'notifyLog', '_id', 'a', 'A_1', 'field2', '__name']) assert.equal(quoteFieldPath(key), key);
});

test('any other field name is wrapped in backticks, with ` and \\ escaped', () => {
  assert.equal(quoteFieldPath('customer-name'), '`customer-name`');
  assert.equal(quoteFieldPath('2nd'), '`2nd`');
  assert.equal(quoteFieldPath('a.b'), '`a.b`');
  assert.equal(quoteFieldPath('a b'), '`a b`');
  assert.equal(quoteFieldPath('현장명'), '`현장명`');
  assert.equal(quoteFieldPath('a`b'), '`a\\`b`');
  assert.equal(quoteFieldPath('a\\b'), '`a\\\\b`');
  assert.equal(quoteFieldPath('`\\`'), '`\\`\\\\\\``');
});

test('the patch query names one mask path per field, each URL-encoded', () => {
  assert.equal(buildPatchQuery(['progressAccess']), 'updateMask.fieldPaths=progressAccess');
  assert.equal(
    buildPatchQuery(['progressCode', 'progressEnabled', 'progressCodeCreatedAt']),
    'updateMask.fieldPaths=progressCode&updateMask.fieldPaths=progressEnabled&updateMask.fieldPaths=progressCodeCreatedAt',
  );
  assert.equal(buildPatchQuery(['a b', 'x&y=z']), 'updateMask.fieldPaths=%60a%20b%60&updateMask.fieldPaths=%60x%26y%3Dz%60');

  // What Firestore reads back out of the query string is exactly the quoted path.
  const params = new URLSearchParams(buildPatchQuery(['현장명', 'a`b', 'c\\d', 'plain']));
  assert.deepEqual(params.getAll('updateMask.fieldPaths'), ['`현장명`', '`a\\`b`', '`c\\\\d`', 'plain']);
});

test('the patch query carries the precondition', () => {
  assert.equal(buildPatchQuery(['notifyLog'], { exists: true }), 'updateMask.fieldPaths=notifyLog&currentDocument.exists=true');

  const updateTime = '2026-10-17T05:30:00.123456Z';
  const query = buildPatchQuery(['progressAccess'], { updateTime });
  assert.equal(query, 'updateMask.fieldPaths=progressAccess&currentDocument.updateTime=2026-10-17T05%3A30%3A00.123456Z');
  assert.equal(new URLSearchParams(query).get('currentDocument.updateTime'), updateTime);
  assert.equal(new URLSearchParams(query).has('currentDocument.exists'), false);
});

test('a patch with no mask path or an empty version is refused, since it would replace the whole document', () => {
  assert.throws(() => buildPatchQuery([]), /mask/);
  assert.throws(() => buildPatchQuery([], { exists: true }), /mask/);
  assert.throws(() => buildPatchQuery(['progressAccess'], { updateTime: '' }), /updateTime/);
});

test('maskedWrite leaves the preserved fields out of the mask and the body', () => {
  const merged = {
    _id: 'site-1',
    title: '테스트 현장',
    status: '완료',
    '현장 메모': 'x',
    progressCode: 'stale-code',
    progressEnabled: true,
    progressCodeCreatedAt: '2026-10-01T00:00:00.000Z',
    progressAccess: { failedCount: 0, lockedUntil: '' },
  };
  const preserve = ['progressCode', 'progressEnabled', 'progressCodeCreatedAt', 'progressAccess'];
  const write = maskedWrite(merged, preserve);
  assert.deepEqual(write.fieldPaths, ['_id', 'title', 'status', '현장 메모']);
  assert.deepEqual(write.fields, { _id: 'site-1', title: '테스트 현장', status: '완료', '현장 메모': 'x' });
  for (const field of preserve) {
    assert.equal(write.fieldPaths.includes(field), false, field);
    assert.equal(field in write.fields, false, field);
  }
  // The merged record itself is not changed.
  assert.equal(merged.progressCode, 'stale-code');

  // Nothing preserved: every key is written.
  assert.deepEqual(maskedWrite({ a: 1, b: undefined }, []).fieldPaths, ['a', 'b']);
});

test('precondition failures, a missing document and contention count as conflicts; other errors do not', () => {
  assert.equal(isFirestoreConflictResponse(400, 'FAILED_PRECONDITION'), true);
  assert.equal(isFirestoreConflictResponse(404, 'NOT_FOUND'), true);
  assert.equal(isFirestoreConflictResponse(409, 'ABORTED'), true);
  assert.equal(isFirestoreConflictResponse(404, undefined), true);
  assert.equal(isFirestoreConflictResponse(409, undefined), true);

  assert.equal(isFirestoreConflictResponse(400, 'INVALID_ARGUMENT'), false);
  assert.equal(isFirestoreConflictResponse(400, undefined), false);
  assert.equal(isFirestoreConflictResponse(401, 'UNAUTHENTICATED'), false);
  assert.equal(isFirestoreConflictResponse(403, 'PERMISSION_DENIED'), false);
  assert.equal(isFirestoreConflictResponse(429, 'RESOURCE_EXHAUSTED'), false);
  assert.equal(isFirestoreConflictResponse(500, 'INTERNAL'), false);
  assert.equal(isFirestoreConflictResponse(503, 'UNAVAILABLE'), false);
});

test('FirestoreConflictError can be told apart from other errors', () => {
  const error = new FirestoreConflictError('FAILED_PRECONDITION', 'the stored version does not match the required base version');
  assert.ok(error instanceof Error);
  assert.equal(error.name, 'FirestoreConflictError');
  assert.equal(error.firestoreStatus, 'FAILED_PRECONDITION');
  assert.match(error.detail, /stored version/);
  assert.ok(error.message.length > 0);
  assert.equal(isFirestoreConflictError(error), true);

  assert.equal(isFirestoreConflictError(new Error('Firestore document save failed')), false);
  assert.equal(isFirestoreConflictError(new TypeError('fetch failed')), false);
  assert.equal(isFirestoreConflictError(null), false);
  assert.equal(isFirestoreConflictError('FirestoreConflictError'), false);
});
