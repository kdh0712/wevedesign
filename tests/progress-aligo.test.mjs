import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { readProgressAlimtalkConfig, sendAlimtalk } from '../app/api/manager/_aligo.ts';

const baseEnv = {
  ALIGO_PROGRESS_TEMPLATE_CODE: 'UM_5930',
  ALIGO_PROGRESS_MESSAGE_TEMPLATE: '안내\\n#{고객명}',
  ALIGO_PROGRESS_BUTTON_JSON: '{"button":[]}',
};

test('the progress alimtalk uses its own sender key when one is set', () => {
  const config = readProgressAlimtalkConfig({ ...baseEnv, ALIGO_PROGRESS_SENDER_KEY: ' progress-key ', ALIGO_SENDER_KEY: 'shared-key' });
  assert.equal(config?.senderKey, 'progress-key');
});

test('the progress alimtalk falls back to the shared sender key', () => {
  assert.equal(readProgressAlimtalkConfig({ ...baseEnv, ALIGO_SENDER_KEY: 'shared-key' })?.senderKey, 'shared-key');
  assert.equal(readProgressAlimtalkConfig({ ...baseEnv, ALIGO_PROGRESS_SENDER_KEY: '  ', ALIGO_SENDER_KEY: 'shared-key' })?.senderKey, 'shared-key');
});

test('the config is still incomplete without the template code, the message or the button', () => {
  assert.equal(readProgressAlimtalkConfig({ ...baseEnv, ALIGO_PROGRESS_TEMPLATE_CODE: '', ALIGO_PROGRESS_SENDER_KEY: 'k' }), null);
  assert.equal(readProgressAlimtalkConfig({ ...baseEnv, ALIGO_PROGRESS_BUTTON_JSON: '', ALIGO_PROGRESS_SENDER_KEY: 'k' }), null);
});

const savedEnv = { ...process.env };
const savedFetch = globalThis.fetch;
let sentBodies = [];

beforeEach(() => {
  sentBodies = [];
  process.env.ALIGO_API_KEY = 'api';
  process.env.ALIGO_USER_ID = 'user';
  process.env.ALIGO_SENDER_KEY = 'shared-key';
  process.env.ALIGO_SENDER_PHONE = '0313810489';
  delete process.env.ALIGO_TEST_MODE;
  globalThis.fetch = async (_url, init) => {
    sentBodies.push(new URLSearchParams(String(init.body)));
    return new Response(JSON.stringify({ code: 0, message: '성공', info: { mid: 1 } }), { status: 200 });
  };
});

afterEach(() => {
  globalThis.fetch = savedFetch;
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
});

const input = { templateCode: 'UM_5930', receiver: '010-1234-5678', receiverName: '테스트', subject: '공사 진행 안내', message: '안내' };

test('sendAlimtalk sends with the sender key it is given', async () => {
  const result = await sendAlimtalk({ ...input, senderKey: 'progress-key' });
  assert.equal(result.ok, true);
  assert.equal(sentBodies[0].get('senderkey'), 'progress-key');
  assert.equal(sentBodies[0].get('tpl_code'), 'UM_5930');
});

test('sendAlimtalk falls back to ALIGO_SENDER_KEY when no key is given', async () => {
  await sendAlimtalk(input);
  assert.equal(sentBodies[0].get('senderkey'), 'shared-key');
});

test('sendAlimtalk names the missing sender key and sends nothing', async () => {
  delete process.env.ALIGO_SENDER_KEY;
  const result = await sendAlimtalk(input);
  assert.equal(result.ok, false);
  assert.match(result.error, /ALIGO_PROGRESS_SENDER_KEY/);
  assert.equal(sentBodies.length, 0);
});
