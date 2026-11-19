-- Dedicated Form Teacher report-card comments, isolated by school and academic year.
create table if not exists public.form_teacher_comments (
  id uuid primary key default gen_random_uuid(),
  school_id text not null,
  class_id text not null,
  student_id text not null,
  teacher_user_id text not null,
  academic_year text not null,
  semester text not null check (semester in ('Semester 1', 'Semester 2')),
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint form_teacher_comments_unique unique (school_id, student_id, academic_year, semester),
  constraint form_teacher_comments_length check (char_length(comment) <= 1500)
);

create index if not exists form_teacher_comments_class_term_idx
  on public.form_teacher_comments (school_id, class_id, academic_year, semester);

alter table public.form_teacher_comments enable row level security;
