import { apiClient as rawClient } from "@/shared/api/api-client";
import type { AttemptResult, AttemptStart, LearnerCourse, LearnerCourseDetails } from "@/shared/learning/types";

export type { LearnerCourse, LearnerCourseDetails } from "@/shared/learning/types";

/** Validation replies (e.g. "no attempts left") are shown to the user as messages, so they are not logged as console errors. */
const apiClient: typeof rawClient = (url, options) => rawClient(url, { silent: true, ...options });

export type Scope = "all" | "mine" | "completed";

const unwrap = <T,>(r: { data: T }) => r.data;
const c = (id: string) => `/api/learning/courses/${id}`;
const post = (body?: unknown) => ({ method: "POST", body: JSON.stringify(body ?? {}) });

export const learningApi = {
  list: (scope: Scope, q = "", category?: string) => apiClient<{ data: LearnerCourse[] }>("/api/learning/courses", { params: { scope, q: q || undefined, category } }).then(unwrap),
  categories: () => apiClient<{ data: string[] }>("/api/learning/categories").then(unwrap),
  details: (id: string) => apiClient<{ data: LearnerCourseDetails }>(c(id)).then(unwrap),
  start: (id: string) => apiClient(`${c(id)}/start`, post()),
  complete: (id: string, contentId: string) => apiClient(`${c(id)}/content/${contentId}/complete`, post()),
  startAttempt: (id: string, contentId: string) => apiClient<{ data: AttemptStart }>(`${c(id)}/content/${contentId}/attempts`, post()).then(unwrap),
  submitAttempt: (id: string, contentId: string, attemptId: string, answers: Record<string, string>) =>
    apiClient<{ data: AttemptResult }>(`${c(id)}/content/${contentId}/attempts/${attemptId}`, post({ answers })).then(unwrap),
  respond: (id: string, contentId: string, input: { text: string; rating: number | null }) => apiClient(`${c(id)}/content/${contentId}/response`, post(input)),
};
