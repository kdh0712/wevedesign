import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ADMIN_BUTTON_JSON, adminButtonJson, isAligoSuccess, normalizeTemplateText } from '../app/api/send-consultation/aligo-admin.ts';

test('normalizeTemplateText turns typed-out and Windows line breaks into real ones', () => {
  assert.equal(normalizeTemplateText('신규 상담 요청이 접수되었습니다.\\n\\n고객명: #{고객명}'), '신규 상담 요청이 접수되었습니다.\n\n고객명: #{고객명}');
  assert.equal(normalizeTemplateText('a\\r\\nb'), 'a\nb');
  assert.equal(normalizeTemplateText('a\r\nb\rc'), 'a\nb\nc');
  assert.equal(normalizeTemplateText('그대로\n유지'), '그대로\n유지');
});

test('adminButtonJson defaults to the approved 관리페이지 button', () => {
  const parsed = JSON.parse(adminButtonJson(undefined));
  assert.equal(adminButtonJson(''), DEFAULT_ADMIN_BUTTON_JSON);
  assert.equal(adminButtonJson('   '), DEFAULT_ADMIN_BUTTON_JSON);
  assert.deepEqual(parsed, {
    button: [{ name: '관리페이지', linkType: 'WL', linkTypeName: '웹링크', linkMo: 'https://www.wevedesign.co.kr/manager-weve-7519' }],
  });
  assert.equal(adminButtonJson(' {"button":[]} '), '{"button":[]}');
});

test('isAligoSuccess accepts only an explicit success code', () => {
  assert.equal(isAligoSuccess({ code: 0, message: '성공적으로 전송요청 하였습니다.' }), true);
  assert.equal(isAligoSuccess({ code: '0' }), true);
  assert.equal(isAligoSuccess({ code: -99, message: '계정 오류' }), false);
  assert.equal(isAligoSuccess({}), false);
  assert.equal(isAligoSuccess({ message: '<html>error</html>' }), false);
});
