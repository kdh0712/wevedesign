import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOGIN_FAILED_MESSAGE,
  LOGOUT_FAILED_MESSAGE,
  chooseLoginAccount,
  isFirebaseCredentialRefusal,
  reloadSourceOutage,
  usableIdAccount,
  sessionFailureAnswer,
} from '../app/api/manager/_login-rules.ts';
import { hashPassword, isPasswordHash } from '../app/api/manager/_password.ts';

test('a Firebase account on a server without the Firebase settings is an outage, not a removed account', () => {
  assert.match(reloadSourceOutage('firebase', { firebaseConfigured: false }), /Firebase/);
  assert.equal(reloadSourceOutage('firebase', { firebaseConfigured: true }), null);
  assert.equal(reloadSourceOutage('account', { firebaseConfigured: false }), null);
  assert.equal(reloadSourceOutage('master', { firebaseConfigured: false }), null);
});

test('an ID account on a server without the Firestore service account is an outage, not a removed account', () => {
  assert.equal(reloadSourceOutage('firestore', { firebaseConfigured: true, firestoreConfigured: false }), 'Firestore 설정이 없어 계정을 확인할 수 없습니다.');
  assert.equal(reloadSourceOutage('firestore', { firebaseConfigured: false, firestoreConfigured: true }), null);
  assert.equal(reloadSourceOutage('account', { firebaseConfigured: true, firestoreConfigured: false }), null);
});

test('callers that do not say whether Firestore is set up keep the old answers', () => {
  assert.equal(reloadSourceOutage('firestore', { firebaseConfigured: true }), null);
  assert.match(reloadSourceOutage('firebase', { firebaseConfigured: false }), /Firebase/);
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

test('login uses an on Firestore ID account with a real scrypt hash before the Sanity account', async () => {
  const hash = await hashPassword('pass1234');
  const idAccount = { _id: 'acct-1', isActive: true, passwordHash: hash };
  const sanity = { _id: 'managerAccount-1', password: 'old' };
  assert.deepEqual(chooseLoginAccount(idAccount, sanity, isPasswordHash), { src: 'firestore', account: idAccount, storedHash: hash });
  assert.deepEqual(chooseLoginAccount(null, sanity, isPasswordHash), { src: 'account', account: sanity, storedHash: 'old' });
  assert.equal(chooseLoginAccount(null, null, isPasswordHash), null);
});

test('an off ID account counts as missing at login', async () => {
  const idAccount = { _id: 'acct-1', isActive: false, passwordHash: await hashPassword('pass1234') };
  const sanity = { _id: 'managerAccount-1', password: 'old' };
  assert.equal(chooseLoginAccount(idAccount, null, isPasswordHash), null);
  assert.equal(chooseLoginAccount(idAccount, sanity, isPasswordHash).src, 'account');
});

// The server only ever writes scrypt hashes to managerAccounts; anything else was not written by it and must never log in
// (verifyPassword would otherwise compare it as an old plain-text password).
test('an ID account whose stored value is not a scrypt hash never logs in', () => {
  for (const passwordHash of ['hunter2hunter2', '', undefined, 'scrypt$x']) {
    assert.equal(chooseLoginAccount({ _id: 'acct-1', isActive: true, passwordHash }, null, isPasswordHash), null, String(passwordHash));
  }
  assert.equal(usableIdAccount({ _id: 'acct-1', isActive: true, passwordHash: 'hunter2hunter2' }, isPasswordHash), null);
});

test('a phone refresh keeps an ID account only while it is on and holds a scrypt hash', async () => {
  const hash = await hashPassword('pass1234');
  const on = { _id: 'acct-1', isActive: true, passwordHash: hash };
  assert.equal(usableIdAccount(on, isPasswordHash), on);
  assert.equal(usableIdAccount({ ...on, isActive: false }, isPasswordHash), null);
  assert.equal(usableIdAccount(null, isPasswordHash), null);
});
