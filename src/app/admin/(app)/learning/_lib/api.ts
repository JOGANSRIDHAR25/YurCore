import { SITE_NAME } from "@/shared/config/site";
import { apiClient as rawClient } from "@/shared/api/api-client";
import type { AdminCertificateRow, AdminCourse, AdminCourseDetails, AdminLearningSettings, ContentSettings, ContentType, CourseFeedbackRow, DeliveryRow, LearnerRow, LearningCategory, Quiz, ResponseRow, UploadKind } from "@/shared/learning/types";

export type { AdminCourse, AdminCourseDetails, ContentItem, Section, Quiz, QuizQuestion } from "@/shared/learning/types";

/** Validation replies (e.g. "add content before publishing") are shown to the user as messages, so they are not logged as console errors. */
const apiClient: typeof rawClient = (url, options) => rawClient(url, { silent: true, ...options });

export type CourseInput = {
  title: string;
  shortDescription: string;
  description: string;
  category: string | null;
  level: AdminCourse["level"];
  instructorId?: string | null;
  durationMinutes: number | null;
  learningObjectives: string[];
  thumbnailPath?: string | null;
  categoryIds?: string[];
  credits?: number;
  creditType?: "cme" | "participation";
  feedbackEnabled?: boolean;
  feedbackTitle?: string | null;
  feedbackAllowComment?: boolean;
};

export type AdminCategory = LearningCategory & { courses: number };
export type LearnerProgressRow = { userId: string; name: string; email: string | null; target: number; completed: number; remaining: number; percent: number; status: "target_met" | "on_track" | "behind" };

export type ContentInput = {
  sectionId: string;
  type: ContentType;
  title: string;
  description: string;
  body?: string | null;
  settings?: ContentSettings;
  file?: { path: string; name: string } | null;
  quiz?: Quiz;
};

const base = "/api/admin/learning";
const c = (id: string) => `${base}/courses/${id}`;
const unwrap = <T,>(r: { data: T }) => r.data;
const json = (method: string, body?: unknown) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export const adminLearningApi = {
  list: () => apiClient<{ data: AdminCourse[] }>(`${base}/courses`).then(unwrap),
  categories: () => apiClient<{ data: AdminCategory[] }>(`${base}/categories`).then(unwrap),
  createCategory: (name: string) => apiClient<{ data: LearningCategory }>(`${base}/categories`, json("POST", { name })).then(unwrap),
  updateCategory: (id: string, patch: { name?: string; active?: boolean }) => apiClient<{ data: LearningCategory }>(`${base}/categories/${id}`, json("PATCH", patch)).then(unwrap),
  settings: () => apiClient<{ data: AdminLearningSettings }>(`${base}/settings`).then(unwrap),
  updateSettings: (patch: Partial<Omit<AdminLearningSettings, "signatureUrl">>) => apiClient<{ data: AdminLearningSettings }>(`${base}/settings`, json("PATCH", patch)).then(unwrap),
  setSignature: (dataUrl: string | null) => apiClient<{ data: AdminLearningSettings }>(`${base}/settings/signature`, json("PUT", { dataUrl })).then(unwrap),
  certificates: (q?: string) => apiClient<{ data: AdminCertificateRow[] }>(`${base}/certificates`, { params: { q: q || undefined } }).then(unwrap),
  revokeCertificate: (id: string, reason: string) => apiClient<{ data: AdminCertificateRow }>(`${base}/certificates/${id}/revoke`, json("POST", { reason })).then(unwrap),
  reissueCertificate: (id: string, input: { reason: string; learnerName?: string }) => apiClient<{ data: AdminCertificateRow }>(`${base}/certificates/${id}/reissue`, json("POST", input)).then(unwrap),
  certificateDownload: (id: string) => apiClient<{ data: { url: string } }>(`${base}/certificates/${id}/download`).then(unwrap),
  learnerProgress: () => apiClient<{ data: { year: number; unit: string; rows: LearnerProgressRow[] } }>(`${base}/credits`).then(unwrap),
  adjustCredits: (input: { userId: string; credits: number; reason: string; date?: string }) => apiClient(`${base}/credits`, json("POST", input)),
  deliveries: (status?: string) => apiClient<{ data: DeliveryRow[] }>(`${base}/deliveries`, { params: { status: status || undefined } }).then(unwrap),
  retryDelivery: (id: string) => apiClient(`${base}/deliveries/${id}/retry`, json("POST")),
  runReminders: () => apiClient<{ data: { checked: number; sent: number; skipped: number } }>(`${base}/reminders`, json("POST")).then(unwrap),
  courseFeedback: (id: string) => apiClient<{ data: { title: string; enabled: boolean; average: number | null; count: number; rows: CourseFeedbackRow[] } }>(`${c(id)}/feedback`).then(unwrap),
  searchPractitioners: (q: string) => apiClient<{ data: { id: string; name: string }[] }>(`${base}/practitioners`, { params: { q } }).then(unwrap),
  details: (id: string) => apiClient<{ data: AdminCourseDetails }>(c(id)).then(unwrap),
  create: (input: CourseInput) => apiClient<{ data: AdminCourse }>(`${base}/courses`, json("POST", input)).then(unwrap),
  update: (id: string, input: Partial<CourseInput>) => apiClient<{ data: AdminCourse }>(c(id), json("PATCH", input)).then(unwrap),
  publish: (id: string, published: boolean) => apiClient<{ data: AdminCourse }>(`${c(id)}/publish`, json("POST", { published })).then(unwrap),
  remove: (id: string) => apiClient(c(id), json("DELETE")),
  sync: (id: string) => apiClient<{ data: AdminCourse }>(`${c(id)}/sync`, json("POST")).then(unwrap),
  syncAll: () => apiClient<{ data: { imported: number; synced: number; failed: number } }>(`${base}/sync`, json("POST")).then(unwrap),

  addSection: (id: string, title: string, description = "") => apiClient<{ data: { id: string } }>(`${c(id)}/sections`, json("POST", { title, description })).then(unwrap),
  updateSection: (id: string, sectionId: string, patch: { title?: string; description?: string }) => apiClient(`${c(id)}/sections/${sectionId}`, json("PATCH", patch)),
  deleteSection: (id: string, sectionId: string) => apiClient(`${c(id)}/sections/${sectionId}`, json("DELETE")),
  saveLayout: (id: string, sections: { id: string; items: string[] }[]) => apiClient(`${c(id)}/layout`, json("POST", { sections })),

  addContent: (id: string, input: ContentInput) => apiClient<{ data: { id: string } }>(`${c(id)}/content`, json("POST", input)).then(unwrap),
  updateContent: (id: string, contentId: string, input: Partial<Omit<ContentInput, "sectionId" | "type">>) => apiClient<{ data: { id: string } }>(`${c(id)}/content/${contentId}`, json("PATCH", input)).then(unwrap),
  deleteContent: (id: string, contentId: string) => apiClient(`${c(id)}/content/${contentId}`, json("DELETE")),
  responses: (id: string, contentId: string) => apiClient<{ data: ResponseRow[] }>(`${c(id)}/content/${contentId}/responses`).then(unwrap),
  learners: (id: string) => apiClient<{ data: LearnerRow[] }>(`${c(id)}/learners`).then(unwrap),

  discardUpload: (id: string, path: string) => apiClient(`${c(id)}/uploads`, { method: "DELETE", params: { path } }).catch(() => undefined),
};

export type UploadedFile = { path: string; name: string; size: number; mimeType: string; url: string | null };
export type UploadHandle = { promise: Promise<UploadedFile>; cancel: () => void };

/**
 * Uploads straight from the browser to Supabase Storage with a server-issued signed URL, so large
 * videos never pass through the app server. Progress is reported as the bytes are sent.
 */
export function uploadFile(courseId: string, kind: UploadKind, file: File, onProgress: (sent: number, total: number) => void): UploadHandle {
  let xhr: XMLHttpRequest | null = null;
  let cancelled = false;
  const promise = (async () => {
    const target = await apiClient<{ data: { path: string; signedUrl: string; mimeType: string } }>(`${c(courseId)}/uploads`, json("POST", { kind, fileName: file.name, mimeType: file.type, size: file.size })).then(unwrap);
    if (cancelled) throw new Error("Upload cancelled");
    // Re-type the file when the browser did not know it (e.g. .docx), so storage records the right type.
    const typed = file.type === target.mimeType ? file : new File([file], file.name, { type: target.mimeType });
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", typed);
    await new Promise<void>((resolve, reject) => {
      xhr = new XMLHttpRequest();
      xhr.open("PUT", target.signedUrl);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded, e.total);
      xhr.onload = () => {
        if (xhr!.status >= 200 && xhr!.status < 300) return resolve();
        let msg = "Upload failed";
        try {
          const body = JSON.parse(xhr!.responseText) as { message?: string; error?: string };
          msg = body.message || body.error || msg;
        } catch { /* keep default */ }
        if (/maximum allowed size|too large|413/i.test(msg) || xhr!.status === 413) msg = `This file is larger than the storage upload limit of the ${SITE_NAME} Supabase project.`;
        reject(new Error(msg));
      };
      xhr.onerror = () => reject(new Error("Network error while uploading. Check your connection and try again."));
      xhr.onabort = () => reject(new Error("Upload cancelled"));
      xhr.send(form);
    });
    return { path: target.path, name: file.name, size: file.size, mimeType: target.mimeType, url: URL.createObjectURL(file) };
  })();
  return {
    promise,
    cancel: () => {
      cancelled = true;
      (xhr as XMLHttpRequest | null)?.abort();
    },
  };
}
