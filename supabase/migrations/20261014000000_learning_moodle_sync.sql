-- YurCore Learning <-> Moodle content sync.
--   * Courses built in YurCore (origin 'yurcore') are mirrored into their Moodle course: sections,
--     files, lessons, quizzes and assignments become Moodle sections and activities.
--   * Courses created directly in Moodle (origin 'moodle') are imported into YurCore and kept up to
--     date from Moodle, so admins and practitioners see them in YurCore Learning.
-- The columns below remember which Moodle section / activity each YurCore row corresponds to, so a
-- sync only creates what is new, updates what changed and removes what was deleted.
-- Not applied automatically: run it against the YurCore Supabase project (SQL editor or CLI).

alter table public.meyveda_learning_courses
  add column if not exists origin           text not null default 'yurcore' check (origin in ('yurcore', 'moodle')),
  add column if not exists moodle_synced_at timestamptz,
  add column if not exists moodle_sync_error text,
  add column if not exists moodle_image_sig text;   -- thumbnail last sent to / received from Moodle

alter table public.meyveda_learning_sections
  add column if not exists moodle_section_id integer; -- Moodle course_sections.id (stable when sections move)

alter table public.meyveda_learning_content
  add column if not exists moodle_cmid      integer,  -- Moodle course module id
  add column if not exists moodle_sync_hash text,     -- fingerprint of what was last synced (skip unchanged items)
  add column if not exists moodle_file_sig  text;     -- file last synced (avoid re-uploading/downloading large files)

create index if not exists meyveda_learning_content_cmid_idx on public.meyveda_learning_content (moodle_cmid) where moodle_cmid is not null;

-- Courses from the earlier Moodle integration have their content in Moodle and no YurCore sections:
-- treat them as Moodle courses so their content is imported on the next sync.
update public.meyveda_learning_courses c set origin = 'moodle'
where c.moodle_course_id is not null
  and not exists (select 1 from public.meyveda_learning_sections s where s.course_id = c.id);
