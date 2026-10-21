import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOGIN_FAILED_MESSAGE,
  LOGOUT_FAILED_MESSAGE,
  isFirebaseCredentialRefusal,
  reloadSourceOutage,
  sessionFailureAnswer,
} from '../app/api/manager/_login-rules.ts';

test('a Firebase account on a server without the Firebase settings is an outage, not a removed account', () => {
  assert.match(reloadSourceOutage('firebase', { firebaseConfigured: false }), /Firebase/);
  assert.equal(reloadSourceOutage('firebase', { firebaseConfigured: true }), null);
  assert.equal(reloadSourceOutage('account', { firebaseConfigured: false }), null);
  assert.equal(reloadSourceOutage('master', { firebaseConfigured: false }), null);
});

test('a failed phone login or logout answers a fixed message, never the server error', () => {
  assert.deepEqual(sessionFailureAnswer('login'), { status: 500, error: LOGIN_FAILED_MESSAGE });
  assert.deepEqual(sessionFailureAnswer('logout'), { status: 500, error: LOGOUT_FAILED_MESSAGE });
  assert.equal(sessionFailureAnswer('refresh').status, 503, 'a refresh failure keeps the device');
  assert.equal(sessionFailureAnswer(undefined).status, 500);
  for (const action of ['login', 'logout', 'refresh', 'other']) {
    assert.ok(!/firebase|sanity|firestore|http/i.test(sessionFailureAnswer(action).error), action);
  }
});

test('Firebase refusals of the email or password are told apart from outages', () => {
  for (const message of ['INVALID_LOGIN_CREDENTIALS', 'INVALID_PASSWORD', 'EMAIL_NOT_FOUND', 'INVALID_EMAIL', 'USER_DISABLED', 'INVALID_PASSWORD : extra detail']) {
    assert.equal(isFirebaseCredentialRefusal(new Error(message)), true, message);
  }
  assert.equal(isFirebaseCredentialRefusal(new Error('Firebase request failed: 500')), false);
  assert.equal(isFirebaseCredentialRefusal(new Error('TOO_MANY_ATTEMPTS_TRY_LATER')), false);
  assert.equal(isFirebaseCredentialRefusal(new TypeError('fetch failed')), false);
  assert.equal(isFirebaseCredentialRefusal('INVALID_PASSWORD'), false);
});
