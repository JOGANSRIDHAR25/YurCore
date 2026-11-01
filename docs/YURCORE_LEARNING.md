# YurCore Learning – course builder

Course content is built and stored in YurCore: course data in Supabase, files in Supabase Storage.
Every course is also a Moodle course. The course lifecycle and the course content are kept in sync with Moodle, and courses created directly in Moodle are imported (see "Moodle course sync" and "Moodle content sync" below).
Only admins (`admin`, `super_admin`) build courses. Practitioners (`doctor` role with a practitioner profile) are the learners.

## Flow

Admin: **Create course** (details: title, short and full description, thumbnail, category, level, instructor, duration, learning objectives) → **Build content** (sections; add Video / Image / PDF-Document / File / Text lesson, Quiz / Question / Assignment / Feedback; drag or arrow-reorder items and sections) → **Preview** (the real learner player with local, unsaved progress) → **Publish** (checklist; blocked while a file item has no file or a quiz has no questions). Changes save as you go; "Save draft" leaves the course as a draft.

Practitioner: `/pro/learning` lists published courses (All / My Learning / Completed) → course page: overview, outline, and each item in admin order. Media and lessons are marked complete (videos automatically when they end); quizzes complete when passed, a single question once answered, assignments and feedback once submitted. The course completes when every item is complete.

## Data (migration `supabase/migrations/20260926000000_learning_native_content.sql`)

| Table | Holds |
|---|---|
| `meyveda_learning_courses` (existing, extended) | title, short_description, description, category_name, level, instructor_id, duration_minutes, learning_objectives, thumbnail_path, status, published_at |
| `meyveda_learning_sections` | course_id, title, description, position |
| `meyveda_learning_content` | course_id, section_id, content_type, title, description, body (lesson), settings (due date / rating), storage_path, file_name, mime_type, size_bytes, position |
| `meyveda_learning_quizzes` | content_id, passing_score, time_limit_minutes, attempts_allowed |
| `meyveda_learning_quiz_questions` / `_quiz_options` | question, explanation, position / option_text, is_correct (at most one per question, enforced by a unique index), position |
| `meyveda_learning_enrollments`, `_progress`, `_quiz_attempts`, `_responses` | learner start/completion, completed items, graded attempts, assignment/feedback answers |

All tables have RLS on and are used only by the server (service role).

## Moodle course sync

`meyveda_learning_courses.id` (uuid) is the YurCore course; `moodle_course_id` is the id Moodle returned when the course was created (never assumed equal). Every step changes Moodle first and YurCore only after Moodle succeeded:

| Action | Moodle | YurCore |
|---|---|---|
| Create | `core_course_create_courses` (hidden, default category) | row inserted with `moodle_course_id`; if the insert fails the Moodle course is deleted again |
| Edit title / description | `core_course_update_courses` (fullname / summary) | row updated |
| Publish / unpublish | course made visible / hidden | status changed |
| Delete | `core_course_delete_courses`, then re-read to confirm it is gone. Moodle reports refusals as *warnings* in a successful response; these are checked | only then: course row (sections, content, quizzes, learner records cascade) and its Storage folder |

If a Moodle step fails, the operation stops and nothing in YurCore changes, so retrying is safe. A Moodle course that no longer exists (deleted in Moodle directly) counts as already deleted, and the admin list flags such courses.

## Moodle content sync (migration `20261014000000_learning_moodle_sync.sql`)

Code: `src/backend/service/learning-moodle-sync.service.ts`. Every course has an `origin`:

**`yurcore` – built in YurCore, mirrored into Moodle (push).** After every builder change (section, item, order, quiz, details, publish) the course is pushed to its Moodle course in the background (Next.js `after()`), so the admin never waits for Moodle:

| YurCore | Moodle |
|---|---|
| Section (title, description, order) | Course section |
| Video / Image / PDF-Document | File resource with the file uploaded (shown embedded) |
| File | File resource |
| Text lesson | Page |
| Quiz / Question | Quiz (time limit, attempts, pass grade) with its multiple-choice questions |
| Assignment | Assignment (online text + file submissions, due date, attached instructions file) |
| Feedback | Assignment (online text, ungraded) |
| Thumbnail | Course image |

YurCore is the source of truth for these courses: anything in the Moodle course YurCore does not know about is removed (Moodle's Announcements forum is kept). Rows remember their Moodle section / activity id (`moodle_section_id`, `moodle_cmid`) and a fingerprint of what was last sent (`moodle_sync_hash`, `moodle_file_sig`), so unchanged items are skipped and files are only uploaded when new or replaced.

**`moodle` – created in Moodle, imported into YurCore (pull).** New Moodle courses get a YurCore row when the admin course list opens (and when practitioners open Learning, in the background, at most every 5 minutes); their content is then imported and refreshed on every sync: File resources → Video/Image/PDF/File (the file is copied to Storage), Page/Label/URL → Text lesson, Quiz → Quiz (single-answer multiple-choice and true/false questions; a quiz without such questions becomes a lesson linking to Moodle), Assignment → Assignment, Feedback → Feedback, any other activity → a lesson with its description and a link to it in Moodle. Hidden sections/activities and empty sections are skipped. The course is published in YurCore while it is visible in Moodle. Its content is edited in Moodle (the YurCore builder shows it read-only); category, level, instructor and objectives can still be set in YurCore.

Status and controls: the admin list and course page show the last sync and any problem (`moodle_synced_at`, `moodle_sync_error`); **Sync with Moodle** (list) imports new Moodle courses and syncs every course both ways, **Sync now** (course page) syncs one course. A failed item does not stop the rest of the course; its Moodle message is shown on the course. Syncs of one course are queued so they never overlap (per server process).

## Files

Private bucket `learning`, paths `courses/<course-id>/{thumbnail,videos,images,documents,files}/<uuid>-<name>`. Rows store the path and metadata, never file data.
Uploads go from the browser straight to Storage with a server-issued signed upload URL (after the admin check and a file-type check), with progress; the server then verifies the object exists, sits in that course's folder and has an allowed type before a row may reference it. Learners and the admin UI get 3-hour signed URLs. Replaced or deleted files are removed from Storage; deleting a course removes its folder.

There is no application limit on the number or size of videos, images or documents. The only ceiling is the Supabase project's upload limit (Dashboard → Storage → Settings: 50 MB on the Free plan; configurable on paid plans). For very large videos, raise that limit.

## Setup

1. Run the migration in the Supabase SQL editor (creates tables and the `learning` bucket).
2. Run `supabase/migrations/20261014000000_learning_moodle_sync.sql` (content sync columns).
3. Moodle: the `local_meyveda` plugin installed and registered (`docs/MOODLE_INTEGRATION.md` § 5), file upload/download enabled for the service, and a valid `MOODLE_WS_TOKEN` (Site administration → Server → Web services → Manage tokens; user admin, service AyurLLM) plus `MOODLE_BASE_URL` in `.env.local`. PHP `upload_max_filesize` / `post_max_size` limit the largest video that can be sent to Moodle.

## Learning profile, credits, feedback and certificates (migration `20261028000000_learning_credits_certificates.sql`)

Functional reference: *AyurLearn LMS — Certificates, Credits & Learning Profile Spec* (27 Oct 2026). Regulatory reference: NCISM *Continuous Medical Education Guidelines* (30 Aug 2024).

### What the CME guidelines do and do not say
- **Verified:** 50 credit points within the 5 years before each registration renewal (reg. 7(8)), phased in: renewals due 1 Mar 2025 – 28 Feb 2026 need 10, then 20, 30, 40, and 50 from 1 Mar 2029. One online elective per year carries 10 points. Online modules of 3 to under 6 hours are tentatively 5 points, 6 hours or more 10 points. Points are "at the sole discretion of the Board of Ethics & Registration". No certificate before completion. Practitioners over 70 are exempt.
- **Not prescribed:** an *annual* target, a reminder schedule, a certificate number format. So the annual target default (10, derived from 50 / 5 years) and minimum (10) are **admin settings**, not regulatory values; reminders are configurable. YurCore certificates never claim NCISM accreditation; an accreditation line is printed only if an admin enters one.
- `ayurvidya.aiia.gov.in` could not be inspected (its TLS certificate was rejected), so nothing here is based on it.

### Practitioner flow
`YurCore Learning` (sidebar) → **Learning Setup** until the learner has ≥ 1 interest (max 3, from the admin's active categories) and has confirmed **this credit year's target** (≥ admin minimum) → **Continue to Learning** saves both, then shows the catalogue. At the start of a new credit year the setup screen asks to confirm the target again (interests are pre-filled).
Catalogue: target summary (server-computed), **Recommended for You** (interests first, then courses whose credits best close the remaining gap, then newest), search + category + **Filters & Sorting** (Sort: Newest/Oldest by `created_at`, stable on id; Top 3 Favorite Categories: any-of). Tabs: All / My Learning / Completed / Certificates / Learning Profile.
Course page: after the content, the course **Feedback** module (when enabled; unlocks once all content is complete; 1–5 rating required, comment optional) and the **certificate** card.

### Rules (all enforced on the server)
| Rule | Where |
|---|---|
| Certificate + credits issued together, once per learner per course, only when all content is complete and (if enabled) feedback submitted | `meyveda_learning_issue_certificate()` (one transaction, enrollment row locked, unique `(user_id, course_id)`) |
| Number `AYL-YYYY-NNNNNN` (issue year, IST), never reused | per-year counter table + unique constraint |
| Credits = course credit value at completion; later edits don't change past awards | snapshot on certificate + ledger row |
| Ledger append-only; revoke = new negative row (`reverses_id`), dated like the original so it reduces that year | trigger + `meyveda_learning_revoke_certificate()` |
| Credit year: calendar year in IST by default (admin can set the start month); a completion at 23:30 IST on 31 Dec counts for that year | `src/shared/learning/credits.ts` (unit-tested, incl. the spec's 27 Oct 2026 worked example) |
| completed / remaining / % / days remaining (today not counted) / pace (30-day months) / status | `computeTargetProgress` |
| Target cannot go below the admin minimum; stored per (learner, credit year) | `LearningProfileService` |

### Emails and in-app notifications
Sent through the existing `send-email` edge function (Gmail SMTP). Set its secrets so mail is sent **from admin.meyveda@gmail.com**: `GMAIL_USER=admin.meyveda@gmail.com` and `GMAIL_APP_PASSWORD=<Google app password>` (Supabase → Edge Functions → Secrets; never in the repo or `NEXT_PUBLIC_*`). Each email also creates a row in the existing `notifications` table (type `learning`, deep link to the course / certificate / profile).
- **New course** — when a course is published (or made visible in Moodle) to learners whose interests include one of its categories; once per learner per course.
- **Course completed** — after the certificate is issued; links to `/pro/learning/certificates?download=<id>` and the public verify page.
- **Target met** — once per learner, credit year and target value.
- **Target reminder** — monthly and/or at N days before year end (admin settings); never once the target is met; once per period.
Every send is recorded in `meyveda_learning_deliveries` (unique dedupe key, status, attempts, error). Admin → Learning settings → Emails & reminders lists them and can retry failed ones.

### Environment
- `APP_BASE_URL` — public origin used in emails and QR codes (e.g. `https://app.yurcore.in`). Falls back to `NEXT_PUBLIC_APP_URL`; **must not be localhost in production**.
- `LEARNING_CRON_SECRET` — enables `POST /api/learning/jobs/reminders` (`Authorization: Bearer <secret>`). Schedule it daily (Supabase cron + `pg_net`, Vercel cron, or any scheduler). Reminders also run opportunistically (at most every 6 h per server) while learners use the app, and from the admin "Run reminders now" button; all paths are idempotent.

### Setup / backfill
1. Run `supabase/migrations/20261028000000_learning_credits_certificates.sql`. Existing free-text categories become managed categories and courses are tagged with them; existing courses get **0 credits** (historical values cannot be reconstructed), feedback disabled.
2. Admin → Learning settings: review categories, default/minimum target, issuer details (signatory and signature are optional; leave the accreditation statement empty unless an approval exists).
3. Set credits (and feedback) per course in the course details form / Feedback tab.
4. Set the email secrets and `APP_BASE_URL`, and schedule the reminder job.

Existing Feedback content items keep working; new feedback is configured per course (Feedback tab), so Feedback is no longer offered in *Add content*.

## Course ratings and certificate email attachment (migration 20261029000000)

- **Ratings** come only from course feedback (`meyveda_learning_course_feedback`, one rating per learner per course, 1–5). `meyveda_learning_course_ratings(uuid[])` counts them in the database for a whole batch of cards in one call (no per-card queries, no API row-limit truncation); deactivated accounts are excluded. Average = sum / count, rounded to one decimal; a course with no ratings shows "No ratings yet". Nothing is stored, so a new or revised feedback shows on the next read. The same aggregate feeds the catalogue cards, the recommendations carousel and the course page. If the function is missing, ratings are hidden rather than shown as zero.
- **Certificate email**: the "Course Completed" email now carries the certificate PDF as an attachment (`YurCore_Certificate_<number>.pdf`, via the same `send-email` attachment field the invoice email uses) and keeps the Verify Certificate link. The PDF is rendered or reused from storage and checked (`%PDF-` header, `%%EOF` trailer) before sending; if it cannot be produced, nothing is sent and the delivery is marked failed so Admin → Learning settings → Deliveries → Retry can resend it. Revoked certificates are never emailed.
