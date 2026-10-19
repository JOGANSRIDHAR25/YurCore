import type { ContentType, FileContentType, UploadKind } from "./types";

/**
 * File rules for each upload kind. There is deliberately no count limit and no size limit here:
 * the only ceiling is the Supabase project's own upload limit.
 */
export const UPLOAD_RULES: Record<UploadKind, { folder: string; mime: string[]; accept: string; label: string }> = {
  thumbnail: { folder: "thumbnail", mime: ["image/png", "image/jpeg", "image/webp"], accept: "image/png,image/jpeg,image/webp", label: "PNG, JPG or WebP" },
  image: { folder: "images", mime: ["image/png", "image/jpeg", "image/webp", "image/gif"], accept: "image/png,image/jpeg,image/webp,image/gif", label: "PNG, JPG, WebP or GIF" },
  video: { folder: "videos", mime: ["video/mp4", "video/webm", "video/quicktime", "video/ogg"], accept: "video/mp4,video/webm,video/quicktime,video/ogg", label: "MP4, WebM, MOV or OGG" },
  document: {
    folder: "documents",
    mime: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
    accept: ".pdf,.doc,.docx,.ppt,.pptx",
    label: "PDF, Word or PowerPoint",
  },
  file: { folder: "files", mime: [], accept: "", label: "Documents, spreadsheets, archives, audio" },
  attachment: { folder: "files", mime: [], accept: "", label: "Documents, spreadsheets, archives, audio" },
};

/** Everything the bucket accepts (kept in sync with the migration's allowed_mime_types). */
export const ALL_MIME = [
  ...UPLOAD_RULES.image.mime,
  ...UPLOAD_RULES.video.mime,
  ...UPLOAD_RULES.document.mime,
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "application/zip",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
];

/** Browsers sometimes report an empty type (e.g. .docx on some systems): infer it from the extension. */
const BY_EXT: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime", ogv: "video/ogg",
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain", csv: "text/csv", zip: "application/zip", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav",
};
export function resolveMime(fileName: string, reported: string): string {
  if (reported && ALL_MIME.includes(reported)) return reported;
  return BY_EXT[fileName.split(".").pop()?.toLowerCase() ?? ""] ?? reported;
}

export function allowedFor(kind: UploadKind, mime: string): boolean {
  const rule = UPLOAD_RULES[kind];
  return rule.mime.length ? rule.mime.includes(mime) : ALL_MIME.includes(mime);
}

export const FILE_TYPES: FileContentType[] = ["image", "video", "document", "file"];
export const isFileType = (t: ContentType): t is FileContentType => (FILE_TYPES as string[]).includes(t);
export const isQuizType = (t: ContentType) => t === "quiz" || t === "question";

export const CONTENT_LABEL: Record<ContentType, string> = {
  image: "Image",
  video: "Video",
  document: "PDF / Document",
  file: "File",
  lesson: "Text / Lesson",
  quiz: "Quiz",
  question: "Question",
  assignment: "Assignment",
  feedback: "Feedback",
};

export const LEVEL_LABEL = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" } as const;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function formatDuration(minutes: number | null | undefined): string | null {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h && `${h} h`, m && `${m} min`].filter(Boolean).join(" ");
}
