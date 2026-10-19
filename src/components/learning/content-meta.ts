import { SITE_NAME } from "@/shared/config/site";
import { BookOpen, ClipboardList, FileText, HelpCircle, Image as ImageIcon, ListChecks, MessageSquare, Paperclip, PlayCircle, type LucideIcon } from "lucide-react";
import type { ContentType } from "@/shared/learning/types";
import { CONTENT_LABEL } from "@/shared/learning/content";

export type ContentMeta = { type: ContentType; label: string; icon: LucideIcon; description: string; group: "learning" | "assessment"; tint: string };

const meta = (type: ContentType, icon: LucideIcon, description: string, group: ContentMeta["group"], tint: string): ContentMeta => ({ type, label: CONTENT_LABEL[type], icon, description, group, tint });

export const CONTENT_META: Record<ContentType, ContentMeta> = {
  video: meta("video", PlayCircle, "Upload a lecture, demonstration or recorded session.", "learning", "bg-sky-50 text-sky-700"),
  image: meta("image", ImageIcon, "Show a diagram, chart, infographic or photo with a caption.", "learning", "bg-violet-50 text-violet-700"),
  document: meta("document", FileText, "Share a PDF, Word or PowerPoint document to read.", "learning", "bg-rose-50 text-rose-700"),
  file: meta("file", Paperclip, "Attach any downloadable file: worksheets, spreadsheets, audio.", "learning", "bg-slate-100 text-slate-700"),
  lesson: meta("lesson", BookOpen, `Write a text lesson directly in ${SITE_NAME}.`, "learning", "bg-amber-50 text-amber-700"),
  quiz: meta("quiz", ListChecks, "Build a graded quiz with multiple-choice questions.", "assessment", "bg-herb-green/10 text-herb-green"),
  question: meta("question", HelpCircle, "Add a single knowledge-check question between lessons.", "assessment", "bg-teal-50 text-teal-700"),
  assignment: meta("assignment", ClipboardList, "Give a task with instructions; learners submit a written answer.", "assessment", "bg-orange-50 text-orange-700"),
  feedback: meta("feedback", MessageSquare, "Ask learners for feedback, with an optional 1–5 rating.", "assessment", "bg-indigo-50 text-indigo-700"),
};

export const LEARNING_TYPES: ContentType[] = ["video", "image", "document", "file", "lesson"];
export const ASSESSMENT_TYPES: ContentType[] = ["quiz", "question", "assignment", "feedback"];
