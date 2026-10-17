import test from 'node:test';
import assert from 'node:assert/strict';
import { SCRUBBED_PROGRESS_PATH, isProgressPath, scrubProgressUrl } from '../app/lib/analytics-scrub.ts';

const code = 'Zm9vYmFyYmF6cXV4MTIzNA';

test('progress paths are recognised, other paths are not', () => {
  assert.equal(isProgressPath(`/progress/${code}`), true);
  assert.equal(isProgressPath(`/progress/${code}/`), true);
  assert.equal(isProgressPath('/progress'), true);
  assert.equal(isProgressPath(`//progress/${code}`), true);
  assert.equal(isProgressPath(`/%70rogress/${code}`), true);
  assert.equal(isProgressPath('/'), false);
  assert.equal(isProgressPath('/portfolio/some-project'), false);
  assert.equal(isProgressPath('/progressive'), false);
  assert.equal(isProgressPath('/work-method/progress'), false);
  assert.equal(isProgressPath(''), false);
  assert.equal(isProgressPath(null), false);
  assert.equal(isProgressPath(undefined), false);
  assert.equal(isProgressPath('/%E0%A4%A'), false);
});

test('scrubProgressUrl rewrites any progress URL to /progress/[code], dropping query and hash', () => {
  assert.equal(SCRUBBED_PROGRESS_PATH, '/progress/[code]');
  assert.equal(scrubProgressUrl(`https://www.wevedesign.co.kr/progress/${code}`), 'https://www.wevedesign.co.kr/progress/[code]');
  assert.equal(scrubProgressUrl(`https://www.wevedesign.co.kr/progress/${code}?utm=1&c=${code}#top`), 'https://www.wevedesign.co.kr/progress/[code]');
  assert.equal(scrubProgressUrl(`http://localhost:3000/progress/${code}/`), 'http://localhost:3000/progress/[code]');
  assert.equal(scrubProgressUrl(`https://www.wevedesign.co.kr/%70rogress/${code}`), 'https://www.wevedesign.co.kr/progress/[code]');
  assert.equal(scrubProgressUrl(`/progress/${code}?x=1`), '/progress/[code]');
  assert.ok(!scrubProgressUrl(`https://www.wevedesign.co.kr/progress/${code}?next=/progress/${code}`).includes(code));
});

test('scrubProgressUrl leaves every other URL exactly as it was', () => {
  for (const url of [
    'https://www.wevedesign.co.kr/',
    'https://www.wevedesign.co.kr/portfolio/some-project?utm_source=naver#gallery',
    'https://www.wevedesign.co.kr/progressive',
    'https://www.wevedesign.co.kr/about/progress/',
    '/consultation?x=1',
  ]) {
    assert.equal(scrubProgressUrl(url), url);
  }
});

test('scrubProgressUrl drops an unreadable URL that mentions the progress path', () => {
  assert.equal(scrubProgressUrl(`http://${'['}/progress/${code}`), SCRUBBED_PROGRESS_PATH);
  assert.equal(scrubProgressUrl('http://['), 'http://[');
});
