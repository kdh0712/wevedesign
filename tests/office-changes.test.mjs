import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_OFFICE_VERSION_LENGTH,
  MAX_OFFICE_VERSIONS_PARAM_LENGTH,
  OFFICE_CHANGES_COLLECTION,
  OFFICE_COLLECTION_LISTS,
  OFFICE_FULL_REFRESH_MS,
  OFFICE_TRACKED_COLLECTIONS,
  changedOfficeCollections,
  completeOfficeVersions,
  createOfficeVersionToken,
  createOfficeVersions,
  encodeOfficeVersionsParam,
  mergeOfficeLists,
  officeRefreshVersionsParam,
  parseOfficeVersionsParam,
  readOfficeDataWithVersions,
  readableOfficeCollections,
  shouldApplyOfficeRefresh,
  shouldBumpForPatch,
  shouldBumpOfficeChanges,
  unchangedOfficeCollections,
} from '../app/lib/office-changes.ts';
import { canReadOffice, filterOfficeData } from '../app/lib/manager-permissions.ts';
import { SERVER_OWNED_SITE_FIELDS } from '../app/api/manager/_site-fields.ts';

const ALL = [
  'officeConsultations',
  'officeCustomers',
  'officeSites',
  'siteEstimates',
  'officeSales',
  'officeInventoryItems',
  'officeVendors',
];

const versions = (prefix = 'v') => Object.fromEntries(ALL.map((collection) => [collection, `${prefix}-${collection}`]));
const toParam = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value), 'utf8').toString('base64url');

test('the seven office collections are tracked, each filling one dashboard list', () => {
  assert.deepEqual([...OFFICE_TRACKED_COLLECTIONS], ALL);
  assert.deepEqual(OFFICE_COLLECTION_LISTS, {
    officeConsultations: 'consultations',
    officeCustomers: 'customers',
    officeSites: 'sites',
    siteEstimates: 'estimates',
    officeSales: 'sales',
    officeInventoryItems: 'inventory',
    officeVendors: 'vendors',
  });
});

test('createOfficeVersionToken is the time plus random hex and never repeats', () => {
  const now = new Date('2026-10-18T01:02:03.004Z');
  const token = createOfficeVersionToken(now);
  assert.match(token, /^2026-10-18T01:02:03\.004Z-[0-9a-f]{12}$/);
  assert.ok(token.length <= MAX_OFFICE_VERSION_LENGTH);
  const tokens = new Set(Array.from({ length: 1000 }, () => createOfficeVersionToken(now)));
  assert.equal(tokens.size, 1000);
});

test('createOfficeVersions gives every tracked collection its own fresh token', () => {
  const fresh = createOfficeVersions();
  assert.deepEqual(Object.keys(fresh), ALL);
  assert.equal(new Set(Object.values(fresh)).size, ALL.length);
  for (const token of Object.values(fresh)) assert.match(token, /^\d{4}-\d\d-\d\dT[\d:.]+Z-[0-9a-f]{12}$/);
});

test('changedOfficeCollections: a client that knows nothing re-reads everything', () => {
  assert.deepEqual(changedOfficeCollections(versions(), null), ALL);
  assert.deepEqual(changedOfficeCollections(versions(), undefined), ALL);
  assert.deepEqual(changedOfficeCollections(versions(), {}), ALL);
});

test('changedOfficeCollections: all equal re-reads nothing', () => {
  assert.deepEqual(changedOfficeCollections(versions(), versions()), []);
});

test('changedOfficeCollections: one changed or missing token re-reads only that list', () => {
  assert.deepEqual(changedOfficeCollections(versions(), { ...versions(), officeSites: 'older' }), ['officeSites']);
  const { siteEstimates, ...withoutEstimates } = versions();
  assert.equal(typeof siteEstimates, 'string');
  assert.deepEqual(changedOfficeCollections(versions(), withoutEstimates), ['siteEstimates']);
});

test('changedOfficeCollections: unknown keys in the client map are ignored', () => {
  assert.deepEqual(changedOfficeCollections(versions(), { ...versions(), estimateMaterials: 'x', bogus: 'y' }), []);
  assert.deepEqual(changedOfficeCollections(versions(), { bogus: 'v-officeSites' }), ALL);
});

test('changedOfficeCollections: a malformed client map counts as knowing nothing', () => {
  for (const malformed of ['v-officeSites', 42, true, [], [versions()]]) {
    assert.deepEqual(changedOfficeCollections(versions(), malformed), ALL, JSON.stringify(malformed));
  }
  // A non-string token never matches.
  assert.deepEqual(changedOfficeCollections(versions(), { ...versions(), officeVendors: 5 }), ['officeVendors']);
});

test('changedOfficeCollections: a token the server lacks always counts as changed', () => {
  const { officeSales, ...serverWithoutSales } = versions();
  assert.equal(typeof officeSales, 'string');
  assert.deepEqual(changedOfficeCollections(serverWithoutSales, versions()), ['officeSales']);
  assert.deepEqual(changedOfficeCollections(serverWithoutSales, serverWithoutSales), ['officeSales']);
});

test('unchangedOfficeCollections lists the tracked collections that are not re-read', () => {
  assert.deepEqual(unchangedOfficeCollections(['officeSites', 'officeVendors']), [
    'officeConsultations',
    'officeCustomers',
    'siteEstimates',
    'officeSales',
    'officeInventoryItems',
  ]);
  assert.deepEqual(unchangedOfficeCollections(ALL), []);
  assert.deepEqual(unchangedOfficeCollections([]), ALL);
});

test('completeOfficeVersions keeps stored tokens and makes fresh ones for the missing fields', () => {
  const stored = versions();
  assert.deepEqual(completeOfficeVersions(stored), { versions: stored, missing: {} });

  const created = completeOfficeVersions(null);
  assert.deepEqual(Object.keys(created.versions), ALL);
  assert.deepEqual(created.missing, created.versions);

  const partial = completeOfficeVersions({ _id: 'officeChanges', officeSites: 'v-sites', officeVendors: 7, officeSales: '' });
  assert.equal(partial.versions.officeSites, 'v-sites');
  assert.deepEqual(Object.keys(partial.missing), ALL.filter((collection) => collection !== 'officeSites'));
  assert.equal(partial.versions.officeVendors, partial.missing.officeVendors);
  assert.match(partial.missing.officeVendors, /Z-[0-9a-f]{12}$/);
  assert.equal('_id' in partial.versions, false);
});

test('parseOfficeVersionsParam reads a base64url JSON map', () => {
  const map = versions();
  assert.deepEqual(parseOfficeVersionsParam(toParam(map)), map);
  assert.deepEqual(parseOfficeVersionsParam(encodeOfficeVersionsParam(map)), map);
  assert.match(encodeOfficeVersionsParam(map), /^[A-Za-z0-9_-]+$/);
  // A partial or empty map is valid; the missing lists count as changed.
  assert.deepEqual(parseOfficeVersionsParam(toParam({ officeSites: 'a' })), { officeSites: 'a' });
  assert.deepEqual(parseOfficeVersionsParam(toParam({})), {});
  // Real tokens survive the round trip.
  const fresh = createOfficeVersions();
  assert.deepEqual(parseOfficeVersionsParam(encodeOfficeVersionsParam(fresh)), fresh);
});

test('parseOfficeVersionsParam treats a missing or malformed value as knowing nothing', () => {
  for (const value of [null, undefined, '', '   ', 'abc+/=', '%7B%7D', 'a', toParam('not json'), toParam([]), toParam(null), toParam('"text"'), toParam(5)]) {
    assert.equal(parseOfficeVersionsParam(value), null, String(value));
  }
});

test('parseOfficeVersionsParam enforces the size cap and the token length', () => {
  const longest = 'x'.repeat(MAX_OFFICE_VERSION_LENGTH);
  assert.deepEqual(parseOfficeVersionsParam(toParam({ officeSites: longest })), { officeSites: longest });
  assert.equal(parseOfficeVersionsParam(toParam({ officeSites: `${longest}x` })), null);
  assert.equal(parseOfficeVersionsParam(toParam({ officeSites: '' })), null);
  assert.equal(parseOfficeVersionsParam(toParam({ officeSites: 5 })), null);
  assert.equal(parseOfficeVersionsParam(toParam({ officeSites: null })), null);
  // Every tracked collection with the longest token still fits the cap.
  const fullest = toParam(Object.fromEntries(ALL.map((collection) => [collection, longest])));
  assert.ok(fullest.length <= MAX_OFFICE_VERSIONS_PARAM_LENGTH);
  assert.equal(Object.keys(parseOfficeVersionsParam(fullest)).length, ALL.length);
  assert.equal(parseOfficeVersionsParam('A'.repeat(MAX_OFFICE_VERSIONS_PARAM_LENGTH + 4)), null);
});

test('parseOfficeVersionsParam rejects unknown keys', () => {
  assert.equal(parseOfficeVersionsParam(toParam({ ...versions(), estimateMaterials: 'x' })), null);
  assert.equal(parseOfficeVersionsParam(toParam({ bogus: 'x' })), null);
  assert.equal(parseOfficeVersionsParam(toParam('{"__proto__":"x"}')), null);
  assert.equal(parseOfficeVersionsParam(toParam({ constructor: 'x' })), null);
});

test('shouldBumpOfficeChanges: only tracked collections bump, never the marker itself', () => {
  for (const collection of ALL) assert.equal(shouldBumpOfficeChanges(collection), true, collection);
  for (const collection of [OFFICE_CHANGES_COLLECTION, 'managerSettings', 'officeChanges', 'estimateMaterials', 'erpMetadata', 'customerProgress', '', 'constructor', 'toString']) {
    assert.equal(shouldBumpOfficeChanges(collection), false, collection);
  }
});

test('shouldBumpForPatch: a masked write bumps unless it only touches fields the dashboard ignores', () => {
  const ignored = { officeSites: SERVER_OWNED_SITE_FIELDS };
  // Tracked collection, normal field.
  assert.equal(shouldBumpForPatch('officeSites', ['status'], ignored), true);
  assert.equal(shouldBumpForPatch('officeCustomers', ['memo'], ignored), true);
  // officeSites with only server-owned fields: the customer verify lockout, the link on/off.
  assert.equal(shouldBumpForPatch('officeSites', ['progressAccess'], ignored), false);
  assert.equal(shouldBumpForPatch('officeSites', ['progressEnabled'], ignored), false);
  assert.equal(shouldBumpForPatch('officeSites', ['progressCode', 'progressEnabled', 'progressCodeCreatedAt'], ignored), false);
  // officeSites with a mix.
  assert.equal(shouldBumpForPatch('officeSites', ['progressEnabled', 'status'], ignored), true);
  // The ignored list belongs to officeSites only.
  assert.equal(shouldBumpForPatch('officeCustomers', ['progressAccess'], ignored), true);
  // Untracked collections never bump.
  assert.equal(shouldBumpForPatch('siteProgressUpdates', ['notifyLog'], ignored), false);
  assert.equal(shouldBumpForPatch('managerSettings', ['officeSites'], ignored), false);
  // Nothing written, nothing to bump; and no ignored list at all still bumps tracked fields.
  assert.equal(shouldBumpForPatch('officeSites', [], ignored), false);
  assert.equal(shouldBumpForPatch('officeSites', ['progressAccess'], {}), true);
});

test('mergeOfficeLists keeps unchanged lists and replaces changed ones', () => {
  const current = {
    consultations: [{ _id: 'c1' }],
    customers: [{ _id: 'cu1' }],
    sites: [{ _id: 's1' }],
    estimates: [{ _id: 'e1' }],
    sales: [{ _id: 'sa1' }],
    inventory: [{ _id: 'i1' }],
    vendors: [{ _id: 'v1' }],
    projects: [{ _id: 'p1' }],
  };
  const merged = mergeOfficeLists(current, {
    sites: [{ _id: 's2' }],
    vendors: [],
    unchangedCollections: ['officeConsultations', 'officeCustomers', 'siteEstimates', 'officeSales', 'officeInventoryItems'],
  });
  // Only the seven lists come back; the caller keeps the portfolio and visit stats itself.
  assert.deepEqual(merged, {
    consultations: current.consultations,
    customers: current.customers,
    sites: [{ _id: 's2' }],
    estimates: current.estimates,
    sales: current.sales,
    inventory: current.inventory,
    vendors: [],
  });
  // Unchanged lists keep the very same arrays, so React skips work for them.
  assert.equal(merged.consultations, current.consultations);
  assert.equal(merged.inventory, current.inventory);
});

test('mergeOfficeLists: a changed list missing from the answer becomes empty, as before', () => {
  const current = { consultations: [1], customers: [2], sites: [3], estimates: [4], sales: [5], inventory: [6], vendors: [7] };
  const merged = mergeOfficeLists(current, { unchangedCollections: ['officeConsultations', 'bogus'] });
  assert.deepEqual(merged, { consultations: [1], customers: [], sites: [], estimates: [], sales: [], inventory: [], vendors: [] });
});

test('mergeOfficeLists: a full answer replaces everything', () => {
  const current = { consultations: [1], customers: [2], sites: [3], estimates: [4], sales: [5], inventory: [6], vendors: [7] };
  const full = { consultations: [10], customers: [20], sites: [30], estimates: [40], sales: [50], inventory: [60], vendors: [70] };
  assert.deepEqual(mergeOfficeLists(current, full), full);
  assert.deepEqual(mergeOfficeLists(current, { ...full, unchangedCollections: [] }), full);
  // Anything but an array of names is not a delta answer.
  assert.deepEqual(mergeOfficeLists(current, { ...full, unchangedCollections: 'officeConsultations' }), full);
  assert.deepEqual(mergeOfficeLists(current, { consultations: [10] }), {
    consultations: [10],
    customers: [],
    sites: [],
    estimates: [],
    sales: [],
    inventory: [],
    vendors: [],
  });
});

test('officeRefreshVersionsParam sends the map, but nothing when unknown or the last full read is 10 minutes old', () => {
  const map = versions();
  const now = 1_000_000_000;
  assert.equal(officeRefreshVersionsParam(null, now, now), '');
  assert.equal(officeRefreshVersionsParam(undefined, now, now), '');
  assert.deepEqual(parseOfficeVersionsParam(officeRefreshVersionsParam(map, now - 60_000, now)), map);
  assert.deepEqual(parseOfficeVersionsParam(officeRefreshVersionsParam(map, now - OFFICE_FULL_REFRESH_MS + 1, now)), map);
  assert.equal(officeRefreshVersionsParam(map, now - OFFICE_FULL_REFRESH_MS, now), '');
  assert.equal(OFFICE_FULL_REFRESH_MS, 10 * 60 * 1000);
});

// --- Session switches and stale refresh answers -------------------------------------------------------------

const LIST_KEYS = ['consultations', 'customers', 'sites', 'estimates', 'sales', 'inventory', 'vendors'];
const listsOf = (owner) => Object.fromEntries(LIST_KEYS.map((key) => [key, [{ _id: `${owner}-${key}` }]]));
const fullAnswerOf = (owner) => ({ ...listsOf(owner), officeVersions: versions(owner), unchangedCollections: [] });
const deltaAnswerOf = (owner) => ({
  sites: [{ _id: `${owner}-sites-new` }],
  officeVersions: { ...versions(owner), officeSites: `${owner}-newer` },
  unchangedCollections: ALL.filter((collection) => collection !== 'officeSites'),
});

// Mirrors refreshOfficeData: the answer is merged only when shouldApplyOfficeRefresh keeps it.
function applyRefreshAnswer(page, sent, answer) {
  if (!shouldApplyOfficeRefresh(sent, { session: page.session, versions: page.versions })) return false;
  page.lists = mergeOfficeLists(page.lists, answer);
  page.versions = answer.officeVersions;
  return true;
}

test('shouldApplyOfficeRefresh keeps an answer only for the same session and the same version map', () => {
  const map = versions('a');
  assert.equal(shouldApplyOfficeRefresh({ session: 1, versions: map }, { session: 1, versions: map }), true);
  assert.equal(shouldApplyOfficeRefresh({ session: 1, versions: null }, { session: 1, versions: null }), true);
  // Logout, login or restore started another session.
  assert.equal(shouldApplyOfficeRefresh({ session: 1, versions: map }, { session: 2, versions: map }), false);
  assert.equal(shouldApplyOfficeRefresh({ session: 1, versions: null }, { session: 2, versions: null }), false);
  // A full load replaced the map, even with equal tokens.
  assert.equal(shouldApplyOfficeRefresh({ session: 1, versions: map }, { session: 1, versions: { ...map } }), false);
  assert.equal(shouldApplyOfficeRefresh({ session: 1, versions: null }, { session: 1, versions: map }), false);
  assert.equal(shouldApplyOfficeRefresh({ session: 1, versions: map }, { session: 1, versions: null }), false);
});

test('refresh answers apply in the same session and are dropped after a session switch or a full load, full or delta', () => {
  for (const [kind, answerOf] of [['full', fullAnswerOf], ['delta', deltaAnswerOf]]) {
    // Same session, same map: applied.
    const same = { session: 1, versions: versions('a'), lists: listsOf('a') };
    assert.equal(applyRefreshAnswer(same, { session: 1, versions: same.versions }, answerOf('a')), true, kind);
    assert.deepEqual(same.lists.sites, answerOf('a').sites, kind);

    // A's refresh is in flight; A logs out (refs reset), B logs in and B's full load lands first.
    const switched = { session: 1, versions: versions('a'), lists: listsOf('a') };
    const sentByA = { session: switched.session, versions: switched.versions };
    switched.session += 1;
    switched.versions = null;
    switched.lists = listsOf('b');
    switched.versions = versions('b');
    assert.equal(applyRefreshAnswer(switched, sentByA, answerOf('a')), false, kind);
    assert.deepEqual(switched.lists, listsOf('b'), kind);
    assert.deepEqual(switched.versions, versions('b'), kind);

    // Same session, but a full load replaced the lists and the map while the refresh was in flight.
    const reloaded = { session: 1, versions: versions('a'), lists: listsOf('a') };
    const sent = { session: 1, versions: reloaded.versions };
    reloaded.lists = listsOf('reload');
    reloaded.versions = versions('reload');
    assert.equal(applyRefreshAnswer(reloaded, sent, answerOf('a')), false, kind);
    assert.deepEqual(reloaded.lists, listsOf('reload'), kind);
  }
});

// --- Lists the session cannot read ---------------------------------------------------------------------------

const staff = (permissions) => ({ role: 'staff', permissions });
const USERS = [
  { role: 'admin', permissions: [] },
  staff([]),
  staff(['dashboard']),
  staff(['consultations']),
  staff(['sales']),
  staff(['sites']),
  staff(['customers', 'inventory']),
  staff(['estimates', 'vendors', 'portfolio']),
];

test('readableOfficeCollections follows the same check as filterOfficeData', () => {
  for (const user of USERS) {
    const readable = readableOfficeCollections((list) => canReadOffice(user, list));
    const filtered = filterOfficeData(user, listsOf('x'));
    for (const collection of ALL) {
      const list = OFFICE_COLLECTION_LISTS[collection];
      assert.equal(readable.includes(collection), filtered[list].length > 0, `${JSON.stringify(user)} ${collection}`);
    }
  }
  assert.deepEqual(readableOfficeCollections(() => true), ALL);
  assert.deepEqual(readableOfficeCollections((list) => canReadOffice(staff(['sales']), list)), ['officeSites', 'siteEstimates', 'officeSales']);
});

test('mergeOfficeLists clears lists answered empty and never brings them back', () => {
  const current = listsOf('old');
  // Consultations are unreadable: answered as [] and never reported unchanged.
  const answer = { consultations: [], officeVersions: {}, unchangedCollections: ALL.filter((collection) => collection !== 'officeConsultations') };
  const merged = mergeOfficeLists(current, answer);
  assert.deepEqual(merged.consultations, []);
  assert.deepEqual(mergeOfficeLists(merged, answer).consultations, []);
  assert.equal(merged.sites, current.sites);
});

// --- Server orchestration: marker first, then only the changed readable lists ---------------------------------

function fakeReaders({ stored = versions(), failVersions = false, failLists = false } = {}) {
  const calls = [];
  return {
    calls,
    readers: {
      readVersions: async () => {
        calls.push('versions:start');
        await Promise.resolve();
        if (failVersions) throw new Error('marker denied');
        calls.push('versions:end');
        return stored;
      },
      readLists: async (collections) => {
        calls.push(`lists:${collections.join(',')}`);
        if (failLists) throw new Error('list failed');
        return Object.fromEntries(collections.map((collection) => [OFFICE_COLLECTION_LISTS[collection], [{ _id: `new-${collection}` }]]));
      },
      onVersionsError: (error) => calls.push(`error:${error.message}`),
    },
  };
}

test('readOfficeDataWithVersions reads the marker before the lists and lists only what changed', async () => {
  const { calls, readers } = fakeReaders();
  const result = await readOfficeDataWithVersions(readers, { ...versions(), officeSites: 'older' });
  assert.deepEqual(calls, ['versions:start', 'versions:end', 'lists:officeSites']);
  assert.deepEqual(result, {
    sites: [{ _id: 'new-officeSites' }],
    officeVersions: versions(),
    unchangedCollections: ALL.filter((collection) => collection !== 'officeSites'),
  });
});

test('readOfficeDataWithVersions: nothing changed reads no list; no known map reads every list', async () => {
  const idle = fakeReaders();
  const unchanged = await readOfficeDataWithVersions(idle.readers, versions());
  assert.deepEqual(idle.calls, ['versions:start', 'versions:end']);
  assert.deepEqual(unchanged, { officeVersions: versions(), unchangedCollections: ALL });

  const full = fakeReaders();
  const everything = await readOfficeDataWithVersions(full.readers, null);
  assert.deepEqual(full.calls, ['versions:start', 'versions:end', `lists:${ALL.join(',')}`]);
  assert.deepEqual(everything.unchangedCollections, []);
  assert.deepEqual(Object.keys(everything).filter((key) => LIST_KEYS.includes(key)), LIST_KEYS);
});

test('readOfficeDataWithVersions falls back to reading every list without versions when the marker read fails', async () => {
  const { calls, readers } = fakeReaders({ failVersions: true });
  const result = await readOfficeDataWithVersions(readers, versions());
  assert.deepEqual(calls, ['versions:start', 'error:marker denied', `lists:${ALL.join(',')}`]);
  assert.equal('officeVersions' in result, false);
  assert.equal('unchangedCollections' in result, false);
  assert.deepEqual(Object.keys(result), LIST_KEYS);
});

test('readOfficeDataWithVersions never lists or reveals collections the session cannot read', async () => {
  const readable = ['officeSites', 'siteEstimates', 'officeSales'];
  // The client claims to know every token, including the unreadable ones.
  const { calls, readers } = fakeReaders();
  const result = await readOfficeDataWithVersions(readers, { ...versions(), officeSales: 'older', officeConsultations: 'older' }, readable);
  assert.deepEqual(calls, ['versions:start', 'versions:end', 'lists:officeSales']);
  assert.deepEqual(result.officeVersions, { officeSites: 'v-officeSites', siteEstimates: 'v-siteEstimates', officeSales: 'v-officeSales' });
  assert.deepEqual(result.unchangedCollections, ['officeSites', 'siteEstimates']);
  for (const list of ['consultations', 'customers', 'inventory', 'vendors']) assert.deepEqual(result[list], [], list);
  assert.deepEqual(result.sales, [{ _id: 'new-officeSales' }]);

  const fallback = fakeReaders({ failVersions: true });
  const fallbackResult = await readOfficeDataWithVersions(fallback.readers, null, readable);
  assert.deepEqual(fallback.calls.at(-1), `lists:${readable.join(',')}`);
  assert.equal('officeVersions' in fallbackResult, false);
  assert.deepEqual(fallbackResult.consultations, []);
});

test('readOfficeDataWithVersions lets a list failure through, so the route can fall back', async () => {
  const { readers } = fakeReaders({ failLists: true });
  await assert.rejects(readOfficeDataWithVersions(readers, null), /list failed/);
});
