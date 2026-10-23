import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { signSessionToken } from '../app/api/manager/_token.ts';
import { handleManualRequest } from '../app/api/manager/_manual.ts';
import { MANAGER_MANUALS, manualContentDisposition, manualDownloadErrorMessage } from '../app/lib/manager-manuals.ts';
import { readPdfLinks } from '../scripts/manuals/pdf-links.mjs';

const SECRET = 'x'.repeat(32);
process.env.MANAGER_SESSION_SECRET = SECRET;

const tokenFor = (role, perms) =>
  signSessionToken({ sub: `u-${role}`, name: '직원', loginId: `id-${role}`, role, perms, src: 'account' }, Buffer.from(SECRET)).token;
const staffToken = tokenFor('staff', ['consultations']);
const adminToken = tokenFor('admin', []);

const fakePdf = new TextEncoder().encode('%PDF-1.4 test');
const readsFake = async () => fakePdf;
const request = (book, token) =>
  new Request(`http://localhost/api/manager/manual?book=${book}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

test('a request without a session is refused', async () => {
  const response = await handleManualRequest(request('office', ''), readsFake);
  assert.equal(response.status, 401);
});

test('an unknown book is refused before anything else', async () => {
  for (const token of ['', adminToken]) {
    const response = await handleManualRequest(request('nope', token), readsFake);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: '알 수 없는 설명서입니다.' });
  }
});

test('the estimate manual needs the estimates permission, the office manual only a login', async () => {
  assert.equal((await handleManualRequest(request('estimate', staffToken), readsFake)).status, 403);
  assert.equal((await handleManualRequest(request('office', staffToken), readsFake)).status, 200);
});

test('an admin gets both manuals as PDF attachments that are never cached', async () => {
  for (const book of ['office', 'estimate']) {
    const response = await handleManualRequest(request(book, adminToken), readsFake);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'application/pdf');
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(response.headers.get('Content-Disposition'), manualContentDisposition(book));
    assert.ok(Buffer.from(await response.arrayBuffer()).toString('latin1').startsWith('%PDF-'));
  }
});

test('a missing manual file answers 404', async () => {
  const response = await handleManualRequest(request('office', adminToken), async () => null);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: '설명서 파일이 없습니다. 관리자에게 문의해 주세요.' });
});

test('the manual table holds the permission rules and file names', () => {
  assert.deepEqual(MANAGER_MANUALS.estimate.anyOf, ['estimates']);
  assert.equal(MANAGER_MANUALS.office.anyOf, undefined);
  assert.equal(MANAGER_MANUALS.office.downloadName, 'WEVE 통합 매니저 사용 설명서.pdf');
  assert.equal(MANAGER_MANUALS.estimate.downloadName, 'WEVE 견적 작업 사용 설명서.pdf');
  assert.equal(MANAGER_MANUALS.office.file, 'office.pdf');
  assert.equal(MANAGER_MANUALS.estimate.file, 'estimate.pdf');
});

test('the download name has an ASCII fallback and a UTF-8 form', () => {
  assert.equal(
    manualContentDisposition('office'),
    `attachment; filename="weve-office-manual.pdf"; filename*=UTF-8''${encodeURIComponent('WEVE 통합 매니저 사용 설명서.pdf')}`,
  );
  assert.ok(manualContentDisposition('estimate').startsWith('attachment; filename="weve-estimate-manual.pdf"; '));
});

test('download errors are told in plain words', () => {
  assert.equal(manualDownloadErrorMessage(401), '로그인이 끝났습니다. 다시 로그인해 주세요.');
  assert.equal(manualDownloadErrorMessage(403), '이 설명서를 받을 권한이 없습니다.');
  assert.equal(manualDownloadErrorMessage(500), '설명서를 내려받지 못했습니다. 잠시 후 다시 시도해 주세요.');
  assert.equal(manualDownloadErrorMessage(0), '설명서를 내려받지 못했습니다. 잠시 후 다시 시도해 주세요.');
});

// The PDFs made by `npm run manuals` and committed in manuals/ (spec 2026-10-23 §6).
for (const book of ['office', 'estimate']) {
  const file = new URL(`../manuals/${MANAGER_MANUALS[book].file}`, import.meta.url);
  // estimate.pdf is required once the estimate manual exists (plan Task 6).
  const missingAllowed = book === 'estimate' && !existsSync(file);
  test(`the committed ${book} manual fits the 4MB limit and every link stays inside it`, { skip: missingAllowed }, () => {
    const bytes = readFileSync(file);
    assert.ok(bytes.length <= 4_000_000, `${bytes.length} bytes`);
    const { pageCount, links } = readPdfLinks(bytes);
    assert.ok(pageCount >= 2);
    assert.ok(links.length > 0);
    for (const link of links) {
      assert.equal(link.uri, null);
      assert.ok(link.targetPage >= 1 && link.targetPage <= pageCount, `link on page ${link.page} goes to ${link.targetPage}`);
    }
  });
}
