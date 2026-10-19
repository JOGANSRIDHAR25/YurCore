-- YurCore Learning: courses are built and stored in YurCore (Supabase + Supabase Storage).
-- Moodle is no longer the content store. Course information stays in meyveda_learning_courses
-- (extended here); structure, content, quizzes and learner progress get their own tables.
-- Files live in the private "learning" Storage bucket; rows only hold the storage path + metadata.
-- Not applied automatically: run it against the YurCore Supabase project (SQL editor or CLI).

-- ---------------------------------------------------------------------------
-- 1. Course information (existing table, extended)
-- ---------------------------------------------------------------------------
alter table public.meyveda_learning_courses alter column moodle_course_id drop not null;

alter table public.meyveda_learning_courses
  add column if not exists short_description   text not null default '',
  add column if not exists thumbnail_path      text,
  add column if not exists level               text check (level is null or level in ('beginner', 'intermediate', 'advanced')),
  add column if not exists instructor_id       uuid references public.users(id) on delete set null,
  add column if not exists duration_minutes    integer check (duration_minutes is null or duration_minutes >= 0),
  add column if not exists learning_objectives text[] not null default '{}';

-- category_name is the course category (free text); category_id was the Moodle category and is no longer used.

-- Courses created by the earlier Moodle integration have their content in Moodle, not here:
-- keep them as drafts so practitioners never see an empty course.
update public.meyveda_learning_courses set status = 'draft', published_at = null
where moodle_course_id is not null and status = 'published';

-- ---------------------------------------------------------------------------
-- 2. Sections (ordered within a course)
-- ---------------------------------------------------------------------------
create table if not exists public.meyveda_learning_sections (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.meyveda_learning_courses(id) on delete cascade,
  title       text not null,
  description text not null default '',
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists meyveda_learning_sections_course_idx on public.meyveda_learning_sections (course_id, position);

-- ---------------------------------------------------------------------------
-- 3. Content items (ordered within a section)
-- ---------------------------------------------------------------------------
create table if not exists public.meyveda_learning_content (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.meyveda_learning_courses(id) on delete cascade,
  section_id    uuid not null references public.meyveda_learning_sections(id) on delete cascade,
  content_type  text not null check (content_type in ('image', 'video', 'document', 'file', 'lesson', 'quiz', 'question', 'assignment', 'feedback')),
  title         text not null,
  description   text not null default '',   -- caption / summary / instructions
  body          text,                       -- lesson text
  settings      jsonb not null default '{}', -- type-specific options, e.g. { "dueAt": "...", "rating": true }
  storage_path  text,                       -- object path in the "learning" bucket (never binary data)
  file_name     text,
  mime_type     text,
  size_bytes    bigint check (size_bytes is null or size_bytes >= 0),
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists meyveda_learning_content_section_idx on public.meyveda_learning_content (section_id, position);
create index if not exists meyveda_learning_content_course_idx on public.meyveda_learning_content (course_id);

-- ---------------------------------------------------------------------------
-- 4. Quizzes (one per quiz/question content item), questions and options
-- ---------------------------------------------------------------------------
create table if not exists public.meyveda_learning_quizzes (
  id                 uuid primary key default gen_random_uuid(),
  content_id         uuid not null unique references public.meyveda_learning_content(id) on delete cascade,
  course_id          uuid not null references public.meyveda_learning_courses(id) on delete cascade,
  passing_score      integer not null default 70 check (passing_score between 0 and 100),
  time_limit_minutes integer check (time_limit_minutes is null or time_limit_minutes > 0),
  attempts_allowed   integer check (attempts_allowed is null or attempts_allowed > 0), -- null = unlimited
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.meyveda_learning_quiz_questions (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null references public.meyveda_learning_quizzes(id) on delete cascade,
  question    text not null,
  explanation text not null default '',
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists meyveda_learning_quiz_questions_quiz_idx on public.meyveda_learning_quiz_questions (quiz_id, position);

create table if not exists public.meyveda_learning_quiz_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.meyveda_learning_quiz_questions(id) on delete cascade,
  option_text text not null,
  is_correct  boolean not null default false,
  position    integer not null default 0
);
create index if not exists meyveda_learning_quiz_options_question_idx on public.meyveda_learning_quiz_options (question_id, position);
-- Exactly one correct option per question is enforced by the service; this guarantees at most one.
create unique index if not exists meyveda_learning_quiz_options_one_correct
  on public.meyveda_learning_quiz_options (question_id) where is_correct;

-- ---------------------------------------------------------------------------
-- 5. Learner records
-- ---------------------------------------------------------------------------
create table if not exists public.meyveda_learning_enrollments (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.meyveda_learning_courses(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  unique (course_id, user_id)
);
create index if not exists meyveda_learning_enrollments_user_idx on public.meyveda_learning_enrollments (user_id);

create table if not exists public.meyveda_learning_progress (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.meyveda_learning_courses(id) on delete cascade,
  content_id   uuid not null references public.meyveda_learning_content(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (content_id, user_id)
);
create index if not exists meyveda_learning_progress_user_course_idx on public.meyveda_learning_progress (user_id, course_id);

create table if not exists public.meyveda_learning_quiz_attempts (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references public.meyveda_learning_quizzes(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  answers       jsonb not null default '{}',  -- { question_id: option_id }
  correct_count integer,
  total_count   integer,
  score_percent integer check (score_percent is null or score_percent between 0 and 100),
  passed        boolean
);
create index if not exists meyveda_learning_quiz_attempts_user_idx on public.meyveda_learning_quiz_attempts (quiz_id, user_id);

-- Assignment submissions and feedback answers.
create table if not exists public.meyveda_learning_responses (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.meyveda_learning_courses(id) on delete cascade,
  content_id    uuid not null references public.meyveda_learning_content(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  response_text text not null default '',
  rating        integer check (rating is null or rating between 1 and 5),
  submitted_at  timestamptz not null default now(),
  unique (content_id, user_id)
);

-- Server-side only: the backend uses the service role, browsers never touch these tables.
alter table public.meyveda_learning_sections       enable row level security;
alter table public.meyveda_learning_content        enable row level security;
alter table public.meyveda_learning_quizzes        enable row level security;
alter table public.meyveda_learning_quiz_questions enable row level security;
alter table public.meyveda_learning_quiz_options   enable row level security;
alter table public.meyveda_learning_enrollments    enable row level security;
alter table public.meyveda_learning_progress       enable row level security;
alter table public.meyveda_learning_quiz_attempts  enable row level security;
alter table public.meyveda_learning_responses      enable row level security;

-- ---------------------------------------------------------------------------
-- 6. Storage: private bucket, layout courses/<course-id>/{thumbnail,videos,images,documents,files}/...
--    No bucket size cap: uploads are bounded only by the project's global upload limit.
--    Admins upload through server-issued signed upload URLs; learners read through short-lived signed URLs.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('learning', 'learning', false, null, array[
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv', 'application/zip', 'audio/mpeg', 'audio/mp4', 'audio/wav'
])
on conflict (id) do nothing;
