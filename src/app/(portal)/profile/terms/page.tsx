"use client";

import { SITE_NAME, siteConfig } from "@/shared/config/site";
import Link from "next/link";

const SECTIONS = [
  {
    title: "Terms of Service",
    updated: "1 January 2026",
    items: [
      `${SITE_NAME} is a technology platform that facilitates connections between patients and AYUSH practitioners. It is not a medical institution.`,
      `All practitioners on ${SITE_NAME} are independently licensed and registered with relevant AYUSH regulatory bodies.`,
      `Consultations on ${SITE_NAME} are supplementary wellness guidance and do not replace emergency medical care.`,
      "You must be 18 years or older to create an account. Family profiles for minors must be managed by a registered adult.",
      "Bookings are subject to practitioner availability. Cancellations made 2+ hours before the slot are eligible for a full refund.",
      `${SITE_NAME} reserves the right to suspend accounts found to be misusing the platform or violating these terms.`,
    ],
  },
  {
    title: "Privacy Policy",
    updated: "1 January 2026",
    items: [
      "We collect only the data necessary to provide our services: your phone number, health profile, and consultation records.",
      "Your personal health records (PHR) are stored encrypted and are never sold to third parties.",
      "Data shared with practitioners is governed by ABDM consent artefacts that you control explicitly.",
      "We use anonymised, aggregated data to improve our AI wellness features. Individual records are never used without consent.",
      "You can request a full export or deletion of your data at any time from Profile → Privacy & Consent.",
      "We comply with the Digital Personal Data Protection Act 2023 (DPDPA) and the ABDM Health Data Management Policy.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-5">
        <Link href="/profile" className="hover:text-foreground transition-colors">Profile</Link>
        <span>/</span>
        <span className="text-foreground font-medium">Terms & Privacy Policy</span>
      </div>

      <h1 className="font-display text-xl font-semibold text-foreground mb-1">Terms & Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-6">{SITE_NAME} · ABDM Compliant · Privacy First</p>

      <div className="space-y-5">
        {SECTIONS.map((section) => (
          <div key={section.title} className="bg-white rounded-2xl border border-border p-5">
            <div className="flex items-baseline justify-between gap-4 mb-4">
              <h2 className="font-semibold text-foreground">{section.title}</h2>
              <span className="text-[10px] text-muted-foreground flex-shrink-0">Updated {section.updated}</span>
            </div>
            <ol className="space-y-3">
              {section.items.map((item, i) => (
                <li key={i} className="flex gap-3">
                  <span className="text-xs font-bold text-muted-foreground flex-shrink-0 w-4">{i + 1}.</span>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item}</p>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <div className="bg-ivory-deep rounded-2xl border border-border p-4 mt-5">
        <p className="text-xs text-muted-foreground leading-relaxed">
          By using {SITE_NAME} you agree to these terms. For questions contact{" "}
          <span className="font-medium text-foreground">{siteConfig.legalEmail}</span>.
          For data requests, use the export or deletion option in{" "}
          <Link href="/profile/privacy" className="text-herb-green hover:underline">Privacy & Consent</Link>.
        </p>
      </div>
    </div>
  );
}
