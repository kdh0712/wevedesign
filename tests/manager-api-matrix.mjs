// Manual check of every manager API against signed sessions with different permissions.
// Usage: node tests/manager-api-matrix.mjs [baseUrl]   (reads test values from .env.local)
// Writes stay harmless: allowed writes either fail for lack of a write token or target ids that do not exist.
import { localEnv, mintSession } from './manager-test-env.mjs';

const base = process.argv[2] || 'http://localhost:3217';
const sessions = {
  admin: mintSession('admin', []),
  none: mintSession('staff', []),
  consult: mintSession('staff', ['dashboard', 'consultations']),
  estimates: mintSession('staff', ['estimates']),
  sales: mintSession('staff', ['sales']),
  portfolio: mintSession('staff', ['portfolio']),
  expired: mintSession('staff', ['dashboard', 'consultations'], { remainingSeconds: -60 }),
};
const [consultBody, consultSignature] = sessions.consult.token.split('.');
const forgedBody = Buffer.from(
  JSON.stringify({ ...JSON.parse(Buffer.from(consultBody, 'base64url').toString('utf8')), role: 'admin' }),
).toString('base64url');
const forgedToken = `${forgedBody}.${consultSignature}`;

const tokenFor = (who) => (who === 'forged' ? forgedToken : who === 'missing' ? '' : sessions[who].token);

async function call(method, path, who, body) {
  const headers = {};
  const token = tokenFor(who);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

const results = [];
const record = (name, pass, detail = '') => results.push({ name, pass, detail });
const expectStatus = async (method, path, who, expected, body) => {
  const { status } = await call(method, path, who, body);
  const pass = typeof expected === 'function' ? expected(status) : status === expected;
  record(`${method} ${path} as ${who}`, pass, `status ${status}`);
};
const notAuthBlocked = (status) => status !== 401 && status !== 403;

for (const who of ['missing', 'forged', 'expired']) await expectStatus('GET', '/api/manager/office', who, 401);

const adminOffice = await call('GET', '/api/manager/office', 'admin');
record('GET /api/manager/office as admin', adminOffice.status === 200, `status ${adminOffice.status}`);
const collections = ['consultations', 'customers', 'sites', 'estimates', 'sales', 'inventory', 'vendors', 'projects', 'categories'];
const readable = {
  consult: ['consultations'],
  sales: ['sites', 'estimates', 'sales'],
  none: [],
};
for (const who of Object.keys(readable)) {
  const office = await call('GET', '/api/manager/office', who);
  record(`GET /api/manager/office as ${who}`, office.status === 200, `status ${office.status}`);
  if (office.status !== 200 || adminOffice.status !== 200) continue;
  for (const collection of collections) {
    const adminCount = adminOffice.json?.[collection]?.length ?? 0;
    const count = office.json?.[collection]?.length ?? 0;
    const expected = readable[who].includes(collection) ? adminCount : 0;
    record(`  ${who} sees ${collection}`, count === expected, `${count} (admin ${adminCount}, expected ${expected})`);
  }
  const hasVisits = office.json?.visitStats != null;
  record(`  ${who} visitStats`, hasVisits === (who === 'consult'), `present=${hasVisits}`);
}
const dataRows = collections.filter((collection) => (adminOffice.json?.[collection]?.length ?? 0) > 0);
record('office data available for filtering checks', dataRows.length > 0, dataRows.join(',') || 'admin saw no data');

// Per-site estimate loading (#8) and the dashboard refresh / 휴지통 (#9, #10).
const firstSiteId = encodeURIComponent(adminOffice.json?.sites?.[0]?._id || 'matrix-missing-site');
for (const query of [`estimates=site&siteId=${firstSiteId}&materials=skip`, `part=estimates&siteId=${firstSiteId}`, 'part=materials']) {
  await expectStatus('GET', `/api/manager/estimate?${query}`, 'consult', 403);
  await expectStatus('GET', `/api/manager/estimate?${query}`, 'estimates', 200);
}
await expectStatus('GET', '/api/manager/office?scope=refresh', 'missing', 401);
const refreshAsConsult = await call('GET', '/api/manager/office?scope=refresh', 'consult');
record(
  'GET /api/manager/office?scope=refresh as consult',
  refreshAsConsult.status === 200 && (refreshAsConsult.json?.customers?.length ?? 0) === 0 && (refreshAsConsult.json?.estimates?.length ?? 0) === 0,
  `status ${refreshAsConsult.status}, customers ${refreshAsConsult.json?.customers?.length}, estimates ${refreshAsConsult.json?.estimates?.length}`,
);
await expectStatus('GET', '/api/manager/office?view=trash', 'consult', 403);
await expectStatus('GET', '/api/manager/office?view=trash', 'admin', 200);
await expectStatus('PATCH', '/api/manager/office', 'consult', 403, { id: 'matrix-missing', type: 'consultation' });
await expectStatus('PATCH', '/api/manager/office', 'admin', 404, { id: 'matrix-missing', type: 'consultation' });
await expectStatus('DELETE', '/api/manager/office', 'consult', 403, { id: 'matrix-missing', type: 'consultation', permanent: true });
await expectStatus('DELETE', '/api/manager/office', 'admin', 404, { id: 'matrix-missing', type: 'consultation', permanent: true });
await expectStatus('DELETE', '/api/manager/office', 'consult', 404, { id: 'matrix-missing', type: 'consultation' });

await expectStatus('GET', '/api/manager/estimate?materials=skip', 'consult', 403);
await expectStatus('GET', '/api/manager/estimate?materials=skip', 'estimates', 200);
await expectStatus('GET', '/api/manager/estimate?materials=skip', 'admin', 200);
await expectStatus('POST', '/api/manager/estimate', 'consult', 403, { action: 'deleteEstimate', id: 'missing-estimate' });

await expectStatus('POST', '/api/manager/office', 'consult', 403, { type: 'sale', data: {} });
await expectStatus('POST', '/api/manager/office', 'sales', notAuthBlocked, { type: 'sale', data: {} });
await expectStatus('POST', '/api/manager/office', 'consult', 403, { type: 'project', data: {} });
// A write permission for one type must not reach a document of another type through a client-supplied id.
await expectStatus('POST', '/api/manager/office', 'consult', 400, { type: 'consultation', id: 'siteSettings', data: { memo: 'x' } });
await expectStatus('POST', '/api/manager/office', 'portfolio', 400, { type: 'project', id: 'siteSettings', data: {} });
await expectStatus('POST', '/api/manager/estimate', 'estimates', 400, { action: 'saveEstimate', id: 'siteSettings', siteId: 'matrix-site' });
await expectStatus('POST', '/api/manager/estimate', 'estimates', 400, { action: 'saveMaterial', material: { _id: 'siteSettings', name: 'matrix' } });
await expectStatus('DELETE', '/api/manager/office', 'consult', 403, { id: 'missing-sale', type: 'sale' });
await expectStatus('DELETE', '/api/manager/office', 'admin', 400, { id: 'siteSettings', type: 'consultation' });
await expectStatus('DELETE', '/api/manager/office', 'admin', 400, { id: 'missing-account', type: 'managerAccount' });
await expectStatus('DELETE', '/api/manager/office', 'admin', 400, { id: 'missing-account' });

await expectStatus('GET', '/api/manager/settings', 'none', 200);
await expectStatus('PATCH', '/api/manager/settings', 'consult', 403, {});
await expectStatus('PATCH', '/api/manager/settings', 'portfolio', notAuthBlocked, {});

await expectStatus('GET', '/api/manager/accounts', 'consult', 403);
await expectStatus('GET', '/api/manager/accounts', 'admin', 200);
await expectStatus('POST', '/api/manager/accounts', 'consult', 403, {});
await expectStatus('DELETE', '/api/manager/accounts', 'consult', 403, {});
await expectStatus('GET', '/api/manager/alert-phones', 'missing', 401);
await expectStatus('GET', '/api/manager/alert-phones', 'consult', 403);
await expectStatus('PUT', '/api/manager/alert-phones', 'consult', 403, { phones: [] });
await expectStatus('GET', '/api/manager/alert-phones', 'admin', 200);
// Locally there is no Firebase service account, so an allowed save stops at 503 before writing anything.
await expectStatus('PUT', '/api/manager/alert-phones', 'admin', 503, { phones: ['010-1234-5678'] });
await expectStatus('POST', '/api/manager/migrate-firestore', 'consult', 403, {});
await expectStatus('POST', '/api/manager/bulk-upload', 'consult', 403, {});
await expectStatus('POST', '/api/manager/settings-image', 'consult', 403, {});
await expectStatus('POST', '/api/manager/project-main-image', 'consult', 403, {});
await expectStatus('POST', '/api/integrations/aligo-alimtalk/send', 'consult', 403, {});
await expectStatus('POST', '/api/integrations/kakao-bizform/sync', 'none', 403);
await expectStatus('POST', '/api/integrations/kakao-bizform/sync', 'consult', 200);
await expectStatus('GET', '/api/manager/office', 'estimates', 200);

// Each run logs in from its own test addresses so the in-memory attempt limit of earlier runs does not interfere.
const testIp = () => `203.0.113.${Math.floor(Math.random() * 200) + 20}`;
const login = (loginId, password, ip) =>
  fetch(`${base}/api/manager/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ loginId, password }),
  });

const loginIp = testIp();
const goodLogin = await login('admin', localEnv.MANAGER_PASSWORD, loginIp);
const goodLoginText = await goodLogin.text();
record('POST /api/manager/auth (test master password)', goodLogin.status === 200 && !goodLoginText.includes(localEnv.MANAGER_PASSWORD), `status ${goodLogin.status}`);
const badLogin = await login('admin', 'wrong-password', loginIp);
record('POST /api/manager/auth (wrong password)', badLogin.status === 401, `status ${badLogin.status}`);

const limitIp = testIp();
const limitId = `matrix-limit-${Date.now()}`;
const limitStatuses = [];
for (let attempt = 0; attempt < 6; attempt += 1) limitStatuses.push((await login(limitId, 'wrong-password', limitIp)).status);
record('login limit: 5 failures then 429', limitStatuses.join(',') === '401,401,401,401,401,429', limitStatuses.join(','));
const otherIdSameIp = await login('admin', localEnv.MANAGER_PASSWORD, limitIp);
record('login limit: other ID on that address still logs in', otherIdSameIp.status === 200, `status ${otherIdSameIp.status}`);
const lockedIp = testIp();
for (let attempt = 0; attempt < 5; attempt += 1) await login('admin', 'wrong-password', lockedIp);
const correctWhileLocked = await login('admin', localEnv.MANAGER_PASSWORD, lockedIp);
record('login limit: correct password is refused while blocked', correctWhileLocked.status === 429, `status ${correctWhileLocked.status}`);
const sameIdOtherIp = await login('admin', localEnv.MANAGER_PASSWORD, testIp());
record('login limit: same ID from another address still logs in', sameIdOtherIp.status === 200, `status ${sameIdOtherIp.status}`);

for (const { name, pass, detail } of results) console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
const failed = results.filter((result) => !result.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
