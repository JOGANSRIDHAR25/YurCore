import { createClient } from "@/lib/supabase/client";

export const CHAT_ATTACHMENT_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";
export const CHAT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

export type UploadedChatAttachment = { path: string; name: string; type: string; size: number };

export function validateChatAttachment(file: File): string | null {
  if (!CHAT_ATTACHMENT_ACCEPT.split(",").includes(file.type)) {
    return "Only PNG, JPEG, WebP images and PDF documents are allowed.";
  }
  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) {
    return "File is too large — the limit is 5 MB.";
  }
  return null;
}

export async function uploadChatAttachment(consultationId: string, file: File): Promise<UploadedChatAttachment> {
  const response = await fetch("/api/message/attachment", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ consultationId, fileName: file.name, fileType: file.type, fileSize: file.size }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Unable to prepare upload");
  }

  const { path, token } = result.data as { path: string; token: string };
  const supabase = createClient();
  const { error } = await supabase.storage.from("chat-attachments").uploadToSignedUrl(path, token, file, {
    contentType: file.type,
  });
  if (error) throw new Error(error.message || "Upload failed");

  return { path, name: file.name, type: file.type, size: file.size };
}

export async function uploadCommunityAttachment(file: File): Promise<UploadedChatAttachment> {
  const response = await fetch("/api/community", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "attachmentUpload",
      payload: { fileName: file.name, fileType: file.type, fileSize: file.size },
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Unable to prepare upload");
  }

  const { path, token } = result.data as { path: string; token: string };
  const supabase = createClient();
  const { error } = await supabase.storage.from("community-attachments").uploadToSignedUrl(path, token, file, {
    contentType: file.type,
  });
  if (error) throw new Error(error.message || "Upload failed");

  return { path, name: file.name, type: file.type, size: file.size };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
