/** DTOs shared by the YurCore Learning API and UI (admin builder, preview and learner player). */

export type CourseStatus = "draft" | "published";
export type CourseLevel = "beginner" | "intermediate" | "advanced";

export type ContentType = "image" | "video" | "document" | "file" | "lesson" | "quiz" | "question" | "assignment" | "feedback";
/** Content types that hold an uploaded file. */
export type FileContentType = "image" | "video" | "document" | "file";
export type UploadKind = FileContentType | "thumbnail" | "attachment";

export type Instructor = { id: string; name: string; specialty: string | null; photoUrl: string | null };

export type CourseCounts = { sections: number; items: number; videos: number; documents: number; quizzes: number };

export type CourseSummary = {
  id: string;
  title: string;
  shortDescription: string;
  description: string;
  category: string | null;
  level: CourseLevel | null;
  durationMinutes: number | null;
  learningObjectives: string[];
  instructor: Instructor | null;
  thumbnailUrl: string | null;
  status: CourseStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  counts: CourseCounts;
  /** managed categories the course is tagged with (category above is the primary one) */
  categories: { id: string; name: string }[];
  /** credits awarded on completion (0 = none) and their type */
  credits: number;
  creditType: "cme" | "participation";
};

export type AdminCourse = CourseSummary & {
  createdBy: string | null;
  learners: number;
  /** The Moodle course this course is linked to (created, updated, published and deleted together). */
  moodleCourseId: number | null;
  /** linked: exists in Moodle · missing: deleted in Moodle directly · unknown: Moodle not reachable */
  moodleStatus: "linked" | "missing" | "not_linked" | "unknown";
  /** yurcore: built here and mirrored into Moodle · moodle: created in Moodle and imported (edited in Moodle) */
  origin: "yurcore" | "moodle";
  /** Last content sync with Moodle: when it finished, what failed, and whether one is running now. */
  moodleSync: { syncedAt: string | null; error: string | null; busy: boolean };
  /** The course in Moodle, for admins (null when not linked). */
  moodleUrl: string | null;
  feedback: { enabled: boolean; title: string | null; allowComment: boolean };
};

export type QuizOption = { id?: string; text: string; correct: boolean };
export type QuizQuestion = { id?: string; question: string; explanation: string; options: QuizOption[] };
export type QuizSettings = { passingScore: number; timeLimitMinutes: number | null; attemptsAllowed: number | null };
export type Quiz = QuizSettings & { questions: QuizQuestion[] };

export type ContentSettings = { dueAt?: string | null; rating?: boolean };

export type ContentFile = { path: string; name: string; mimeType: string; size: number; url: string | null };

export type ContentItem = {
  id: string;
  sectionId: string;
  type: ContentType;
  title: string;
  description: string;
  body: string | null;
  settings: ContentSettings;
  file: ContentFile | null;
  /** quiz / question items: settings + question count (admin also gets the questions) */
  quiz: (QuizSettings & { questionCount: number; questions?: QuizQuestion[] }) | null;
};

export type Section = { id: string; title: string; description: string; items: ContentItem[] };

export type AdminCourseDetails = { course: AdminCourse; sections: Section[] };

// ---- learner ----
export type LearnerState = "not_started" | "in_progress" | "completed";
export type Progress = { completed: number; total: number; percent: number };

export type LearnerCourse = CourseSummary & { enrolled: boolean; state: LearnerState; progress: Progress | null; rating: CourseRating | null };

/**
 * Aggregated learner ratings for a course, from course feedback (one rating per learner). `average` is the sum of
 * ratings / count rounded to one decimal, null when nobody has rated it. `distribution[0]` is 1-star ... `[4]` 5-star.
 */
export type CourseRating = { average: number | null; count: number; distribution: [number, number, number, number, number] };

/** A catalogue card: only what the card shows. Missing data stays null/empty rather than being invented. */
export type LearnerCourseCard = {
  id: string;
  title: string;
  /** short description, else the start of the full description; "" when the course has neither */
  summary: string;
  category: string | null;
  level: CourseLevel | null;
  durationMinutes: number | null;
  items: number;
  thumbnailUrl: string | null;
  instructorName: string | null;
  credits: number;
  creditType: "cme" | "participation";
  createdAt: string;
  /** true when the course is in one of the learner's interest categories */
  matchesInterests?: boolean;
  /** null when ratings could not be loaded (the card then shows nothing rather than a made-up value) */
  rating: CourseRating | null;
  enrolled: boolean;
  state: LearnerState;
  progress: Progress | null;
};

/** One "Show more" batch. `nextCursor` is opaque; pass it back to get the following batch. `total` is only sent with the first batch. */
export type LearnerCoursePage = { items: LearnerCourseCard[]; nextCursor: string | null; hasMore: boolean; total: number | null };

export type ItemProgress = {
  completed: boolean;
  /** quiz: best result so far */
  bestScore?: number | null;
  passed?: boolean | null;
  attemptsUsed?: number;
  /** assignment / feedback: the learner's submission */
  response?: { text: string; rating: number | null; submittedAt: string } | null;
};

export type LearnerCourseDetails = {
  course: LearnerCourse;
  sections: Section[];
  progress: Record<string, ItemProgress>;
  completion: CourseCompletion;
};

export type AttemptQuestion = { id: string; question: string; options: { id: string; text: string }[] };
export type AttemptStart = { attemptId: string; startedAt: string; timeLimitMinutes: number | null; questions: AttemptQuestion[] };
export type AttemptResult = {
  scorePercent: number;
  correct: number;
  total: number;
  passed: boolean;
  passingScore: number;
  review: { questionId: string; chosen: string | null; correctOptionId: string; explanation: string }[];
};

export type LearnerRow = { userId: string; name: string; email: string | null; startedAt: string; completedAt: string | null; progress: Progress };
export type ResponseRow = { userId: string; name: string; text: string; rating: number | null; submittedAt: string };

// ---- learning profile, credits, feedback, certificates ----
export type LearningCategory = { id: string; name: string; active: boolean };
export type CourseCreditType = "cme" | "participation";

export type TargetSummary = import("./credits").TargetProgress & {
  /** when the completed total first reached the target in this credit year (ledger date), if it has */
  targetMetOn: string | null;
  creditUnit: string;
};

export type LearningSettingsPublic = {
  creditYearStartMonth: number;
  defaultTarget: number;
  minimumTarget: number;
  creditUnit: string;
};

/** Everything the learner hub needs on load: whether setup is needed, saved interests and this year's target. */
export type LearningProfile = {
  needsSetup: boolean;
  /** true when the learner has never finished setup (vs. only needing to confirm a new year's target) */
  firstTime: boolean;
  interests: LearningCategory[];
  categories: LearningCategory[];
  settings: LearningSettingsPublic;
  /** this credit year's saved target (null until the learner confirms it) */
  savedTarget: number | null;
  progress: TargetSummary | null;
  lastYear: { label: string; target: number | null; completed: number } | null;
  /** every credit year with a target or credits, newest first; each year independent (nothing carried over) */
  history: import("./credits").AnnualCreditYear[];
};

export type CourseFeedbackConfig = { enabled: boolean; title: string; allowComment: boolean };

export type CertificateDto = {
  id: string;
  number: string;
  courseId: string;
  courseTitle: string;
  learnerName: string;
  credits: number;
  creditType: CourseCreditType;
  completedAt: string;
  issuedAt: string;
  status: "valid" | "revoked";
  revokeReason: string | null;
  version: number;
  verifyUrl: string;
  /** false while the PDF is still being rendered (it is rendered on first download if missing) */
  pdfReady: boolean;
};

/** Course completion state for the learner: what is still needed before the certificate. */
export type CourseCompletion = {
  contentComplete: boolean;
  credits: number;
  creditType: CourseCreditType;
  feedback: CourseFeedbackConfig & { submitted: { rating: number; comment: string; submittedAt: string } | null };
  certificate: CertificateDto | null;
  /** "in_progress" | "feedback_required" | "issuing" (eligible, being issued) | "issued" | "revoked" */
  stage: "in_progress" | "feedback_required" | "issuing" | "issued" | "revoked";
};

export type LedgerEntry = {
  id: string;
  date: string;
  courseId: string | null;
  courseTitle: string | null;
  creditType: "cme" | "participation" | "manual";
  credits: number;
  reason: string;
  certificateId: string | null;
  certificateNumber: string | null;
  reverses: boolean;
};

export type CreditsOverview = {
  years: { year: number; label: string }[];
  totals: { thisYear: number; lastYear: number; lifetime: number };
  entries: LedgerEntry[];
};

export type AdminLearningSettings = LearningSettingsPublic & {
  countedCreditTypes: ("cme" | "participation" | "manual")[];
  issuerName: string;
  issuerAddress: string;
  signatoryName: string;
  signatoryTitle: string;
  signatureUrl: string | null;
  accreditationStatement: string;
  newCourseEmailsEnabled: boolean;
  remindersEnabled: boolean;
  reminderMonthly: boolean;
  reminderOnlyWhenBehind: boolean;
  reminderYearEndDays: number[];
};

export type AdminCertificateRow = CertificateDto & { userId: string; email: string | null };
export type DeliveryRow = {
  id: string;
  kind: "new_course" | "target_reminder" | "target_met" | "course_completed";
  recipient: string | null;
  learnerName: string;
  subject: string;
  status: "pending" | "sent" | "failed" | "skipped";
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
};
export type CourseFeedbackRow = { userId: string; name: string; rating: number; comment: string; submittedAt: string };
