"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Status = "pending" | "approved" | "rejected" | "suspended";

interface AssistantGateProps {
  initialStatus: Status;
  initialDoctorName: string | null;
  initialRejectionReason: string | null;
}

const POLL_MS = 6000;

/**
 * Renders the "waiting for approval" / "declined" / "suspended" screen for
 * an assistant, and polls in the background so that once the linked doctor
 * approves them, they land on the practitioner dashboard without needing to
 * manually reload — the server layout (pro/layout.tsx) re-checks the real
 * assistant row on every router.refresh() and swaps in the dashboard itself
 * once status is "approved".
 */
export function AssistantGate({ initialStatus, initialDoctorName, initialRejectionReason }: AssistantGateProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [doctorName, setDoctorName] = useState(initialDoctorName);
  const [rejectionReason, setRejectionReason] = useState(initialRejectionReason);
  const pollingRef = useRef(true);

  useEffect(() => {
    if (status !== "pending") return;

    const timer = window.setInterval(async () => {
      if (!pollingRef.current) return;
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        const user = json?.data?.user;
        const nextStatus: Status | undefined = user?.assistantStatus;
        if (!nextStatus || nextStatus === status) return;

        setStatus(nextStatus);
        setDoctorName(user?.linkedDoctorName ?? doctorName);
        setRejectionReason(user?.assistantRejectionReason ?? null);

        if (nextStatus === "approved") {
          pollingRef.current = false;
          router.refresh();
        }
      } catch {
        // Transient network hiccup — just try again on the next tick.
      }
    }, POLL_MS);

    return () => window.clearInterval(timer);
  }, [status, doctorName, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-white p-8 text-center shadow-xs">
        {status === "rejected" ? (
          <>
            <h1 className="font-display text-xl font-bold text-foreground">Access request declined</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {doctorName ? `${doctorName} declined` : "The doctor declined"} your request to assist them.
            </p>
            {rejectionReason && (
              <p className="mt-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{rejectionReason}</p>
            )}
          </>
        ) : status === "suspended" ? (
          <>
            <h1 className="font-display text-xl font-bold text-foreground">Access suspended</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {doctorName ? `${doctorName} has` : "The doctor has"} suspended your access to this practitioner
              dashboard. Contact them if you believe this is a mistake.
            </p>
            {rejectionReason && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">{rejectionReason}</p>
            )}
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-herb-green border-t-transparent" />
            <h1 className="font-display text-xl font-bold text-foreground">Waiting for approval</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {doctorName ? `${doctorName} needs` : "The doctor needs"} to approve your access before you can use
              the practitioner dashboard. This page updates automatically once they do.
            </p>
          </>
        )}
      </div>
    </div>
  );
}