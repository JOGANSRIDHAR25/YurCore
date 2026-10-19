-- Reference index of the Moodle activities that belong to a YurCore course.
-- Moodle stays the source of truth (content, questions, dates, completion, grades);
-- this table only maps YurCore courses to Moodle activity ids and is re-synced from
-- Moodle whenever an admin opens or changes a course. Not applied automatically.
create table if not exists public.meyveda_learning_course_activities (
  id                  uuid primary key default gen_random_uuid(),
  course_id           uuid not null references public.meyveda_learning_courses(id) on delete cascade,
  moodle_activity_id  integer not null,            -- Moodle course-module id (cmid)
  activity_type       text not null,               -- page | resource | url | quiz | assign
  title               text not null,
  section_number      integer not null default 0,
  position            integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (course_id, moodle_activity_id)
);

create index if not exists meyveda_learning_course_activities_course_idx
  on public.meyveda_learning_course_activities (course_id, section_number, position);

-- Server-side only (service role); browsers never touch this table.
alter table public.meyveda_learning_course_activities enable row level security;
