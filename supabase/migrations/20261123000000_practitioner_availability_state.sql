-- Practitioner availability state.
--
--   accepting_bookings          The single "Accepting bookings" switch shown on the
--                               doctor dashboard and the Availability page. When
--                               false the doctor is hidden from patients and no new
--                               slots can be booked. Existing appointments are only
--                               cancelled if the doctor explicitly chooses to.
--
--   availability_configured_at  Set the first time the doctor saves their
--                               availability. Until then the doctor is NOT shown to
--                               patients, and the dashboard insists on setup.
--
-- Not applied automatically: run it against the YurCore Supabase project (SQL editor or CLI).

alter table public.practitioners
  add column if not exists accepting_bookings boolean not null default true,
  add column if not exists availability_configured_at timestamptz;

-- Doctors who already set any availability keep being shown to patients.
-- Everyone else is asked to confirm their hours before going live.
update public.practitioners p
set availability_configured_at = now()
where p.availability_configured_at is null
  and (
    exists (select 1 from public.availability_schedules s where s.practitioner_id = p.id)
    or exists (select 1 from public.calendar_availability c where c.practitioner_id = p.id)
  );
