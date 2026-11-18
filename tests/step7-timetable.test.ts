import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const api = read('../src/server/api.ts');
const storage = read('../src/server/storage.ts');
const service = read('../src/services/api.ts');
const ui = read('../src/components/schooladmin/TimetableView.tsx');
const migrations = [
  read('../supabase/migrations/20261118153746_step7_timetable_foundation.sql'),
  read('../supabase/migrations/20261118153809_step7_locked_timetable_protection.sql'),
  read('../supabase/migrations/20261118155122_step7_backfill_current_timetable_term.sql'),
  read('../supabase/migrations/20261118155626_step7_term_scoped_timetable_replace.sql'),
  read('../supabase/migrations/20261118160647_step7_safe_term_scoped_swap.sql'),
  read('../supabase/migrations/20261118161206_step7_time_overlap_conflict_guard.sql'),
  read('../supabase/migrations/20261118170000_step7_timetable_constraint_fixes.sql'),
  read('../supabase/migrations/20261118172000_step7_timetable_overlap_constraints.sql'),
  read('../supabase/migrations/20261118173000_step7_swap_term_restore_fix.sql')
].join('\n');

test('timetable reads and edits are scoped to the selected school term', () => {
  assert.match(api, /apiRouter\.get\('\/timetable\/terms'/);
  assert.match(api, /term_id: termId \|\| undefined/);
  assert.match(api, /replaceTimetableForClassTerm\(school\.id/);
  assert.match(storage, /schoolos_replace_class_timetable_for_term/);
  assert.match(ui, /selectedTermId/);
  assert.match(service, /termId/);
});

test('auto-generation previews before saving and preserves locked lessons', () => {
  assert.match(api, /req\.body\?\.previewOnly === true/);
  assert.match(api, /generatedForClass\.some\(\(slot: any\) => !slot\.isLocked\)/);
  assert.match(api, /is_locked,term_id/);
  assert.match(ui, /ApiClient\.generateAllTimetables\(true, selectedTermId\)/);
  assert.match(ui, /Casharrada locked-ka ah waa la ilaalinayaa/);
  assert.match(migrations, /schoolos_guard_locked_timetable_slot/);
});

test('generator uses Step 6 teacher assignments and respects full-day unavailability', () => {
  assert.match(api, /teacher_class_subject_assignments/);
  assert.match(api, /item\.periodNumber == null/);
  assert.match(api, /teacherDayLoad/);
  assert.match(api, /heavySubject/);
  assert.match(api, /warnings/);
  assert.match(api, /teacherTimeBusy/);
  assert.match(api, /roomTimeBusy/);
  assert.match(api, /teacher_class_subject_assignments/);
  assert.match(ui, /getTeacherUnavailability/);
  assert.match(ui, /setTeacherUnavailability/);
  assert.match(ui, /coveragePercent/);
  assert.match(ui, /visibleDays/);
});

test('registered rooms and dated substitutions are school-scoped', () => {
  assert.match(api, /queryPage\('rooms', \{ school_id: school\.id, id: roomId \}/);
  assert.match(api, /apiRouter\.post\('\/timetable\/substitutions'/);
  assert.match(api, /Macallinkan wuxuu cashar kale leeyahay waqtigan/);
  assert.match(migrations, /CREATE TABLE IF NOT EXISTS public\.rooms/);
  assert.match(migrations, /CREATE TABLE IF NOT EXISTS public\.timetable_substitutions/);
});

test('copy, clear, swap and overlap guardrails are implemented', () => {
  assert.match(api, /apiRouter\.delete\('\/timetable\/classes\/:classId'/);
  assert.match(api, /apiRouter\.post\('\/timetable\/copy-term'/);
  assert.match(api, /apiRouter\.post\('\/timetable\/swap'/);
  assert.match(migrations, /schoolos_swap_timetable_slots/);
  assert.match(migrations, /schoolos_guard_timetable_booking_conflicts/);
  assert.match(migrations, /teacher_unavailability_period_number_check/);
  assert.match(migrations, /timetable_teacher_time_no_overlap/);
  assert.match(migrations, /timetable_room_id_time_no_overlap/);
  assert.match(migrations, /timetable_room_name_time_no_overlap/);
  assert.match(migrations, /term_id = first_slot\.term_id/);
  assert.match(api, /targetAssignments/);
  assert.match(api, /sectionId/);
  assert.match(ui, /selectedSectionId/);
  assert.match(ui, /handleSwapSlots/);
});
