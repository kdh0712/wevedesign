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
  shouldBumpOfficeChanges,
  unchangedOfficeCollections,
} from '../app/lib/office-changes.ts';

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
