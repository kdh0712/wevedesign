import test from 'node:test';
import assert from 'node:assert/strict';
import * as progressPublic from '../app/lib/progress-public.ts';
import {
  PROGRESS_LINK_OFF_MESSAGE,
  PROGRESS_PHOTOS_UNAVAILABLE_MESSAGE,
  PROGRESS_RETRY_MESSAGE,
  isProgressCodeShape,
  progressLockedMessage,
} from '../app/lib/progress-public.ts';

test('the notice for photos whose URLs could not be made asks for a reload', () => {
  assert.equal(PROGRESS_PHOTOS_UNAVAILABLE_MESSAGE, '사진을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.');
});

test('photo URLs are used as signed, with no Sanity resize helper left', () => {
  assert.equal('progressPhotoUrl' in progressPublic, false);
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
  assert.equal(progressLockedMessage(59), '확인 시도가 너무 많습니다. 1분 뒤에 다시 시도해 주세요.');
  assert.equal(progressLockedMessage(59 * 60), '확인 시도가 너무 많습니다. 59분 뒤에 다시 시도해 주세요.');
});

test('a lock of an hour or more is told in hours and minutes', () => {
  assert.equal(progressLockedMessage(60 * 60), '확인 시도가 너무 많습니다. 1시간 뒤에 다시 시도해 주세요.');
  assert.equal(progressLockedMessage(59 * 60 + 1), '확인 시도가 너무 많습니다. 1시간 뒤에 다시 시도해 주세요.', 'rounded up to 60 minutes');
  assert.equal(progressLockedMessage(90 * 60), '확인 시도가 너무 많습니다. 1시간 30분 뒤에 다시 시도해 주세요.');
  assert.equal(progressLockedMessage(90 * 60 - 30), '확인 시도가 너무 많습니다. 1시간 30분 뒤에 다시 시도해 주세요.', 'minutes round up');
  assert.equal(progressLockedMessage(2 * 60 * 60 + 60), '확인 시도가 너무 많습니다. 2시간 1분 뒤에 다시 시도해 주세요.');
  assert.equal(progressLockedMessage(24 * 60 * 60), '확인 시도가 너무 많습니다. 24시간 뒤에 다시 시도해 주세요.');
});

test('the link-off message is the one the spec asks for', () => {
  assert.equal(PROGRESS_LINK_OFF_MESSAGE, '링크가 꺼져 있습니다. 위브디자인(031-381-0489)으로 문의해 주세요.');
});

test('the retry message for a check that could not be recorded', () => {
  assert.equal(PROGRESS_RETRY_MESSAGE, '잠시 후 다시 시도해 주세요.');
});
