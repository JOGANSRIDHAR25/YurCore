"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

const CONSENT_ITEMS = [
  { id: "c1", label: "Share records with treating practitioners", desc: "Allow doctors in active consultations to access your PHR", enabled: true },
  { id: "c2", label: "ABDM Health Locker sync", desc: "Auto-sync records to your chosen Health Locker", enabled: true },
  { id: "c3", label: "Emergency access", desc: "Allow emergency providers to view basic vitals and allergies", enabled: false },
  { id: "c4", label: "Research contribution (anonymised)", desc: "Contribute de-identified data for AYUSH research", enabled: false },
];

export default function AbhaPage() {
  const { user, updateUser } = useAuth();
  const [abhaInput, setAbhaInput] = useState("");
  const [linking, setLinking] = useState(false);
  const [linked, setLinked] = useState(user?.abhaLinked ?? false);
  const [consents, setConsents] = useState(CONSENT_ITEMS);

  const abhaId = linked ? `${user?.phone?.slice(-4) ?? "0000"}@abha` : null;

  function handleLink() {
    if (!abhaInput.trim()) return;
    setLinking(true);
    setTimeout(() => {
      setLinking(false);
      setLinked(true);
      updateUser({ abhaLinked: true });
    }, 1800);
  }

  function toggleConsent(id: string) {
    setConsents((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c))
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-5">
        <Link href="/profile" className="hover:text-foreground transition-colors">Profile</Link>
        <span>/</span>
        <span className="text-foreground font-medium">ABHA & ABDM</span>
      </div>

      <h1 className="font-display text-xl font-semibold text-foreground mb-1">ABHA & ABDM</h1>
      <p className="text-sm text-muted-foreground mb-6">Your Ayushman Bharat Health Account — the foundation of India&apos;s digital health ecosystem.</p>

      {/* ABHA status */}
      <div className={cn("rounded-2xl border p-5 mb-5", linked ? "bg-herb-green/5 border-herb-green/20" : "bg-white border-border")}>
        <div className="flex items-start gap-4">
          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0", linked ? "bg-herb-green/10" : "bg-muted")}>
            <span className="text-2xl">{linked ? "🛡️" : "🔗"}</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-foreground text-sm">ABHA Health ID</h2>
              {linked && <span className="text-[10px] bg-herb-green text-white px-2 py-0.5 rounded-full font-medium">Linked ✓</span>}
            </div>
            {linked ? (
              <>
                <p className="text-xs text-muted-foreground mt-1">{abhaId}</p>
                <p className="text-xs text-herb-green mt-1 font-medium">Your records are synced with the ABDM ecosystem</p>
                <button
                  onClick={() => { setLinked(false); updateUser({ abhaLinked: false }); }}
                  className="mt-3 text-xs text-red-500 hover:underline"
                >
                  Unlink ABHA
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  Link your ABHA ID to access health records across hospitals, labs, and clinics.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={abhaInput}
                    onChange={(e) => setAbhaInput(e.target.value)}
                    placeholder="Enter ABHA ID (e.g. name@abdm)"
                    className="flex-1 text-sm border border-border rounded-xl px-3 py-2 focus:outline-none focus:border-herb-green/50 focus:ring-2 focus:ring-herb-green/10 transition-all placeholder:text-muted-foreground"
                  />
                  <button
                    onClick={handleLink}
                    disabled={linking || !abhaInput.trim()}
                    className={cn(
                      "px-4 py-2 text-sm font-semibold rounded-xl transition-all",
                      linking || !abhaInput.trim()
                        ? "bg-muted text-muted-foreground cursor-not-allowed"
                        : "bg-herb-green text-white hover:bg-herb-green/90 active:scale-95"
                    )}
                  >
                    {linking ? "Linking…" : "Link"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ABDM consent */}
      <div className="bg-white rounded-2xl border border-border p-5 mb-5">
        <h2 className="font-semibold text-foreground text-sm mb-1">ABDM Consent Settings</h2>
        <p className="text-xs text-muted-foreground mb-4">Control how your health data is shared within the ABDM ecosystem.</p>
        <div className="space-y-3">
          {consents.map((item) => (
            <div key={item.id} className="flex items-start gap-3">
              <button
                onClick={() => toggleConsent(item.id)}
                className={cn(
                  "mt-0.5 w-9 h-5 rounded-full flex-shrink-0 transition-colors relative",
                  item.enabled ? "bg-herb-green" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                    item.enabled ? "translate-x-4" : "translate-x-0.5"
                  )}
                />
              </button>
              <div>
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info */}
      <div className="bg-ivory-deep rounded-2xl border border-border p-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">About ABDM:</span> The Ayushman Bharat Digital Mission (ABDM) is India&apos;s national digital health infrastructure. Your ABHA ID is a unique health identifier recognised across 500,000+ healthcare facilities.
        </p>
      </div>
    </div>
  );
}
