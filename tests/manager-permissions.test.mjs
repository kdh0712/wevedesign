import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MANAGER_PERMISSIONS,
  canReadOffice,
  canWriteOffice,
  effectivePermissions,
  filterOfficeData,
  hasAnyPermission,
  normalizePermissions,
} from '../app/lib/manager-permissions.ts';

const staff = (permissions) => ({ role: 'staff', permissions });
const admin = { role: 'admin', permissions: [] };

test('admin gets every permission', () => {
  assert.deepEqual(effectivePermissions('admin', []), [...MANAGER_PERMISSIONS]);
});

test('staff drops unknown values, duplicates and accounts', () => {
  assert.deepEqual(effectivePermissions('staff', ['sales', 'accounts', 'bogus', 'sales']), ['sales']);
});

test('normalize accepts RTDB object arrays and rejects other shapes', () => {
  assert.deepEqual(normalizePermissions({ 0: 'dashboard', 2: 'sales' }), ['dashboard', 'sales']);
  assert.deepEqual(normalizePermissions('dashboard'), []);
  assert.deepEqual(normalizePermissions(null), []);
});

test('read table follows tab dependencies', () => {
  assert.equal(canReadOffice(staff(['sales']), 'estimates'), true);
  assert.equal(canReadOffice(staff(['sales']), 'sites'), true);
  assert.equal(canReadOffice(staff(['sales']), 'customers'), false);
  assert.equal(canReadOffice(staff(['sites']), 'customers'), true);
  assert.equal(canReadOffice(staff(['consultations']), 'visitStats'), false);
});

test('write table', () => {
  assert.equal(canWriteOffice(staff(['customers']), 'site'), true);
  // The site form saves the site's customer first.
  assert.equal(canWriteOffice(staff(['sites']), 'customer'), true);
  assert.equal(canWriteOffice(staff(['customers']), 'sale'), false);
  assert.equal(canWriteOffice(staff(['portfolio']), 'category'), true);
  assert.equal(canWriteOffice(staff(['consultations']), 'managerAccount'), false);
  assert.equal(canWriteOffice(admin, 'project'), true);
});

test('hasAnyPermission', () => {
  assert.equal(hasAnyPermission(staff([]), []), true);
  assert.equal(hasAnyPermission(staff(['accounts']), ['accounts']), false);
  assert.equal(hasAnyPermission(admin, ['accounts']), true);
  assert.equal(hasAnyPermission(null, []), false);
});

test('filterOfficeData empties unreadable collections only', () => {
  const data = { consultations: [1], customers: [2], sales: [3], visitStats: { todayCount: 1 }, storageWarning: 'w' };
  assert.deepEqual(filterOfficeData(staff(['dashboard', 'consultations']), data), {
    consultations: [1],
    customers: [],
    sales: [],
    visitStats: { todayCount: 1 },
    storageWarning: 'w',
  });
  assert.equal(filterOfficeData(staff(['consultations']), data).visitStats, null);
  assert.deepEqual(filterOfficeData(admin, data), data);
});
