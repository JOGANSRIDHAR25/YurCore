"use client";

import { SITE_NAME } from "@/shared/config/site";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { CategoriesSection, CertificatesSection, CreditsSection, DeliveriesSection, SettingsForm } from "../_components/SettingsSections";

const TABS = [
  ["categories", "Categories"],
  ["targets", "Targets & credits"],
  ["progress", "Learner progress"],
  ["certificates", "Certificates"],
  ["issuer", "Certificate issuer"],
  ["emails", "Emails & reminders"],
] as const;
type Tab = (typeof TABS)[number][0];

/** Learning settings: categories, targets, certificates, credits and learning emails (admin only). */
export default function LearningSettingsPage() {
  return (
    <Suspense>
      <LearningSettings />
    </Suspense>
  );
}

function LearningSettings() {
  const router = useRouter();
  const param = useSearchParams().get("tab");
  const tab: Tab = TABS.some(([t]) => t === param) ? (param as Tab) : "categories";
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <Link href="/admin/learning" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> {SITE_NAME} Learning</Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-foreground">Learning settings</h1>
        <p className="text-sm text-muted-foreground">Categories, annual targets, certificates, credits and learning emails.</p>
      </div>
      <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1" aria-label="Learning settings">
        {TABS.map(([t, label]) => (
          <button key={t} type="button" onClick={() => router.replace(`/admin/learning/settings?tab=${t}`, { scroll: false })} className={cn("-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors", tab === t ? "border-herb-green text-herb-green" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {label}
          </button>
        ))}
      </nav>
      {tab === "categories" && <CategoriesSection />}
      {tab === "targets" && <SettingsForm part="targets" />}
      {tab === "progress" && <CreditsSection />}
      {tab === "certificates" && <CertificatesSection />}
      {tab === "issuer" && <SettingsForm part="issuer" />}
      {tab === "emails" && <DeliveriesWithSettings />}
    </div>
  );
}

function DeliveriesWithSettings() {
  return (
    <div className="space-y-6">
      <SettingsForm part="emails" />
      <DeliveriesSection />
    </div>
  );
}
