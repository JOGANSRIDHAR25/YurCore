import { apiClient as rawClient } from "@/shared/api/api-client";
import type { AttemptResult, AttemptStart, CertificateDto, CourseCompletion, CreditsOverview, LearnerCourseCard, LearnerCourseDetails, LearnerCoursePage, LearningProfile } from "@/shared/learning/types";

export type { LearnerCourse, LearnerCourseCard, LearnerCourseDetails, LearnerCoursePage } from "@/shared/learning/types";

/** Validation replies (e.g. "no attempts left") are shown to the user as messages, so they are not logged as console errors. */
const apiClient: typeof rawClient = (url, options) => rawClient(url, { silent: true, ...options });

export type Scope = "all" | "mine" | "completed";
/** "published" is the catalogue's default order; newest/oldest sort by when the course was created. */
export type Sort = "published" | "newest" | "oldest";

/** Courses per "Show more" batch on the catalogue (the server caps a batch at 48). */
export const LEARNING_PAGE_SIZE = 12;

const unwrap = <T,>(r: { data: T }) => r.data;
const c = (id: string) => `/api/learning/courses/${id}`;
const post = (body?: unknown) => ({ method: "POST", body: JSON.stringify(body ?? {}) });

export const learningApi = {
  /** One catalogue batch; pass the previous batch's `nextCursor` to continue. `signal` lets a newer request cancel this one. */
  list: (scope: Scope, opts: { q?: string; category?: string; categoryIds?: string[]; sort?: Sort; cursor?: string | null; limit?: number; signal?: AbortSignal } = {}) =>
    apiClient<{ data: LearnerCoursePage }>("/api/learning/courses", {
      params: {
        scope,
        q: opts.q || undefined,
        category: opts.category || undefined,
        categories: opts.categoryIds?.length ? opts.categoryIds.join(",") : undefined,
        sort: opts.sort && opts.sort !== "published" ? opts.sort : undefined,
        cursor: opts.cursor || undefined,
        limit: opts.limit,
      },
      signal: opts.signal,
    }).then(unwrap),
  categories: () => apiClient<{ data: string[] }>("/api/learning/categories").then(unwrap),
  details: (id: string) => apiClient<{ data: LearnerCourseDetails }>(c(id)).then(unwrap),
  start: (id: string) => apiClient(`${c(id)}/start`, post()),
  complete: (id: string, contentId: string) => apiClient(`${c(id)}/content/${contentId}/complete`, post()),
  startAttempt: (id: string, contentId: string) => apiClient<{ data: AttemptStart }>(`${c(id)}/content/${contentId}/attempts`, post()).then(unwrap),
  submitAttempt: (id: string, contentId: string, attemptId: string, answers: Record<string, string>) =>
    apiClient<{ data: AttemptResult }>(`${c(id)}/content/${contentId}/attempts/${attemptId}`, post({ answers })).then(unwrap),
  respond: (id: string, contentId: string, input: { text: string; rating: number | null }) => apiClient(`${c(id)}/content/${contentId}/response`, post(input)),
  feedback: (id: string, input: { rating: number; comment: string }) => apiClient<{ data: CourseCompletion }>(`${c(id)}/feedback`, post(input)).then(unwrap),
  recommended: () => apiClient<{ data: LearnerCourseCard[] }>("/api/learning/recommendations").then(unwrap),

  profile: () => apiClient<{ data: LearningProfile }>("/api/learning/profile").then(unwrap),
  saveSetup: (input: { categoryIds: string[]; target: number }) => apiClient<{ data: LearningProfile }>("/api/learning/profile", { method: "PUT", body: JSON.stringify(input) }).then(unwrap),
  updateInterests: (categoryIds: string[]) => apiClient<{ data: LearningProfile }>("/api/learning/profile/interests", { method: "PUT", body: JSON.stringify({ categoryIds }) }).then(unwrap),
  updateTarget: (target: number) => apiClient<{ data: LearningProfile }>("/api/learning/profile/target", { method: "PUT", body: JSON.stringify({ target }) }).then(unwrap),
  credits: (filter: { year?: number | null; type?: string | null }) =>
    apiClient<{ data: CreditsOverview }>("/api/learning/credits", { params: { year: filter.year || undefined, type: filter.type || undefined } }).then(unwrap),
  creditsExportUrl: (format: "csv" | "pdf", filter: { year?: number | null; type?: string | null }) => {
    const q = new URLSearchParams({ format });
    if (filter.year) q.set("year", String(filter.year));
    if (filter.type) q.set("type", filter.type);
    return `/api/learning/credits/export?${q}`;
  },
  certificates: () => apiClient<{ data: CertificateDto[] }>("/api/learning/certificates").then(unwrap),
  certificateDownload: (id: string) => apiClient<{ data: { url: string; fileName: string } }>(`/api/learning/certificates/${id}/download`).then(unwrap),
};
