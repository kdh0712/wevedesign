import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// On Windows the Korean IME switches to English in a field marked inputMode (decimal, numeric, tel...) and stays English
// in the next field, so typing Korean after Tab-ing through 수량·단가 came out in English. The estimate screens are worked on
// a PC with the keyboard: their number fields carry no inputMode (they still accept only numbers).
test('the estimate screens have no inputMode hint that would switch the Korean IME to English', () => {
  const dir = new URL('../app/manager-weve-7519/estimate/', import.meta.url);
  const offenders = readdirSync(dir)
    .filter((name) => name.endsWith('.tsx'))
    .flatMap((name) =>
      readFileSync(new URL(name, dir), 'utf8')
        .split(/\r?\n/)
        .map((line, index) => (/inputMode=/.test(line) ? `${name}:${index + 1}` : ''))
        .filter(Boolean),
    );
  assert.deepEqual(offenders, []);
});
