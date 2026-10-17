import test from 'node:test';
import assert from 'node:assert/strict';
import { decideLinkOnUpload, shouldCloseLinkOnSave } from '../app/api/manager/_progress-link-rules.ts';

// decideLinkOnUpload: what the first progress upload does to the customer link.

test('no code and a customer phone creates the link', () => {
  assert.deepEqual(decideLinkOnUpload({}, true), { action: 'create' });
  assert.deepEqual(decideLinkOnUpload({ progressEnabled: false }, true), { action: 'create' });
});

test('an empty code counts as no code', () => {
  assert.deepEqual(decideLinkOnUpload({ progressCode: '' }, true), { action: 'create' });
  assert.deepEqual(decideLinkOnUpload({ progressCode: '', progressEnabled: true }, false), { action: 'none', reason: 'no-customer-phone' });
});

test('no code and no customer phone creates nothing', () => {
  assert.deepEqual(decideLinkOnUpload({}, false), { action: 'none', reason: 'no-customer-phone' });
  assert.deepEqual(decideLinkOnUpload({ progressCode: undefined }, false), { action: 'none', reason: 'no-customer-phone' });
});

test('a code with the link on keeps it on, with or without a phone', () => {
  assert.deepEqual(decideLinkOnUpload({ progressCode: 'abc', progressEnabled: true }, true), { action: 'keep-on' });
  assert.deepEqual(decideLinkOnUpload({ progressCode: 'abc', progressEnabled: true }, false), { action: 'keep-on' });
});

test('a code with the link off keeps it off: staff or 완료 turned it off and an upload never turns it back on', () => {
  assert.deepEqual(decideLinkOnUpload({ progressCode: 'abc', progressEnabled: false }, true), { action: 'keep-off', reason: 'link-off' });
  assert.deepEqual(decideLinkOnUpload({ progressCode: 'abc' }, true), { action: 'keep-off', reason: 'link-off' });
  assert.deepEqual(decideLinkOnUpload({ progressCode: 'abc', progressEnabled: false }, false), { action: 'keep-off', reason: 'link-off' });
});

// A site that is already '완료' never gets a link created: 완료 closes links, so the first upload must not open one.

test('a 완료 site with no code and a phone gets no link', () => {
  assert.deepEqual(decideLinkOnUpload({ status: '완료' }, true), { action: 'keep-off', reason: 'site-done' });
  assert.deepEqual(decideLinkOnUpload({ progressCode: '', progressEnabled: false, status: '완료' }, true), { action: 'keep-off', reason: 'site-done' });
});

test('a 완료 site with no code and no phone is site-done, not no-customer-phone', () => {
  assert.deepEqual(decideLinkOnUpload({ status: '완료' }, false), { action: 'keep-off', reason: 'site-done' });
});

test('a 완료 site with an existing enabled code keeps it on: only the move into 완료 closes a link', () => {
  assert.deepEqual(decideLinkOnUpload({ progressCode: 'abc', progressEnabled: true, status: '완료' }, true), { action: 'keep-on' });
  assert.deepEqual(decideLinkOnUpload({ progressCode: 'abc', progressEnabled: true, status: '완료' }, false), { action: 'keep-on' });
});

test('a 완료 site with an existing code that is off stays link-off', () => {
  assert.deepEqual(decideLinkOnUpload({ progressCode: 'abc', progressEnabled: false, status: '완료' }, true), { action: 'keep-off', reason: 'link-off' });
});

test('a site that is not 완료 is decided as before whatever its status', () => {
  assert.deepEqual(decideLinkOnUpload({ status: '시공중' }, true), { action: 'create' });
  assert.deepEqual(decideLinkOnUpload({ status: '상담완료' }, true), { action: 'create' });
  assert.deepEqual(decideLinkOnUpload({ status: '시공중' }, false), { action: 'none', reason: 'no-customer-phone' });
  assert.deepEqual(decideLinkOnUpload({ progressCode: 'abc', progressEnabled: true, status: '시공중' }, true), { action: 'keep-on' });
});

// shouldCloseLinkOnSave: a site saved into '완료' closes its link, once.

test('the transition into 완료 with the link on closes the link', () => {
  assert.equal(shouldCloseLinkOnSave('시공중', '완료', true), true);
  assert.equal(shouldCloseLinkOnSave('견적중', '완료', true), true);
});

test('a re-save of a site that is already 완료 does not close a link staff switched back on', () => {
  assert.equal(shouldCloseLinkOnSave('완료', '완료', true), false);
});

test('a link that is already off or missing is not closed', () => {
  assert.equal(shouldCloseLinkOnSave('시공중', '완료', false), false);
  assert.equal(shouldCloseLinkOnSave('시공중', '완료', undefined), false);
});

test('a save that does not end in 완료 does not close the link', () => {
  assert.equal(shouldCloseLinkOnSave('시공중', '시공중', true), false);
  assert.equal(shouldCloseLinkOnSave('완료', '시공중', true), false);
  assert.equal(shouldCloseLinkOnSave('시공중', undefined, true), false);
  assert.equal(shouldCloseLinkOnSave(undefined, undefined, true), false);
});

test('a record with no earlier status saved as 완료 closes an enabled link', () => {
  assert.equal(shouldCloseLinkOnSave(undefined, '완료', true), true);
});
