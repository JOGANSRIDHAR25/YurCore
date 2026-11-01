"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { Award, Loader2, RotateCw } from "lucide-react";
import { useQuery } from "@/hooks/useQuery";
import { LearningHeader } from "../_components/LearningTabs";
import { CertificateCard, downloadCertificate } from "../_components/CertificateCard";
import { btnPrimary, btnSecondary } from "../_components/profile-ui";
import { learningApi } from "../_lib/api";

/**
 * Certificates: every certificate the learner was issued, re-downloadable at any time.
 * ?download=<id> (from the completion email) downloads that certificate; ?highlight=<id> scrolls to it.
 */
export default function CertificatesPage() {
  const { data, loading, error, refetch } = useQuery(() => learningApi.certificates(), []);
  const [params, setParams] = useState<{ download: string | null; highlight: string | null }>({ download: null, highlight: null });
  const handled = useRef(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setParams({ download: sp.get("download"), highlight: sp.get("highlight") ?? sp.get("download") });
  }, []);

  useEffect(() => {
    if (!data || handled.current) return;
    handled.current = true;
    if (params.highlight) document.getElementById(`cert-${params.highlight}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (params.download && data.some((c) => c.id === params.download && c.status === "valid")) {
      downloadCertificate(params.download).catch((err) => toast.error(err instanceof Error ? err.message : "Could not download the certificate"));
    }
  }, [data, params]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <LearningHeader title="Certificates" subtitle="Download your course certificates or share their verification links." />
      {loading && !data ? (
        <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-copper" aria-label="Loading" /></div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-10 text-center" role="alert">
          <p className="text-sm text-amber-800">{error}</p>
          <button type="button" onClick={refetch} className={btnSecondary}><RotateCw size={14} /> Try again</button>
        </div>
      ) : !data?.length ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-200 px-4 py-16 text-center">
          <Award size={28} className="text-slate-300" aria-hidden />
          <p className="text-sm font-medium text-neutral-800">No certificates yet</p>
          <p className="max-w-sm text-sm text-slate-500">Complete a course (and its feedback, when asked) to receive your certificate.</p>
          <Link href="/pro/learning" className={btnPrimary}>Browse courses</Link>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((c) => <li key={c.id} id={`cert-${c.id}`}><CertificateCard cert={c} highlighted={params.highlight === c.id} /></li>)}
        </ul>
      )}
    </div>
  );
}

