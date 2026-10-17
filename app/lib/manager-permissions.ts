// Shared by the manager UI and the manager API, so it must stay free of Node-only imports.

export type ManagerPermission =
  | 'dashboard'
  | 'consultations'
  | 'customers'
  | 'sites'
  | 'estimates'
  | 'sales'
  | 'inventory'
  | 'vendors'
  | 'portfolio'
  | 'integrations'
  | 'accounts';

export type ManagerRole = 'admin' | 'staff';

export type ManagerIdentity = { role: ManagerRole; permissions: readonly string[] };

export type OfficeCollection =
  | 'consultations'
  | 'customers'
  | 'sites'
  | 'estimates'
  | 'sales'
  | 'inventory'
  | 'vendors'
  | 'projects'
  | 'categories'
  | 'visitStats';

export type OfficeRecordType = 'consultation' | 'customer' | 'site' | 'sale' | 'inventory' | 'vendor' | 'project' | 'category';

export const MANAGER_PERMISSIONS: readonly ManagerPermission[] = [
  'dashboard',
  'consultations',
  'customers',
  'sites',
  'estimates',
  'sales',
  'inventory',
  'vendors',
  'portfolio',
  'integrations',
  'accounts',
];

// A collection is sent to a staff account only when it holds one of these permissions.
// Some tabs need another tab's data, e.g. the sales tab picks a site and an estimate.
export const OFFICE_READ_PERMISSIONS: Record<OfficeCollection, readonly ManagerPermission[]> = {
  consultations: ['consultations'],
  customers: ['customers', 'sites'],
  sites: ['sites', 'customers', 'estimates', 'sales'],
  estimates: ['estimates', 'sales'],
  sales: ['sales'],
  inventory: ['inventory'],
  vendors: ['vendors'],
  projects: ['portfolio'],
  categories: ['portfolio'],
  visitStats: ['dashboard'],
};

// The customer form also creates the customer's site and the site form saves the site's customer,
// so customers and sites may write each other's records.
export const OFFICE_WRITE_PERMISSIONS: Record<OfficeRecordType, readonly ManagerPermission[]> = {
  consultation: ['consultations'],
  customer: ['customers', 'sites'],
  site: ['sites', 'customers'],
  sale: ['sales'],
  inventory: ['inventory'],
  vendor: ['vendors'],
  project: ['portfolio'],
  category: ['portfolio'],
};

const permissionSet = new Set<string>(MANAGER_PERMISSIONS);

export function normalizePermissions(value: unknown): ManagerPermission[] {
  // Realtime Database turns sparse arrays into objects with numeric keys.
  const values = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];
  const granted = new Set(values.map(String).filter((permission) => permissionSet.has(permission)));
  return MANAGER_PERMISSIONS.filter((permission) => granted.has(permission));
}

export function effectivePermissions(role: ManagerRole, permissions: unknown): ManagerPermission[] {
  if (role === 'admin') return [...MANAGER_PERMISSIONS];
  // Account management is admin-only, whatever the checkbox says.
  return normalizePermissions(permissions).filter((permission) => permission !== 'accounts');
}

export function hasAnyPermission(user: ManagerIdentity | null | undefined, required: readonly ManagerPermission[]): boolean {
  if (!user) return false;
  if (user.role === 'admin' || required.length === 0) return true;
  const granted = effectivePermissions(user.role, user.permissions);
  return required.some((permission) => granted.includes(permission));
}

export function canReadOffice(user: ManagerIdentity, collection: OfficeCollection): boolean {
  return hasAnyPermission(user, OFFICE_READ_PERMISSIONS[collection]);
}

export function canWriteOffice(user: ManagerIdentity, type: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(OFFICE_WRITE_PERMISSIONS, type)) return false;
  return hasAnyPermission(user, OFFICE_WRITE_PERMISSIONS[type as OfficeRecordType]);
}

export function filterOfficeData<T extends Record<string, unknown>>(user: ManagerIdentity, data: T): T {
  const filtered: Record<string, unknown> = { ...data };
  for (const collection of Object.keys(OFFICE_READ_PERMISSIONS) as OfficeCollection[]) {
    if (!(collection in filtered) || canReadOffice(user, collection)) continue;
    filtered[collection] = collection === 'visitStats' ? null : [];
  }
  return filtered as T;
}
