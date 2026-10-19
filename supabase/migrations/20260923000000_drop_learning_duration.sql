-- Moodle has no course "duration" setting, so YurCore no longer stores one (course dates come from Moodle).
-- Optional cleanup: the column is no longer read or written by the application.
alter table public.meyveda_learning_courses drop column if exists duration_hours;
