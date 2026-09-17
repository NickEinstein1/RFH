export const Permissions = {
  USERS_MANAGE: 'users:manage',
  RESIDENTS_READ: 'residents:read',
  RESIDENTS_WRITE: 'residents:write',
  MED_ORDERS_READ: 'med_orders:read',
  MED_ORDERS_WRITE: 'med_orders:write',
  MED_PASS: 'med_pass:administer',
  NOTES_READ: 'notes:read',
  NOTES_WRITE: 'notes:write',
  AUDIT_READ: 'audit:read',
  ALERTS_ACK: 'alerts:acknowledge',
  CARE_PLANS_READ: 'care_plans:read',
  CARE_PLANS_WRITE: 'care_plans:write',
  TASKS_COMPLETE: 'tasks:complete',
  CREDENTIALS_READ: 'credentials:read',
  CREDENTIALS_WRITE: 'credentials:write',
  FAMILY_LINKS_MANAGE: 'family_links:manage',
  INCIDENTS_READ: 'incidents:read',
  INCIDENTS_WRITE: 'incidents:write',
  INCIDENTS_CLOSE: 'incidents:close',
  REPORTS_READ: 'reports:read',
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

export enum Role {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  NURSE = 'NURSE',
  CAREGIVER = 'CAREGIVER',
  FAMILY_VIEWER = 'FAMILY_VIEWER',
}

const STAFF_CLINICAL: Permission[] = [
  Permissions.RESIDENTS_READ,
  Permissions.MED_ORDERS_READ,
  Permissions.MED_PASS,
  Permissions.NOTES_READ,
  Permissions.NOTES_WRITE,
  Permissions.ALERTS_ACK,
  Permissions.CARE_PLANS_READ,
  Permissions.TASKS_COMPLETE,
  Permissions.CREDENTIALS_READ,
  Permissions.INCIDENTS_READ,
  Permissions.INCIDENTS_WRITE,
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  [Role.OWNER]: Object.values(Permissions),
  [Role.ADMIN]: Object.values(Permissions),
  [Role.NURSE]: [
    ...STAFF_CLINICAL,
    Permissions.RESIDENTS_WRITE,
    Permissions.MED_ORDERS_WRITE,
    Permissions.CARE_PLANS_WRITE,
    Permissions.CREDENTIALS_WRITE,
    Permissions.INCIDENTS_CLOSE,
    Permissions.REPORTS_READ,
  ],
  [Role.CAREGIVER]: STAFF_CLINICAL,
  [Role.FAMILY_VIEWER]: [
    Permissions.RESIDENTS_READ,
    Permissions.NOTES_READ,
    Permissions.CARE_PLANS_READ,
  ],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
