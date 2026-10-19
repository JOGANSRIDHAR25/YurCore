"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@/hooks/useQuery";
import { CourseDetailsForm } from "../../_components/CourseDetailsForm";
import { Spinner } from "../../_components/ui";
import { adminLearningApi } from "../../_lib/api";

export default function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, loading, error } = useQuery(() => adminLearningApi.details(id), [id]);
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <Link href={`/admin/learning/${id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> Back to course builder</Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-foreground">Course details</h1>
      </div>
      {loading ? <Spinner className="mx-auto" /> : error || !data ? <p className="text-sm text-amber-700">{error ?? "Course not found"}</p> : (
        // Nothing is saved until "Save details", so Cancel simply leaves: the stored course is untouched.
        <CourseDetailsForm course={data.course} onCancel={() => router.push("/admin/learning")} onSaved={() => router.push(`/admin/learning/${id}`)} />
      )}
    </div>
  );
}
