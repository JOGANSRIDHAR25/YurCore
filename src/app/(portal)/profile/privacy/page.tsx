"use client";

import { SITE_NAME } from "@/shared/config/site";
import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type ConsentEntry = {
  id: string;
  provider: string;
  type: string;
  granted: string;
  expires: string;
  active: boolean;
};

const ACTIVE_CONSENTS: ConsentEntry[] = [
  { id: "p1", provider: `Dr. Aditi Shastri · ${SITE_NAME}`, type: "View & prescribe PHR", granted: "15 May 2026", expires: "15 Aug 2026", active: true },
  { id: "p2", provider: "Apollo Hospitals · Mumbai", type: "Lab results access", granted: "2 Apr 2026", expires: "2 Jul 2026", active: true },
  { id: "p3", provider: `${SITE_NAME} AyurSanvaad AI`, type: "Anonymised chat context", granted: "1 Jan 2026", expires: "31 Dec 2026", active: false },
];

type PrivacyToggle = {
  id: string;
  label: string;
  desc: string;
  value: boolean;
};

const INITIAL_TOGGLES: PrivacyToggle[] = [
  { id: "t1", label: "Allow AI-assisted diagnosis suggestions", desc: "AyurSanvaad may reference your PHR to personalise responses", value: true },
  { id: "t2", label: "Show profile to practitioners", desc: "Practitioners can see your name and Prakriti before a session", value: true },
  { id: "t3", label: "Data retention beyond 3 years", desc: "Keep records older than 3 years in your health locker", value: false },
  { id: "t4", label: "Marketing communications", desc: "Receive wellness offers and health campaigns", value: false },
];

export default function PrivacyPage() {
  const [consents, setConsents] = useState(ACTIVE_CONSENTS);
  const [toggles, setToggles] = useState(INITIAL_TOGGLES);
  const [revoking, setRevoking] = useState<string | null>(null);

  function handleRevoke(id: string) {
    setRevoking(id);
    setTimeout(() => {
      setConsents((prev) => prev.map((c) => (c.id === id ? { ...c, active: false } : c)));
      setRevoking(null);
    }, 800);
  }

  function toggleSetting(id: string) {
    setToggles((prev) => prev.map((t) => (t.id === id ? { ...t, value: !t.value } : t)));
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-5">
        <Link href="/profile" className="hover:text-foreground transition-colors">Profile</Link>
        <span>/</span>
        <span className="text-foreground font-medium">Privacy & Consent</span>
      </div>

      <h1 className="font-display text-xl font-semibold text-foreground mb-1">Privacy & Consent</h1>
      <p className="text-sm text-muted-foreground mb-6">You are in full control of your health data. All consent is explicit and revocable.</p>

      {/* Active consents */}
      <div className="bg-white rounded-2xl border border-border p-5 mb-5">
        <h2 className="font-semibold text-foreground text-sm mb-4">Active Data Consents</h2>
        <div className="space-y-3">
          {consents.map((c) => (
            <div key={c.id} className={cn("flex items-start gap-3 p-3 rounded-xl border transition-all", c.active ? "border-border" : "border-dashed border-border bg-muted/30")}>
              <div className={cn("w-2 h-2 rounded-full mt-1.5 flex-shrink-0", c.active ? "bg-herb-green" : "bg-muted-foreground/40")} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{c.provider}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{c.type}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Granted {c.granted} · Expires {c.expires}
                </p>
              </div>
              {c.active ? (
                <button
                  onClick={() => handleRevoke(c.id)}
                  disabled={revoking === c.id}
                  className="text-xs text-red-500 font-medium hover:underline flex-shrink-0 disabled:opacity-50"
                >
                  {revoking === c.id ? "Revoking…" : "Revoke"}
                </button>
              ) : (
                <span className="text-xs text-muted-foreground flex-shrink-0">Revoked</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Privacy settings */}
      <div className="bg-white rounded-2xl border border-border p-5 mb-5">
        <h2 className="font-semibold text-foreground text-sm mb-4">Privacy Settings</h2>
        <div className="space-y-4">
          {toggles.map((t) => (
            <div key={t.id} className="flex items-start gap-3">
              <button
                onClick={() => toggleSetting(t.id)}
                className={cn(
                  "mt-0.5 w-9 h-5 rounded-full flex-shrink-0 transition-colors relative",
                  t.value ? "bg-herb-green" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                    t.value ? "translate-x-4" : "translate-x-0.5"
                  )}
                />
              </button>
              <div>
                <p className="text-sm font-medium text-foreground">{t.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Data export */}
      <div className="bg-white rounded-2xl border border-border p-5 mb-5">
        <h2 className="font-semibold text-foreground text-sm mb-1">Your Data</h2>
        <p className="text-xs text-muted-foreground mb-4">You can request a full export of your health records or delete your account.</p>
        <div className="flex gap-3 flex-wrap">
          <button className="px-4 py-2 border border-border rounded-xl text-xs font-medium text-foreground hover:bg-muted transition-colors">
            Request Data Export
          </button>
          <button className="px-4 py-2 border border-red-200 rounded-xl text-xs font-medium text-red-600 hover:bg-red-50 transition-colors">
            Delete Account
          </button>
        </div>
      </div>

      <div className="bg-ivory-deep rounded-2xl border border-border p-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          {SITE_NAME} complies with the Digital Personal Data Protection Act 2023 (DPDPA) and the ABDM Health Data Management Policy. Your consent logs are auditable.
        </p>
      </div>
    </div>
  );
}
