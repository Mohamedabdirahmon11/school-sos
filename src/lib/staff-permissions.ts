export type StaffPermission = 'fees_manage' | 'admissions_manage' | 'attendance_manage' | 'grades_manage' | 'library_manage' | 'transport_manage' | 'inventory_manage' | 'reports_export';

export interface StaffPermissionRecord {
  status?: string | null;
  permissions?: unknown;
}

/** Only active staff records with an explicitly assigned permission are authorized. */
export function staffHasPermission(
  staff: StaffPermissionRecord | null | undefined,
  permission: StaffPermission
): boolean {
  return staff?.status === 'active'
    && Array.isArray(staff.permissions)
    && staff.permissions.includes(permission);
}
