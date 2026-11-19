The only correct GitHub repo is github.com/Mohamedabdirahmon11/school-sos (one r in Abdirahmon). Never use the two-r spelling.


## Exam System source of truth and workflow rules

- Treat `docs/demo/exam-flow-reference.html` as the canonical screen and workflow reference. Read it before changing exam UI. `docs/ARCHITECTURE.md` documents the existing React/API/storage boundaries.
- School Admin configures the 100-point assessment scheme and manages active subjects and teacher assignments per class through the existing `exam_configs` and `class_subjects` data model. Do not create parallel assignment tables.
- Subject Teachers can enter marks only for the subject assigned to their teacher profile. A Form Teacher can review all active subjects in their homeroom class, but can enter marks only for their own assigned subject. Form Teachers can reopen a fully submitted subject before forwarding the class.
- Form Teacher class totals, averages, and rankings are withheld until every active subject has complete submitted marks for every enrolled student. Forwarding is blocked until that condition is met.
- Assessment values may be numeric, `ABS`, or `LB`. Preserve the special values in `assessment_scores`; `ABS` and `LB` count as zero in numeric totals and still represent an explicitly entered component.
- Term and yearly rankings use unrounded raw totals. Equal totals share competition rank (1, 1, 3). Do not round subject values before computing the final two-term average.
- Parent/student report cards are accessible only after both terms are fully approved and published. An Admin can withdraw publication; withdrawal must clear publication timestamps and archive the matching publication notice without deleting approved marks.
- Keep all exam reads/writes school-scoped and enforce role/assignment rules in the server and RLS, not only in the UI. Preserve audit records for submit, reopen, return, approve, publish, and unpublish transitions.
