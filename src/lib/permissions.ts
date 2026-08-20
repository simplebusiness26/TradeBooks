export type Role = 'owner' | 'admin' | 'staff' | 'reviewer';

/**
 * Every server action and route declares the permission it needs. Roles are
 * mapped to permissions here so authorisation is decided in one place.
 */
export type Permission =
  | 'records.read'
  | 'records.write'
  | 'records.delete'
  | 'transactions.categorise'
  | 'transactions.reconcile'
  | 'documents.upload'
  | 'exceptions.resolve'
  | 'rules.manage'
  | 'periods.prepare'
  | 'periods.close'
  | 'exports.run'
  | 'imports.run'
  | 'company.settings'
  | 'company.members'
  | 'integrations.manage'
  | 'audit.read';

const PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: [
    'records.read',
    'records.write',
    'records.delete',
    'transactions.categorise',
    'transactions.reconcile',
    'documents.upload',
    'exceptions.resolve',
    'rules.manage',
    'periods.prepare',
    'periods.close',
    'exports.run',
    'imports.run',
    'company.settings',
    'company.members',
    'integrations.manage',
    'audit.read',
  ],
  admin: [
    'records.read',
    'records.write',
    'records.delete',
    'transactions.categorise',
    'transactions.reconcile',
    'documents.upload',
    'exceptions.resolve',
    'rules.manage',
    'periods.prepare',
    'periods.close',
    'exports.run',
    'imports.run',
    'company.settings',
    'company.members',
    'integrations.manage',
    'audit.read',
  ],
  staff: [
    'records.read',
    'records.write',
    'transactions.categorise',
    'documents.upload',
    'exceptions.resolve',
    'imports.run',
  ],
  reviewer: [
    'records.read',
    'records.write',
    'transactions.categorise',
    'transactions.reconcile',
    'documents.upload',
    'exceptions.resolve',
    'rules.manage',
    'periods.prepare',
    'periods.close',
    'exports.run',
    'imports.run',
    'audit.read',
  ],
};

export function can(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role].includes(permission);
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  staff: 'Staff',
  reviewer: 'Bookkeeper / accountant',
};
