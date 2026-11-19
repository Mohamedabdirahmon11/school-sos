import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const api = read('../src/server/api.ts');
const storage = read('../src/server/storage.ts');
const schoolSettings = read('../src/server/school-settings.ts');
const settingsView = read('../src/components/schooladmin/SchoolSettingsView.tsx');
const idCard = read('../src/components/common/PrintIDCardModal.tsx');
const classesView = read('../src/components/schooladmin/ClassesView.tsx');
const lifecycle = read('../supabase/migrations/20261119160000_school_setup_lifecycle.sql');
const classConfig = read('../supabase/migrations/20261119162000_class_section_configuration.sql');
const schema = read('../schema.sql');

test('academic date validator uses actual digit tokens', () => {
  assert.ok(api.includes("!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)"));
  assert.ok(!api.includes("!/^\\\\d{4}-\\\\d{2}-\\\\d{2}$/.test(value)"));
});

test('legacy Term 1/2 rows map to Semester 1/2 without renaming history', () => {
  assert.ok(api.includes('name: canonicalSemesterName(term.name)'));
  assert.ok(api.includes('legacySemesterName(name)'));
  assert.ok(lifecycle.includes("t.name IN ('Semester 1','Term 1')"));
  assert.ok(lifecycle.includes("t.name IN ('Semester 2','Term 2')"));
});

test('academic year and term RLS policies are school scoped', () => {
  assert.ok(lifecycle.includes('DROP POLICY IF EXISTS academic_years_tenant_scope'));
  assert.ok(lifecycle.includes('DROP POLICY IF EXISTS terms_tenant_scope'));
  assert.ok(lifecycle.includes('school_id=private.auth_school_id()'));
});

test('new academic years require exactly two semesters before activation', () => {
  assert.ok(lifecycle.includes('Configure Semester 1 and Semester 2 before activating the academic year.'));
  assert.ok(lifecycle.includes('An academic year can contain only two semesters.'));
});

test('lifecycle and class configuration functions have balanced dollar quotes', () => {
  assert.equal(lifecycle.split('\n').filter(line => line.trim() === 'AS $' || line.trim() === '$;').length, 0);
  assert.equal(classConfig.split('\n').filter(line => line.trim() === 'AS 
});

test('school settings validate date format and extended currencies', () => {
  assert.ok(schoolSettings.includes('dateFormat:'));
  assert.ok(schoolSettings.includes("'KES', 'DJF', 'AED', 'SAR', 'EUR', 'GBP'"));
  assert.ok(settingsView.includes('setDateFormat(school.dateFormat'));
});

test('class sections are school-aware and include capacity and Form Teacher controls', () => {
  assert.ok(classesView.includes('school?.id'));
  assert.ok(classesView.includes('updateClassSectionConfiguration'));
  assert.ok(classesView.includes('setClassSectionActive'));
  assert.ok(classesView.includes('formTeacherRequired'));
  assert.ok(classesView.includes('availableSeats'));
});

test('section capacity cannot be reduced below active enrollment', () => {
  assert.ok(classConfig.includes('Capacity cannot be lower than the current enrollment'));
  assert.ok(classConfig.includes("status='active'"));
});

test('student promotions and enrollments use one atomic, school-scoped RPC', () => {
  const promotionMigration = read('../supabase/migrations/20261119164000_atomic_student_promotion_and_enrollment.sql');
  assert.ok(storage.includes("schoolos_confirm_promotions_with_enrollments"));
  assert.ok(api.includes('confirmed.promotions.length'));
  assert.ok(!api.includes("client.rpc('schoolos_promote_enrollments'"));
  assert.ok(promotionMigration.includes('public.schoolos_promote_enrollments'));
  assert.ok(promotionMigration.includes('public.promotion_history'));
  assert.ok(promotionMigration.includes('academic_year_id = p_target_year AND e.status = \'active\''));
});

test('saved school logo is used in ID cards, invoices and receipts', () => {
  assert.ok(idCard.includes('school?.logoUrl ?'));
  assert.ok(api.includes('getSchoolLogoPdfImage(school, client)'));
  assert.ok(api.includes('images: logoImage ? [logoImage] : []'));
  assert.ok(api.includes('SCHOOL_LOGO_BUCKET'));
});

test('canonical fresh-install schema mirrors the school setup migrations', () => {
  assert.ok(schema.includes('subject_catalog'));
  assert.ok(schema.includes('schools_date_format_check'));
  assert.ok(schema.includes('schoolos_update_class_section_config'));
  assert.ok(schema.includes('schoolos_confirm_promotions_with_enrollments'));
});
 || line.trim() === '$;').length, 0);
  const schemaSection = schema.slice(schema.indexOf('-- BEGIN: School Setup Batch 1 canonical fresh-install schema.'), schema.indexOf('-- END: School Setup Batch 1 canonical fresh-install schema.'));
  assert.equal(schemaSection.split('\n').filter(line => line.trim() === 'AS 
});

test('school settings validate date format and extended currencies', () => {
  assert.ok(schoolSettings.includes('dateFormat:'));
  assert.ok(schoolSettings.includes("'KES', 'DJF', 'AED', 'SAR', 'EUR', 'GBP'"));
  assert.ok(settingsView.includes('setDateFormat(school.dateFormat'));
});

test('class sections are school-aware and include capacity and Form Teacher controls', () => {
  assert.ok(classesView.includes('school?.id'));
  assert.ok(classesView.includes('updateClassSectionConfiguration'));
  assert.ok(classesView.includes('setClassSectionActive'));
  assert.ok(classesView.includes('formTeacherRequired'));
  assert.ok(classesView.includes('availableSeats'));
});

test('section capacity cannot be reduced below active enrollment', () => {
  assert.ok(classConfig.includes('Capacity cannot be lower than the current enrollment'));
  assert.ok(classConfig.includes("status='active'"));
});

test('student promotions and enrollments use one atomic, school-scoped RPC', () => {
  const promotionMigration = read('../supabase/migrations/20261119164000_atomic_student_promotion_and_enrollment.sql');
  assert.ok(storage.includes("schoolos_confirm_promotions_with_enrollments"));
  assert.ok(api.includes('confirmed.promotions.length'));
  assert.ok(!api.includes("client.rpc('schoolos_promote_enrollments'"));
  assert.ok(promotionMigration.includes('public.schoolos_promote_enrollments'));
  assert.ok(promotionMigration.includes('public.promotion_history'));
  assert.ok(promotionMigration.includes('academic_year_id = p_target_year AND e.status = \'active\''));
});

test('saved school logo is used in ID cards, invoices and receipts', () => {
  assert.ok(idCard.includes('school?.logoUrl ?'));
  assert.ok(api.includes('getSchoolLogoPdfImage(school, client)'));
  assert.ok(api.includes('images: logoImage ? [logoImage] : []'));
  assert.ok(api.includes('SCHOOL_LOGO_BUCKET'));
});

test('canonical fresh-install schema mirrors the school setup migrations', () => {
  assert.ok(schema.includes('subject_catalog'));
  assert.ok(schema.includes('schools_date_format_check'));
  assert.ok(schema.includes('schoolos_update_class_section_config'));
  assert.ok(schema.includes('schoolos_confirm_promotions_with_enrollments'));
});
 || line.trim() === '$;').length, 0);
});

test('school settings validate date format and extended currencies', () => {
  assert.ok(schoolSettings.includes('dateFormat:'));
  assert.ok(schoolSettings.includes("'KES', 'DJF', 'AED', 'SAR', 'EUR', 'GBP'"));
  assert.ok(settingsView.includes('setDateFormat(school.dateFormat'));
});

test('class sections are school-aware and include capacity and Form Teacher controls', () => {
  assert.ok(classesView.includes('school?.id'));
  assert.ok(classesView.includes('updateClassSectionConfiguration'));
  assert.ok(classesView.includes('setClassSectionActive'));
  assert.ok(classesView.includes('formTeacherRequired'));
  assert.ok(classesView.includes('availableSeats'));
});

test('section capacity cannot be reduced below active enrollment', () => {
  assert.ok(classConfig.includes('Capacity cannot be lower than the current enrollment'));
  assert.ok(classConfig.includes("status='active'"));
});

test('student promotions and enrollments use one atomic, school-scoped RPC', () => {
  const promotionMigration = read('../supabase/migrations/20261119164000_atomic_student_promotion_and_enrollment.sql');
  assert.ok(storage.includes("schoolos_confirm_promotions_with_enrollments"));
  assert.ok(api.includes('confirmed.promotions.length'));
  assert.ok(!api.includes("client.rpc('schoolos_promote_enrollments'"));
  assert.ok(promotionMigration.includes('public.schoolos_promote_enrollments'));
  assert.ok(promotionMigration.includes('public.promotion_history'));
  assert.ok(promotionMigration.includes('academic_year_id = p_target_year AND e.status = \'active\''));
});

test('saved school logo is used in ID cards, invoices and receipts', () => {
  assert.ok(idCard.includes('school?.logoUrl ?'));
  assert.ok(api.includes('getSchoolLogoPdfImage(school, client)'));
  assert.ok(api.includes('images: logoImage ? [logoImage] : []'));
  assert.ok(api.includes('SCHOOL_LOGO_BUCKET'));
});

test('canonical fresh-install schema mirrors the school setup migrations', () => {
  assert.ok(schema.includes('subject_catalog'));
  assert.ok(schema.includes('schools_date_format_check'));
  assert.ok(schema.includes('schoolos_update_class_section_config'));
  assert.ok(schema.includes('schoolos_confirm_promotions_with_enrollments'));
});

test('promotion rankings reload when the school or source year changes', () => {
  const promotionView = read('../src/components/schooladmin/YearEndPromotionView.tsx');
  assert.ok(promotionView.includes("status:'draft'|'active'|'closed'"));
  assert.ok(promotionView.includes('[selectedClassId, sourceAcademicYearId, school?.id]'));
  assert.ok(promotionView.includes('setYearlyRankings([])'));
});
