-- YurCore Learning: learning profile, CME credits, course feedback, certificates and learning emails.
-- Reference: "AyurLearn LMS — Certificates, Credits & Learning Profile Spec" (27 Oct 2026) and the
-- NCISM "Continuous Medical Education Guidelines" (30 Aug 2024). See docs/YURCORE_LEARNING.md.
-- Not applied automatically: run it against the YurCore Supabase project (SQL editor or CLI).
-- Safe to re-run: every statement is idempotent. Existing courses, enrollments and progress are kept.
-- Runs in one transaction: if any statement fails, nothing is applied.

begin;

-- ---------------------------------------------------------------------------
-- 1. Admin-managed categories (replaces the free-text category list) + course <-> category (many-to-many)
-- ---------------------------------------------------------------------------
create table if not exists public.meyveda_learning_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 80),
  is_active  boolean not null default true,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists meyveda_learning_categories_name_key on public.meyveda_learning_categories (lower(trim(name)));

create table if not exists public.meyveda_learning_course_categories (
  course_id   uuid not null references public.meyveda_learning_courses(id) on delete cascade,
  category_id uuid not null references public.meyveda_learning_categories(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (course_id, category_id)
);
create index if not exists meyveda_learning_course_categories_category_idx on public.meyveda_learning_course_categories (category_id);

-- Backfill: every existing free-text category becomes a managed category, and each course is tagged with it.
-- (category_name stays on the course as its primary category for existing screens and the Moodle sync.)
-- One category per case-insensitive name; when spellings differ only in case, the alphabetically first wins
-- (deterministic). Names longer than 80 characters are skipped rather than failing the migration.
insert into public.meyveda_learning_categories (name)
select distinct on (lower(trim(category_name))) trim(category_name)
from public.meyveda_learning_courses
where category_name is not null and length(trim(category_name)) between 1 and 80
order by lower(trim(category_name)), trim(category_name)
on conflict do nothing;

insert into public.meyveda_learning_course_categories (course_id, category_id)
select c.id, k.id
from public.meyveda_learning_courses c
join public.meyveda_learning_categories k on lower(trim(k.name)) = lower(trim(c.category_name))
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Course credits and course-level feedback
--    credits: decimal with one place (spec). 0 = the course awards no credits (existing courses start at 0:
--    historical credit values cannot be reconstructed, so admins set them per course).
-- ---------------------------------------------------------------------------
alter table public.meyveda_learning_courses
  add column if not exists credits                numeric(5,1) not null default 0 check (credits >= 0 and credits <= 999),
  add column if not exists credit_type            text not null default 'cme' check (credit_type in ('cme', 'participation')),
  add column if not exists feedback_enabled       boolean not null default false,
  add column if not exists feedback_title         text check (feedback_title is null or length(feedback_title) <= 200),
  add column if not exists feedback_allow_comment boolean not null default true;

create index if not exists meyveda_learning_courses_created_idx on public.meyveda_learning_courses (created_at desc, id desc);

-- One final course feedback per learner per course (a learner may revise it; there is never a second row).
create table if not exists public.meyveda_learning_course_feedback (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.meyveda_learning_courses(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  rating       integer not null check (rating between 1 and 5),
  comment      text not null default '' check (length(comment) <= 5000),
  submitted_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (course_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 3. Settings (one row): credit year, targets, issuer, reminders
--    Targets: the NCISM guidelines require 50 credit points within the 5 years before each registration renewal
--    (phased in from 10 points for renewals due 1 Mar 2025 – 28 Feb 2026) and one 10-point elective per year;
--    they prescribe no *annual* target. The default below (10/year) is an administrative choice derived from
--    that, not a regulatory value. Admins change it in Learning settings.
-- ---------------------------------------------------------------------------
create table if not exists public.meyveda_learning_settings (
  id                        boolean primary key default true check (id),
  credit_year_start_month   integer not null default 1 check (credit_year_start_month between 1 and 12),
  default_targets           jsonb not null default '{"doctor": 10}',
  minimum_target            numeric(6,1) not null default 10 check (minimum_target >= 0),
  counted_credit_types      text[] not null default '{cme,participation,manual}',
  credit_unit_label         text not null default 'CME credits',
  issuer_name               text not null default 'YurCore Learning',
  issuer_address            text not null default '',
  signatory_name            text not null default '',
  signatory_title           text not null default '',
  signature_path            text,
  accreditation_statement   text not null default '',
  new_course_emails_enabled boolean not null default true,
  reminders_enabled         boolean not null default true,
  reminder_monthly          boolean not null default true,
  reminder_only_when_behind boolean not null default false,
  reminder_year_end_days    integer[] not null default '{60,30,7}',
  updated_at                timestamptz not null default now(),
  updated_by                uuid references public.users(id) on delete set null
);
insert into public.meyveda_learning_settings (id) values (true) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4. Learning profile: interests and one target per learner per credit year
-- ---------------------------------------------------------------------------
create table if not exists public.meyveda_learning_user_interests (
  user_id     uuid not null references public.users(id) on delete cascade,
  category_id uuid not null references public.meyveda_learning_categories(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, category_id)
);

create table if not exists public.meyveda_learning_targets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  credit_year    integer not null check (credit_year between 2000 and 2200), -- the calendar year the credit year starts in
  target_credits numeric(6,1) not null check (target_credits > 0 and target_credits <= 9999),
  set_by         text not null default 'learner' check (set_by in ('learner', 'admin')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, credit_year)
);

-- ---------------------------------------------------------------------------
-- 5. Certificates. Numbers AYL-YYYY-NNNNNN come from a per-year counter that only ever increases,
--    so a number is never reused. Snapshot columns keep what was certified even if the course changes.
--    course_id has no foreign key on purpose: certificates must stay verifiable if a course is deleted.
-- ---------------------------------------------------------------------------
create table if not exists public.meyveda_learning_certificate_counters (
  year integer primary key,
  last integer not null default 0
);

create table if not exists public.meyveda_learning_certificates (
  id                  uuid primary key default gen_random_uuid(),
  certificate_number  text not null unique check (certificate_number ~ '^AYL-[0-9]{4}-[0-9]{6}$'),
  user_id             uuid not null references public.users(id) on delete restrict,
  course_id           uuid not null,
  enrollment_id       uuid references public.meyveda_learning_enrollments(id) on delete set null,
  learner_name        text not null,
  qualification       text,
  registration_number text,
  course_title        text not null,
  credits_awarded     numeric(5,1) not null default 0,
  credit_type         text not null check (credit_type in ('cme', 'participation')),
  completed_at        timestamptz not null,
  issued_at           timestamptz not null default now(),
  status              text not null default 'valid' check (status in ('valid', 'revoked')),
  revoke_reason       text,
  revoked_at          timestamptz,
  revoked_by          uuid references public.users(id) on delete set null,
  version             integer not null default 1,
  pdf_path            text,
  pdf_version         integer,           -- the version the stored PDF was rendered for (null = not rendered yet)
  updated_at          timestamptz not null default now(),
  unique (user_id, course_id)
);
create index if not exists meyveda_learning_certificates_user_idx on public.meyveda_learning_certificates (user_id, issued_at desc);

-- Version history of reissues (e.g. a name correction keeps the number and records the previous details).
create table if not exists public.meyveda_learning_certificate_versions (
  id             uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references public.meyveda_learning_certificates(id) on delete cascade,
  version        integer not null,
  learner_name   text not null,
  qualification  text,
  registration_number text,
  reason         text not null,
  changed_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (certificate_id, version)
);

-- ---------------------------------------------------------------------------
-- 6. Append-only credit ledger. Rows are never edited or deleted (enforced by trigger); a revoke or
--    correction is a new negative row pointing at the original (reverses_id). A reversal keeps the
--    original's awarded_on so it reduces the credit year the credits were counted in.
-- ---------------------------------------------------------------------------
create table if not exists public.meyveda_learning_credit_ledger (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete restrict,
  course_id      uuid,                    -- no FK: history outlives deleted courses
  course_title   text,
  certificate_id uuid references public.meyveda_learning_certificates(id) on delete restrict,
  credit_type    text not null check (credit_type in ('cme', 'participation', 'manual')),
  credits        numeric(6,1) not null check (credits <> 0),
  reason         text not null check (length(trim(reason)) > 0),
  awarded_on     timestamptz not null,
  reverses_id    uuid unique references public.meyveda_learning_credit_ledger(id) on delete restrict,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists meyveda_learning_credit_ledger_user_idx on public.meyveda_learning_credit_ledger (user_id, awarded_on desc);
-- A certificate awards credits exactly once.
create unique index if not exists meyveda_learning_credit_ledger_award_once
  on public.meyveda_learning_credit_ledger (certificate_id) where certificate_id is not null and reverses_id is null;

-- This trigger and function are new (they only touch the new ledger table); no existing trigger is replaced.
-- One function serves both triggers below: the row-level UPDATE/DELETE trigger and the statement-level TRUNCATE
-- trigger (row triggers cannot fire on TRUNCATE). It always raises, so the triggering statement is rolled back.
create or replace function public.meyveda_learning_ledger_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'meyveda_learning_credit_ledger is append-only: % is not allowed (add a reversing row instead)', tg_op
    using errcode = 'insufficient_privilege';
end $$;
drop trigger if exists meyveda_learning_ledger_immutable on public.meyveda_learning_credit_ledger;
create trigger meyveda_learning_ledger_immutable before update or delete on public.meyveda_learning_credit_ledger
  for each row execute function public.meyveda_learning_ledger_immutable();
drop trigger if exists meyveda_learning_ledger_no_truncate on public.meyveda_learning_credit_ledger;
create trigger meyveda_learning_ledger_no_truncate before truncate on public.meyveda_learning_credit_ledger
  for each statement execute function public.meyveda_learning_ledger_immutable();

-- ---------------------------------------------------------------------------
-- 7. Learning email / notification deliveries. dedupe_key makes every send idempotent
--    (e.g. new_course:<course>:<user>, completed:<certificate>, target_met:<user>:<year>:<target>,
--    reminder:<user>:<year>:<period>), so retries and repeated page loads never send twice.
-- ---------------------------------------------------------------------------
create table if not exists public.meyveda_learning_deliveries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  kind            text not null check (kind in ('new_course', 'target_reminder', 'target_met', 'course_completed')),
  dedupe_key      text not null unique,
  course_id       uuid,
  certificate_id  uuid references public.meyveda_learning_certificates(id) on delete set null,
  recipient_email text,
  payload         jsonb not null default '{}',
  status          text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts        integer not null default 0,
  last_error      text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  updated_at      timestamptz not null default now()
);
create index if not exists meyveda_learning_deliveries_status_idx on public.meyveda_learning_deliveries (status, created_at desc);
create index if not exists meyveda_learning_deliveries_user_idx on public.meyveda_learning_deliveries (user_id, kind);

-- ---------------------------------------------------------------------------
-- 8. Issue a certificate (and its credits) in one transaction.
--    Re-checks every completion rule in the database while holding a lock on the enrollment, so
--    concurrent requests cannot issue twice or issue early. Returns the certificate id and whether it
--    was created now; returns null id with a reason when the learner is not yet eligible.
-- ---------------------------------------------------------------------------
create or replace function public.meyveda_learning_issue_certificate(
  p_user_id uuid, p_course_id uuid, p_learner_name text, p_qualification text, p_registration_number text
) returns table (certificate_id uuid, created boolean, reason text)
language plpgsql
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_enrollment public.meyveda_learning_enrollments%rowtype;
  v_course     public.meyveda_learning_courses%rowtype;
  v_existing   uuid;
  v_total      integer;
  v_done       integer;
  v_year       integer;
  v_seq        integer;
  v_cert       uuid;
begin
  select * into v_enrollment from public.meyveda_learning_enrollments
   where course_id = p_course_id and user_id = p_user_id for update;
  if not found then return query select null::uuid, false, 'not_enrolled'; return; end if;

  select id into v_existing from public.meyveda_learning_certificates where user_id = p_user_id and course_id = p_course_id;
  if v_existing is not null then return query select v_existing, false, 'exists'; return; end if;

  select * into v_course from public.meyveda_learning_courses where id = p_course_id;
  if not found then return query select null::uuid, false, 'no_course'; return; end if;
  if coalesce(trim(p_learner_name), '') = '' then raise exception 'learner name is required'; end if;

  select count(*) into v_total from public.meyveda_learning_content where course_id = p_course_id;
  select count(*) into v_done from public.meyveda_learning_content c
   where c.course_id = p_course_id
     and exists (select 1 from public.meyveda_learning_progress p where p.content_id = c.id and p.user_id = p_user_id);
  if v_total = 0 or v_done < v_total or v_enrollment.completed_at is null then
    return query select null::uuid, false, 'incomplete'; return;
  end if;

  if v_course.feedback_enabled and not exists (
    select 1 from public.meyveda_learning_course_feedback f where f.course_id = p_course_id and f.user_id = p_user_id
  ) then
    return query select null::uuid, false, 'feedback_required'; return;
  end if;

  v_year := extract(year from (now() at time zone 'Asia/Kolkata'))::integer;
  insert into public.meyveda_learning_certificate_counters as k (year, last) values (v_year, 1)
    on conflict (year) do update set last = k.last + 1
    returning last into v_seq;
  if v_seq > 999999 then raise exception 'certificate numbers for % are exhausted', v_year; end if;

  insert into public.meyveda_learning_certificates (
    certificate_number, user_id, course_id, enrollment_id, learner_name, qualification, registration_number,
    course_title, credits_awarded, credit_type, completed_at
  ) values (
    'AYL-' || v_year || '-' || lpad(v_seq::text, 6, '0'), p_user_id, p_course_id, v_enrollment.id,
    p_learner_name, nullif(trim(p_qualification), ''), nullif(trim(p_registration_number), ''),
    v_course.title, v_course.credits, v_course.credit_type, v_enrollment.completed_at
  ) returning public.meyveda_learning_certificates.id into v_cert;

  -- No certificate, no credits; and credits come only with a certificate.
  if v_course.credits > 0 then
    insert into public.meyveda_learning_credit_ledger (user_id, course_id, course_title, certificate_id, credit_type, credits, reason, awarded_on)
    values (p_user_id, p_course_id, v_course.title, v_cert, v_course.credit_type, v_course.credits, 'Course completed', v_enrollment.completed_at);
  end if;

  return query select v_cert, true, 'issued';
end $$;

-- Revoke a certificate and reverse its credits (new negative rows), atomically. Idempotent.
create or replace function public.meyveda_learning_revoke_certificate(p_certificate_id uuid, p_reason text, p_admin uuid)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_cert public.meyveda_learning_certificates%rowtype;
  r      record;
begin
  -- Defence in depth: the API already requires an admin session; the database also checks the recorded admin.
  if not exists (select 1 from public.users u where u.id = p_admin and u.role::text in ('admin', 'super_admin')) then
    raise exception 'only administrators can revoke certificates';
  end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'a revoke reason is required'; end if;

  select * into v_cert from public.meyveda_learning_certificates where id = p_certificate_id for update;
  if not found then raise exception 'certificate not found'; end if;
  if v_cert.status = 'revoked' then return false; end if;

  update public.meyveda_learning_certificates
     set status = 'revoked', revoke_reason = p_reason, revoked_at = now(), revoked_by = p_admin, updated_at = now()
   where id = p_certificate_id;

  for r in
    select l.* from public.meyveda_learning_credit_ledger l
     where l.certificate_id = p_certificate_id and l.reverses_id is null and l.credits > 0
       and not exists (select 1 from public.meyveda_learning_credit_ledger x where x.reverses_id = l.id)
  loop
    insert into public.meyveda_learning_credit_ledger (user_id, course_id, course_title, certificate_id, credit_type, credits, reason, awarded_on, reverses_id, created_by)
    values (r.user_id, r.course_id, r.course_title, null, r.credit_type, -r.credits, 'Certificate revoked: ' || p_reason, r.awarded_on, r.id, p_admin);
  end loop;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 9. RLS on with no policies, server-only (service role), like every other learning table. Functions are not
--    callable by clients (only service_role may execute them).
-- ---------------------------------------------------------------------------
alter table public.meyveda_learning_categories            enable row level security;
alter table public.meyveda_learning_course_categories     enable row level security;
alter table public.meyveda_learning_course_feedback       enable row level security;
alter table public.meyveda_learning_settings              enable row level security;
alter table public.meyveda_learning_user_interests        enable row level security;
alter table public.meyveda_learning_targets               enable row level security;
alter table public.meyveda_learning_certificate_counters  enable row level security;
alter table public.meyveda_learning_certificates          enable row level security;
alter table public.meyveda_learning_certificate_versions  enable row level security;
alter table public.meyveda_learning_credit_ledger         enable row level security;
alter table public.meyveda_learning_deliveries            enable row level security;

-- Browsers (anon / authenticated keys) get no table access at all, even if a permissive policy is added later by
-- mistake; the Next.js server uses the service role, which bypasses RLS.
revoke all on table
  public.meyveda_learning_categories, public.meyveda_learning_course_categories, public.meyveda_learning_course_feedback,
  public.meyveda_learning_settings, public.meyveda_learning_user_interests, public.meyveda_learning_targets,
  public.meyveda_learning_certificate_counters, public.meyveda_learning_certificates, public.meyveda_learning_certificate_versions,
  public.meyveda_learning_credit_ledger, public.meyveda_learning_deliveries
from anon, authenticated;
grant select, insert, update, delete on table
  public.meyveda_learning_categories, public.meyveda_learning_course_categories, public.meyveda_learning_course_feedback,
  public.meyveda_learning_settings, public.meyveda_learning_user_interests, public.meyveda_learning_targets,
  public.meyveda_learning_certificate_counters, public.meyveda_learning_certificates, public.meyveda_learning_certificate_versions,
  public.meyveda_learning_deliveries
to service_role;
-- The ledger is insert-only for the server (the trigger blocks update/delete for everyone, including the owner).
grant select, insert on table public.meyveda_learning_credit_ledger to service_role;
revoke update, delete, truncate on table public.meyveda_learning_credit_ledger from service_role;

revoke execute on function public.meyveda_learning_ledger_immutable() from public, anon, authenticated;
revoke execute on function public.meyveda_learning_issue_certificate(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.meyveda_learning_revoke_certificate(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.meyveda_learning_issue_certificate(uuid, uuid, text, text, text) to service_role;
grant execute on function public.meyveda_learning_revoke_certificate(uuid, text, uuid) to service_role;

-- Private bucket for certificate PDFs (served to the owner through short-lived signed URLs).
-- If the bucket already exists it is forced back to private with these limits (its files are kept).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('learning-certificates', 'learning-certificates', false, 5242880, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';

commit;
