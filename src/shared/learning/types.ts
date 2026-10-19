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

export type LearnerCourse = CourseSummary & { enrolled: boolean; state: LearnerState; progress: Progress | null };

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
