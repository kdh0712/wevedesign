import test from 'node:test';
import assert from 'node:assert/strict';
import { PUSH_PANEL_TEXT, isIosUserAgent, pushPanelState, urlBase64ToBytes } from '../app/manager-weve-7519/m/push-state.ts';

const base = { configured: true, supported: true, isIos: false, standalone: true, permission: 'default', subscribed: false };

test('panel states in order', () => {
  assert.equal(pushPanelState({ ...base, configured: false }), 'unconfigured');
  assert.equal(pushPanelState({ ...base, isIos: true, standalone: false, supported: false }), 'install-first');
  assert.equal(pushPanelState({ ...base, supported: false }), 'unsupported');
  assert.equal(pushPanelState(base), 'off');
  assert.equal(pushPanelState({ ...base, permission: 'granted', subscribed: true }), 'on');
  assert.equal(pushPanelState({ ...base, permission: 'granted', subscribed: false }), 'off');
  assert.equal(pushPanelState({ ...base, isIos: true, standalone: true }), 'off');
});

test('denied permission shows the settings hint', () => {
  assert.equal(pushPanelState({ ...base, permission: 'denied', subscribed: true }), 'denied');
  assert.match(PUSH_PANEL_TEXT.denied, /설정/);
  for (const state of ['unconfigured', 'unsupported', 'install-first', 'denied', 'off', 'on']) assert.ok(PUSH_PANEL_TEXT[state], state);
});

test('iPhone and iPad user agents', () => {
  assert.equal(isIosUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), true);
  assert.equal(isIosUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), true);
  assert.equal(isIosUserAgent('Mozilla/5.0 (Linux; Android 14)'), false);
});

test('the public key turns into the bytes the browser wants', () => {
  assert.deepEqual([...urlBase64ToBytes('AQID')], [1, 2, 3]);
  assert.deepEqual([...urlBase64ToBytes('-_8')], [251, 255]);
});
