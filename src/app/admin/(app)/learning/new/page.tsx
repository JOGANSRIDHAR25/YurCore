"use client";

import { SITE_NAME } from "@/shared/config/site";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CourseDetailsForm } from "../_components/CourseDetailsForm";
import { Stepper } from "../_components/ui";

export default function NewCoursePage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <Link href="/admin/learning" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> {SITE_NAME} Learning</Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-foreground">Create a course</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Start with the course details. Next you will add sections, videos, documents and quizzes.</p>
        <div className="mt-4"><Stepper step={1} /></div>
      </div>
      <CourseDetailsForm onCancel={() => router.push("/admin/learning")} onSaved={(c) => router.push(`/admin/learning/${c.id}`)} />
    </div>
  );
}
