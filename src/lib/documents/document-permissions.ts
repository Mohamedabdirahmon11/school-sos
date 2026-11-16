export type DocumentRole = 'super_admin' | 'school_admin' | 'accountant' | 'teacher' | 'parent' | 'student' | string;

export function canManageSchoolDocuments(role: DocumentRole): boolean {
  return role === 'school_admin' || role === 'super_admin';
}

export function canGenerateSchoolDocuments(role: DocumentRole): boolean {
  return canManageSchoolDocuments(role);
}
