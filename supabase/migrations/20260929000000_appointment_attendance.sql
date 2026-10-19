-- Appointment attendance: records who actually showed up, so a slot is only
-- ever marked missed when the patient and doctor were never in the
-- consultation together — and, when it is, who didn't turn up.
-- Not applied automatically: run it against the YurCore Supabase project (SQL editor or CLI).

alter table public.appointments
  add column if not exists patient_joined_at      timestamptz,
  add column if not exists practitioner_joined_at timestamptz,
  add column if not exists missed_by              text;

alter table public.appointments
  drop constraint if exists appointments_missed_by_check;

alter table public.appointments
  add constraint appointments_missed_by_check
  check (missed_by is null or missed_by in ('patient', 'practitioner', 'both'));

-- Existing no-shows were all written by the old sweep, which never knew who
-- was absent; treat them as patient no-shows (what the old notification said).
update public.appointments
set missed_by = 'patient'
where status = 'no_show' and missed_by is null;
