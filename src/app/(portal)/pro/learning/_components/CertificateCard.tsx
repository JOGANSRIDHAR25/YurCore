"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import { Award, Ban, Copy, Download, ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CREDIT_TYPE_LABEL, formatCredits } from "@/shared/learning/credits";
import type { CertificateDto } from "@/shared/learning/types";
import { btnPrimary, btnSecondary } from "./profile-ui";
import { learningApi } from "../_lib/api";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** Downloads the learner's stored certificate PDF through a short-lived signed URL. */
export async function downloadCertificate(id: string) {
  const { url } = await learningApi.certificateDownload(id);
  window.location.assign(url);
}

export async function copyVerifyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Verification link copied");
  } catch {
    toast.error("Could not copy the link");
  }
}

export function CertificateCard({ cert, highlighted }: { cert: CertificateDto; highlighted?: boolean }) {
  const [busy, setBusy] = useState(false);
  const revoked = cert.status === "revoked";
  async function download() {
    setBusy(true);
    try {
      await downloadCertificate(cert.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not download the certificate");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className={cn("flex h-full flex-col rounded-2xl border bg-white p-5 shadow-xs transition-shadow", revoked ? "border-neutral-200 opacity-70" : "border-neutral-200/80 hover:shadow-md", highlighted && "ring-2 ring-copper/40")}>
      <div className="flex items-start justify-between gap-3">
        <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", revoked ? "bg-neutral-100 text-neutral-400" : "bg-copper/10 text-copper")}>{revoked ? <Ban size={19} /> : <Award size={19} />}</span>
        <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", revoked ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>{revoked ? "Revoked" : "Valid"}</span>
      </div>
      <h3 className="mt-3 line-clamp-2 text-base font-semibold leading-snug text-neutral-900">{cert.courseTitle}</h3>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div><dt className="text-xs text-slate-500">Completed</dt><dd className="font-medium text-neutral-800">{fmt(cert.completedAt)}</dd></div>
        <div><dt className="text-xs text-slate-500">Credits</dt><dd className="font-medium text-neutral-800">{cert.credits > 0 ? `${formatCredits(cert.credits)} ${CREDIT_TYPE_LABEL[cert.creditType]}` : "—"}</dd></div>
        <div className="col-span-2"><dt className="text-xs text-slate-500">Certificate number</dt><dd className="font-mono text-sm text-neutral-800">{cert.number}{cert.version > 1 ? ` · v${cert.version}` : ""}</dd></div>
      </dl>
      {revoked && cert.revokeReason && <p className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-slate-600">Revoked: {cert.revokeReason}</p>}
      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        {!revoked && <button type="button" onClick={download} disabled={busy} className={cn(btnPrimary, "px-4 py-2")}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download PDF</button>}
        <button type="button" onClick={() => copyVerifyLink(cert.verifyUrl)} className={cn(btnSecondary, "px-3 py-2")}><Copy size={14} /> Copy verify link</button>
        <a href={cert.verifyUrl} target="_blank" rel="noreferrer" className={cn(btnSecondary, "px-3 py-2")} aria-label="Open verification page"><ExternalLink size={14} /></a>
      </div>
    </article>
  );
}
