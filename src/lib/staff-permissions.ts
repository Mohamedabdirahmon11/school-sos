export const STAFF_PERMISSION_REGISTRY = [
  { id: 'fees_manage', label: 'Fees & Finance Ledger (Record payments, issue receipts)' },
  { id: 'admissions_manage', label: 'Student Admissions (Review and admit new applicants)' },
  { id: 'attendance_manage', label: 'Attendance Review (View class attendance and absences)' },
  { id: 'grades_manage', label: 'Exam Results Review (Review and approve submitted marks)' },
  { id: 'library_manage', label: 'Library Catalog & Loans' },
  { id: 'transport_manage', label: 'Transport Fleet & Student Routes' },
  { id: 'inventory_manage', label: 'School Inventory & Asset Registry' },
  { id: 'reports_export', label: 'Export Reports & Financial CSVs' },
  { id: 'payroll_manage', label: 'Payroll Management (Create, approve and pay salaries)' }
] as const;

export type StaffPermission = typeof STAFF_PERMISSION_REGISTRY[number]['id'];

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

/** Keep staff navigation aligned with the permissions enforced by API routes. */
export function hasStaffNavigationPermission(permissions: unknown, permission: StaffPermission): boolean {
  return Array.isArray(permissions) && permissions.includes(permission);
}
