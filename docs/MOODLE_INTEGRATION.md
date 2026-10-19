> **Partly superseded (2026-09-26):** course content is now built and stored in YurCore (Supabase + Supabase Storage); Moodle keeps the linked course, whose create / edit / publish / delete is synchronised. Since 2026-10-14 the content is mirrored into the Moodle course too, and courses created in Moodle are imported into YurCore ("Moodle content sync"). See `docs/YURCORE_LEARNING.md`. The rest of this document describes the earlier integration, kept for reference.

# YurCore Learning – Moodle Integration (admin-controlled)

YurCore = application, UI, identity and roles. Moodle = LMS engine. Supabase = YurCore database + id mapping.
**Only admins (`admin`, `super_admin`) create and manage courses. Practitioners are learners.**

```
Admin / Practitioner → YurCore UI → YurCore API (server) → Moodle REST web services (+ local_meyveda plugin) → Moodle
```

## 1. What was verified in the installed Moodle (4.4.12)

* **Course form** (`course_edit_form`): Course full name, short name, category, visibility, start/end date, ID number, summary, course image, format, appearance, files, **Enable completion tracking**, groups, tags. There is **no "duration"**. YurCore's course form therefore contains only: full name*, short name*, category*, start/end date, summary, image, completion tracking. "Visibility" is Draft until Publish.
* **Add an activity or resource** (course 3, as admin): Assignment, Book, Choice, Database, Feedback, Folder, Forum, Glossary, H5P, IMS content package, Text and media area, Lesson, External tool, Page, Quiz, File, SCORM package, URL, Wiki, Workshop. YurCore shows exactly this list, read from Moodle per course.
* **Quiz form** (`mod_quiz_mod_form`): General, Timing, Grade, Layout, Question behaviour, Review options, Appearance, Safe Exam Browser, Extra restrictions on attempts, Overall feedback, Common module settings, Restrict access, Completion conditions, Tags, Competencies. **Assignment form**: General, Availability, Submission types, Feedback types, Submission settings, Group submission settings, Notifications, Grade, Common module settings, Restrict access, Completion conditions, Tags, Competencies. Every module has its own form.

## 2. Architecture: Moodle's own forms, YurCore's UI

Rather than hand-writing a form per activity (which cannot match Moodle), the bridge plugin **reads the installed Moodle's own settings form** (`mod_<name>_mod_form`) and returns its sections, fields, labels, options, defaults, help text and `disabledIf`/`hideIf` rules. YurCore renders that schema in its own design (collapsible sections like Moodle, Moodle's wording). On save, YurCore sends only the changed values; the plugin rebuilds the request Moodle's form expects, runs **Moodle's form validation** and then Moodle's own `add_moduleinfo` / `update_moduleinfo`. So Moodle decides what is valid ("The close date must be after the open date.") and what is saved, for all 20 modules, and a Moodle upgrade or new setting appears automatically.

Custom bits (the parts Moodle's web services lack): sections add/rename/move/delete, activity move/show-hide/delete, course image, quiz questions and question-bank reuse, single sign-on. Question types offered in the builder: multiple choice, true/false, short answer (created into the course's Moodle question bank); other types already in the bank can be added to a quiz. "Restrict access" edits the date window and "after activity X is completed" conditions; other Moodle restriction types already on an activity are preserved.

| System | Owns |
|---|---|
| YurCore UI | Admin dashboard, course settings, course content builder, Moodle-driven activity settings, quiz questions, publish, enrolments, preview; practitioner course list and course page; sessions/roles |
| Supabase | `meyveda_learning_courses` (Moodle course id, title, description, category, draft/published, published_at, created_by), `moodle_user_mappings`, `meyveda_learning_course_activities` (best-effort activity-id index), `audit_logs` |
| Moodle | Courses, sections, all activities/resources and their settings, quizzes/questions/attempts, assignments/submissions, availability, completion, grades, enrolment, question bank |

Nothing else is copied: dates, short name, image, structure, deadlines, completion, enrolments, progress and grades are read live from Moodle. `duration_hours` was removed from use (optional migration `20260923000000_drop_learning_duration.sql` drops the column).

## 3. Flows

**Admin**: YurCore Learning → Add a new course (Moodle course settings) → created **hidden** in Moodle, mapped in Supabase as `draft` → Course content: add sections, then "Add an activity or resource" (Moodle's list) → Moodle's settings for that module → Save (validated by Moodle) → for quizzes, add questions (new or from the Moodle question bank) → reorder by drag and drop, Hide/Show, Edit settings, Delete → Preview → Publish (confirmation; requires at least one activity and no quiz without questions) → Moodle visibility and `status` change together. Unpublish reverses both.

**Practitioner**: YurCore Learning shows published courses only (All Courses / My Learning / Completed). The course page shows exactly the activities the admin configured with status, deadlines, lock reasons and grades read from Moodle. Start/Continue or an activity → server enrols the practitioner as **student** and returns a one-time (60 s, single-use) single-sign-on link into that Moodle course/activity. Lessons, quizzes, assignments and submissions run in Moodle; progress and grades are shown back in YurCore.

## 4. Security

* Admin operations use the server-side web-service token; it never reaches the browser. Course images are proxied through YurCore (image responses only).
* Practitioners have no create/edit/delete/publish endpoint (`/api/learning/courses` is GET only; `/api/admin/learning/*` returns 403) and `LearningAdminService` re-checks the role in every method.
* Single sign-on is refused for site administrators, suspended and deleted users; the redirect path is restricted to paths inside Moodle.
* Activity/section ids are validated against the mapped course. Field names sent to Moodle must match `[A-Za-z0-9_]+(\[n\])?` and Moodle ignores unknown ones. Uploads are type- and size-checked. Admin actions are audit-logged.

## 5. Setup

1. Supabase: apply the three migrations in `supabase/migrations/` (the last is optional cleanup).
2. Moodle plugin: copy `moodle-plugin/local_meyveda` to `<moodle>/local/meyveda`, run `php admin/cli/upgrade.php --non-interactive`, then from the Moodle root `php <repo>/moodle-plugin/register-service-functions.php` (adds the functions to the `ayurllm` service and enables file upload/download). After a plugin update run `php admin/cli/purge_caches.php`.
3. `.env.local`: `MOODLE_BASE_URL`, `MOODLE_PUBLIC_URL` (optional), `MOODLE_WS_TOKEN`, `MOODLE_TEACHER_ROLE_ID`, `MOODLE_STUDENT_ROLE_ID`, `MOODLE_DEFAULT_CATEGORY_ID`, `MOODLE_TIMEOUT_MS`.

## 6. Known limits

* Learners take quizzes and submit assignments on Moodle's own pages (opened with SSO), not in a YurCore-rendered form; YurCore shows structure, status, deadlines, progress and grades.
* Moodle creates an "Announcements" forum in every course; it appears in General like any activity (hide or delete it if not wanted).
* Some modules need content Moodle requires (a file for File/H5P/IMS/SCORM, a title for Wiki, options for Choice); Moodle reports those as field errors. Moodle settings not editable in YurCore: tags, competencies picker, repeated "add more" elements beyond Moodle's defaults, non-date/completion restriction types (kept, not editable).
* Quiz "maximum grade" follows Moodle's default (set on the quiz's question page in Moodle); passing grade and all other quiz settings are editable.
* Unpublishing also hides the course in Moodle, so enrolled learners lose access until it is republished.

## 7. Verification

`npm run test:unit` (role gating, payload validation, counts) and `tsc` pass. Against the live local Moodle and dev server, with admin and practitioner sessions: all 20 addable modules save through Moodle's form (module-specific required fields correctly reported); Moodle validation messages reach the field; create/edit/move/hide/delete; quiz questions and question-bank reuse; prerequisites; publish gating; draft hidden from practitioners; SSO lands signed in on the requested activity and is single-use; practitioners get 403 on every admin endpoint; the admin builder was driven in the browser (add section, Moodle chooser, Quiz form with Moodle's 14 sections, Moodle date validation, question, publish). Test courses were deleted afterwards.
