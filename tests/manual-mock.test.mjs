import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMockData, mockInitScript, routeMock } from '../scripts/manuals/mock-data.mjs';

const data = buildMockData(new Date(2026, 9, 23));
// The page gets routeMock as source text, so it must work without anything from this module's scope.
const pageRouteMock = new Function(`return (${routeMock.toString()});`)();

test('every manager and integration API path is answered by the mock, never sent to a real server', () => {
  for (const url of ['/api/manager/office', '/api/manager/whatever?x=1', '/api/integrations/x/y', '/api/manager/estimate?part=materials']) {
    for (const method of ['GET', 'POST']) {
      assert.notEqual(pageRouteMock(data, method, url, null), null, `${method} ${url}`);
    }
  }
});

test('anything else goes to the dev server as usual', () => {
  for (const url of ['/_next/static/chunks/a.js', '/weve-mark.png', '/manager-weve-7519']) {
    assert.equal(pageRouteMock(data, 'GET', url, null), null, url);
  }
});

test('the made-up data has only made-up phone numbers and example.com addresses', () => {
  const text = JSON.stringify(data);
  const phones = text.match(/01\d-?\d{3,4}-?\d{4}/g) || [];
  assert.ok(phones.length > 0);
  for (const phone of phones) assert.match(phone, /^010-0000-\d{4}$/);
  for (const email of text.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) || []) assert.match(email, /@example\.com$/);
});

test('the init script is valid JavaScript', () => {
  assert.doesNotThrow(() => new Function(mockInitScript(data, { session: true })));
  assert.doesNotThrow(() => new Function(mockInitScript(data, { session: false })));
});
