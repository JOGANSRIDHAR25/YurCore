-- YurCore Learning <-> Moodle integration: minimum mapping tables.
-- Moodle stays the source of truth for course structure, content, quizzes, grades,
-- completion and enrolment. These tables only link YurCore identities to Moodle ids
-- and hold the metadata the YurCore UI needs. Course management is admin-only.
-- Not applied automatically: run it against the YurCore Supabase project.

-- 1. One Moodle account per YurCore user (admin or practitioner). Lets the backend act
--    for a user in Moodle without any frontend-supplied ids.
create table if not exists public.moodle_user_mappings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references public.users(id) on delete cascade,
  moodle_user_id   integer not null unique,
  moodle_username  text not null unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 2. Course mapping + YurCore-level metadata. moodle_course_id is the id returned by the
--    Moodle API (never assumed equal to id). status = 'published' makes a course visible
--    to practitioners; created_by is the admin who created it.
create table if not exists public.meyveda_learning_courses (
  id                uuid primary key default gen_random_uuid(),
  moodle_course_id  integer not null unique,
  title             text not null,
  description       text not null default '',
  category_id       integer,
  category_name     text,
  duration_hours    numeric(6,1) check (duration_hours is null or duration_hours >= 0),
  status            text not null default 'draft' check (status in ('draft', 'published')),
  published_at      timestamptz,
  created_by        uuid not null references public.users(id) on delete restrict,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists meyveda_learning_courses_status_idx on public.meyveda_learning_courses (status);

-- Server-side only: the backend uses the service role, browsers never touch these tables.
alter table public.moodle_user_mappings        enable row level security;
alter table public.meyveda_learning_courses    enable row level security;
