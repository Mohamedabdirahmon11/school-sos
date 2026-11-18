# SchoolOS architecture — Exam & Results workflow

This document records the current implementation boundaries for the exam workflow. It is based on the repository code and migrations; it does not introduce a parallel exam data model.

## Application boundaries

- React screens live under `src/components`.
- `ExamsResultsView.tsx` is the School Admin exam/results workspace. It configures the assessment scheme, reviews Form Teacher submissions, approves/returns marks, publishes results, and manages exam schedules.
- `TeacherPortalView.tsx` is the teacher workspace. Subject teachers enter marks for their assigned subjects; Form Teachers see the full active-subject register and forward the class.
- `ClassesSubjectsView.tsx` manages the class-to-subject assignments and assigned teacher using the existing `class_subjects` relation. Do not create a second exam-only assignment table.
- `src/services/api.ts` is the typed browser API client.
- `src/server/api.ts` owns authenticated HTTP routes and role/school checks.
- `src/server/storage.ts` owns database reads/writes, audit records, and exam mark workflow transitions.
- `src/lib/exam-calculations.ts` contains pure calculations shared by UI and tests.
- `src/lib/translations.ts` is the existing localization dictionary for English, Somali, Amharic, and Arabic; Arabic direction is RTL.

## Existing database model

- `exam_configs`: one school/academic-year mark scheme, including `assessment_components` and `scheme_version`.
- `class_subjects`: active subject assignment and assigned teacher for a class.
- `student_marks`: one student's result for a class, subject, academic year, and semester. It stores component scores, the scheme version/snapshot, status, correction history, approval history, and publication history.
- `students.roll_number`: optional school-managed roll number, added additively by migration `20261115110000_exam_student_roll_number.sql`.

The scheme is versioned. Existing mark rows keep their `scheme_version` and `scheme_snapshot`; changing a scheme must not silently reinterpret old results.

## Workflow and status transitions

1. **School Admin setup**
   - Configure assessment components in `exam_configs`; configured component maximums must total exactly 100.
   - Activate class subjects and assign each subject teacher through the existing class-subject assignment screen and `class_subjects`.
2. **Subject Teacher marks**
   - `POST /exams/marks` accepts only authenticated school teachers.
   - The server verifies the teacher/class/subject assignment and that every submitted student belongs to the selected class.
   - Draft marks can be saved incrementally. Submission requires every configured component for every student in that subject.
   - Submitted rows are locked for editing.
3. **Form Teacher review**
   - The class teacher can read the class-wide active subject register.
   - `POST /exams/forward-class` verifies every active class subject has a submitted mark for every enrolled student, then moves those rows from `submitted` to `form_teacher_submitted`.
4. **School Admin review**
   - `POST /exams/approve` changes only `form_teacher_submitted` rows to `approved`.
   - `POST /exams/return` moves those rows back to `draft` with a required correction reason and audit trail.
5. **Publication**
   - `POST /exams/publish` calls the database publication function. Publication is blocked unless every enrolled student has an approved result for every active class subject.
   - Parent and student result reads are filtered to rows with `published_at` set. The direct Data API RLS policy applies the same publication gate.
   - The admin-only `POST /exams/unpublish` route clears publication timestamps and archives the matching publication notice. Approved marks remain approved and can be published again.

## Calculation rules

- A subject total is the sum of all configured assessment components, out of 100.
- A term total is the sum of the entered active-subject totals; the term average is total divided by the number of active subjects with complete marks.
- Form Teacher class totals and rankings remain hidden until every active subject has been submitted for every enrolled student.
- Class rank uses the unrounded total; tied totals share the same competition rank (1, 1, 3).
- A final subject result is the mean of Term 1 and Term 2 subject scores. It is unavailable if either term score is missing. Do not round before calculating the final average.

## Security boundaries

- Keep every read/write school-scoped.
- Teacher write access is checked server-side against `class_subjects`; UI filtering is not an authorization boundary.
- Form Teacher class-wide read scope is implemented in the private RLS helpers by migration `20261111070000_form_teacher_rls_scope.sql`.
- Parent/student access is limited to published marks by migration `20261117063107_exam_results_corrections_and_publication.sql`.
- Do not use user-editable JWT metadata for role authorization. Preserve the existing private RLS helper model.
- All status changes must keep their audit events.

## Verification and known limits

- Pure calculation behavior is covered by `tests/exam-calculations.test.ts`.
- Existing route, teacher workflow, RLS, and published-portal regression suites remain in place.
- The repository has no local runtime in the connected GitHub session, so npm install, TypeScript, lint, full test, browser, and live Postgres checks must be reported from CI or explicitly marked unverified.
- The approved HTML design reference is `docs/demo/exam-flow-reference.html`. Implement the screens and transitions in the existing React/API/storage boundaries above; do not treat the standalone demo's in-memory sample data as production persistence.
