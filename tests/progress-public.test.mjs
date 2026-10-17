import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROGRESS_LINK_OFF_MESSAGE,
  PROGRESS_RETRY_MESSAGE,
  isProgressCodeShape,
  progressLockedMessage,
  progressPhotoUrl,
} from '../app/lib/progress-public.ts';

test('photo urls ask the Sanity CDN for a resized, auto-format image', () => {
  const url = 'https://cdn.sanity.io/images/p/d/abc123-2000x1500.jpg';
  assert.equal(progressPhotoUrl(url, 800), `${url}?w=800&auto=format`);
  assert.equal(progressPhotoUrl(url, 1600), `${url}?w=1600&auto=format`);
});

test('photo urls that already have a query string get the parameters appended', () => {
  assert.equal(progressPhotoUrl('https://cdn.example/a.jpg?dl=1', 800), 'https://cdn.example/a.jpg?dl=1&w=800&auto=format');
});

test('code shape accepts base64url codes and rejects anything else', () => {
  assert.equal(isProgressCodeShape('x'), true);
  assert.equal(isProgressCodeShape('Zm9vYmFyYmF6cXV4MTIzNA'), true);
  assert.equal(isProgressCodeShape('with-dash_and_underscore'), true);
  assert.equal(isProgressCodeShape(''), false);
  assert.equal(isProgressCodeShape(' abc'), false);
  assert.equal(isProgressCodeShape('abc def'), false);
  assert.equal(isProgressCodeShape('a/b'), false);
  assert.equal(isProgressCodeShape('a'.repeat(129)), false);
});

test('the lock message rounds the wait up to whole minutes', () => {
  assert.equal(progressLockedMessage(900), '확인 시도가 너무 많습니다. 15분 뒤에 다시 시도해 주세요.');
  assert.equal(progressLockedMessage(61), '확인 시도가 너무 많습니다. 2분 뒤에 다시 시도해 주세요.');
  assert.equal(progressLockedMessage(1), '확인 시도가 너무 많습니다. 1분 뒤에 다시 시도해 주세요.');
});

test('the link-off message is the one the spec asks for', () => {
  assert.equal(PROGRESS_LINK_OFF_MESSAGE, '링크가 꺼져 있습니다. 위브디자인(031-381-0489)으로 문의해 주세요.');
});

test('the retry message for a check that could not be recorded', () => {
  assert.equal(PROGRESS_RETRY_MESSAGE, '잠시 후 다시 시도해 주세요.');
});
