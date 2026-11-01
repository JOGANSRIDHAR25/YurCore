import type { Metadata } from "next";
import { SITE_NAME, SITE_NAME_PARTS } from "@/shared/config/site";
import { BadgeCheck, Ban, SearchX } from "lucide-react";
import { CREDIT_TYPE_LABEL, formatCredits } from "@/shared/learning/credits";
import { LearningProfileRepository } from "@/backend/repo/learning-profile.repo";

/**
 * Public certificate verification (the QR code target). No login. Shows only what the spec allows: status,
 * learner name, course, credits, completion date and number. Read straight from the certificate record.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Verify certificate · ${SITE_NAME} Learning`, robots: { index: false, follow: false } };

const NUMBER = /^AYL-\d{4}-\d{6}$/;
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

export default async function VerifyCertificatePage({ params }: { params: Promise<{ number: string }> }) {
  const number = decodeURIComponent((await params).number).trim().toUpperCase();
  const cert = NUMBER.test(number) ? await LearningProfileRepository.getCertificateByNumber(number).catch(() => null) : null;
  const valid = cert?.status === "valid";

  return (
    <main className="min-h-dvh bg-neutral-50 px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-xl">
        <p className="mb-6 text-center text-xl font-bold tracking-tight">
          <span className="text-herb-green">{SITE_NAME_PARTS[0]}</span><span className="text-copper">{SITE_NAME_PARTS[1]}</span>
          <span className="ml-2 align-middle text-xs font-semibold uppercase tracking-widest text-slate-400">Certificate verification</span>
        </p>

        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          {!cert ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <SearchX size={36} className="text-slate-300" aria-hidden />
              <h1 className="mt-3 text-lg font-semibold text-neutral-900">Certificate not found</h1>
              <p className="mt-1 max-w-sm text-sm text-slate-500">No {SITE_NAME} Learning certificate has the number <span className="font-mono">{number || "—"}</span>. Check the number and try again.</p>
            </div>
          ) : (
            <>
              <div className={valid ? "flex items-center gap-3 bg-emerald-50 px-6 py-5" : "flex items-center gap-3 bg-red-50 px-6 py-5"}>
                {valid ? <BadgeCheck size={30} className="text-emerald-600" aria-hidden /> : <Ban size={30} className="text-red-600" aria-hidden />}
                <div>
                  <p className={valid ? "text-lg font-semibold text-emerald-800" : "text-lg font-semibold text-red-800"}>{valid ? "Valid certificate" : "Revoked certificate"}</p>
                  <p className={valid ? "text-sm text-emerald-700" : "text-sm text-red-700"}>{valid ? `Issued by ${SITE_NAME} Learning.` : "This certificate has been revoked and is no longer valid."}</p>
                </div>
              </div>
              <dl className="divide-y divide-neutral-100 px-6">
                {[
                  ["Learner", cert.learner_name],
                  ["Course", cert.course_title],
                  ["Credits", Number(cert.credits_awarded) > 0 ? `${formatCredits(Number(cert.credits_awarded))} ${CREDIT_TYPE_LABEL[cert.credit_type]}` : "—"],
                  ["Completed on", fmt(cert.completed_at)],
                  ["Certificate number", cert.certificate_number],
                ].map(([label, value]) => (
                  <div key={label} className="flex flex-col gap-0.5 py-3.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                    <dt className="text-sm text-slate-500">{label}</dt>
                    <dd className={label === "Certificate number" ? "font-mono text-sm text-neutral-900" : "text-sm font-semibold text-neutral-900 sm:text-right"}>{value}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
        <p className="mt-6 text-center text-xs leading-5 text-slate-400">This page confirms a certificate issued through {SITE_NAME} Learning. Recognition of credits for registration renewal is decided by the relevant council.</p>
      </div>
    </main>
  );
}
