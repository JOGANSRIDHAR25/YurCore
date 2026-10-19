"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HPRBadge } from "@/components/Badges";
import { useNewDoctorProfile } from "@/hooks/use-new-doctor";
import { usePractitioner } from "@/hooks/use-discover";
import { useFamilyMembers } from "@/hooks/use-family";
import { apiClient } from "@/shared/api/api-client";
import { setNavContext } from "@/lib/nav-context-client";

type BookingDraft = {
  doctorId: string;
  slotId: string;
  slot: string;
  date: string;
  mode: "video" | "clinic";
  availableModes: ("video" | "clinic")[];
};

async function fetchBookingDraft(): Promise<BookingDraft | null> {
  try {
    const result = await apiClient<{ data: BookingDraft }>("/api/booking/draft");
    return result.data;
  } catch {
    return null;
  }
}

async function bookAppointment(params: {
  userId: string;
  slotId: string;
  practitionerId: string;
  mode: "video" | "clinic";
  reason: string;
  date: string;
  time: string;
  familyMemberId?: string;
}): Promise<void> {
  const response = await fetch("/api/booking", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Failed to book appointment");
  }
}

async function bookNewDoctorAppointment(params: {
  userId: string;
  doctorProfileId: string;
  mode: "video" | "clinic";
  reason: string;
  date: string;
  time: string;
  familyMemberId?: string;
}): Promise<void> {
  const response = await fetch("/api/booking/new-doctor", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Failed to book appointment");
  }
}
import { formatCurrency, cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { toast } from "react-hot-toast";
import { ENABLE_VIDEO_CONSULTATION } from "@/lib/feature-flags";

type Step = "configure" | "confirmed";

function BookingContent() {
  const router = useRouter();
  const { user } = useAuth();

  const [draft, setDraft] = useState<BookingDraft | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchBookingDraft().then((result) => {
      if (!cancelled) setDraft(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (draft === null) {
      toast.error("Your booking selection has expired. Please pick a slot again.");
      router.replace("/discover");
    }
  }, [draft, router]);

  const doctorId = draft?.doctorId ?? "";
  const slot = draft?.slot ?? "";
  const slotId = draft?.slotId ?? "";
  const date = draft?.date ?? new Date().toISOString().split("T")[0];
  const mode = draft?.mode ?? "video";
  const availableModes = draft?.availableModes?.length ? draft.availableModes : [mode];

  // Fetch legacy doctor
  const legacyDocQuery = usePractitioner(doctorId);
  // Fetch new doctor profile
  const newDocQuery = useNewDoctorProfile(doctorId);

  const { data: rawFamilyMembers } = useFamilyMembers(user?.id);
  const familyMembers = rawFamilyMembers ?? [];

  const [step, setStep] = useState<Step>("configure");
  const [consultMode, setConsultMode] = useState<"video" | "clinic">(
    ENABLE_VIDEO_CONSULTATION ? mode : "clinic"
  );
  const [selectedPatient, setSelectedPatient] = useState("self");
  const [selectedFamilyMemberId, setSelectedFamilyMemberId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Automatically select the first family member if available
  useEffect(() => {
    if (familyMembers.length > 0 && !selectedFamilyMemberId) {
      setSelectedFamilyMemberId(familyMembers[0].id);
    }
  }, [familyMembers, selectedFamilyMemberId]);

  // Resolve active doctor profile details
  const doctor = legacyDocQuery.data
    ? legacyDocQuery.data
    : newDocQuery.data
      ? {
        id: newDocQuery.data.id,
        name: newDocQuery.data.full_name,
        specialty: newDocQuery.data.specializations?.[0] || "Ayurveda",
        specialties: newDocQuery.data.specializations || [],
        hprId: newDocQuery.data.verifications?.[0]?.hpr_id || "HPR-PENDING",
        fee: Math.round((newDocQuery.data.consultation_fee ?? 0) / 100),
        avatar: newDocQuery.data.full_name?.split(" ").filter(Boolean).map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "DR",
        isNewDoctor: true,
      }
      : null;

  if (!doctor) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-herb-green border-t-transparent animate-spin" />
      </div>
    );
  }

  const dateLabel = new Date(date).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const total = doctor.fee;
  const doctorSpecialties =
    "specialties" in doctor && doctor.specialties && doctor.specialties.length > 0
      ? doctor.specialties.join(" · ")
      : doctor.specialty;

  async function handleBookNow() {
    if (!user?.id || !doctor) {
      toast.error("Please sign in before booking");
      return;
    }

    const normalizedReason = reason.trim();

    if (selectedPatient === "family" && !selectedFamilyMemberId) {
      toast.error("Please select a family member");
      setStep("configure");
      return;
    }

    setIsProcessing(true);

    try {
      if ("isNewDoctor" in doctor) {
        await bookNewDoctorAppointment({
          userId: user.id,
          doctorProfileId: doctorId,
          mode: consultMode,
          reason: normalizedReason || "No specific reason provided",
          date,
          time: slot,
          familyMemberId:
            selectedPatient === "family"
              ? selectedFamilyMemberId ?? undefined
              : undefined,
        });
      } else {
        await bookAppointment({
          userId: user.id,
          slotId,
          practitionerId: doctorId,
          mode: consultMode,
          reason: normalizedReason || "No specific reason provided",
          date,
          time: slot,
          familyMemberId:
            selectedPatient === "family"
              ? selectedFamilyMemberId ?? undefined
              : undefined,
        });
      }

      setStep("confirmed");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to book appointment";

      console.error("Booking error:", error);
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  }

  if (step === "confirmed") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center py-12">
        <div className="w-24 h-24 rounded-full bg-herb-green/10 border-4 border-herb-green flex items-center justify-center mb-6">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="oklch(0.29 0.09 158)" strokeWidth={2.5}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="font-display text-2xl font-bold text-foreground">Booking Confirmed!</h1>
        <p className="text-muted-foreground text-sm mt-2">
          You&apos;re scheduled with {doctor.name}
        </p>
        <div className="w-full max-w-sm mt-6 bg-white rounded-2xl border border-border p-5 text-left space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-herb-gradient flex items-center justify-center">
              <span className="text-white font-bold">{doctor.avatar}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{doctor.name}</p>
              <p className="text-xs text-muted-foreground">{doctorSpecialties}</p>
            </div>
          </div>
          {[
            ["Date", dateLabel],
            ["Time", slot],
            ...(ENABLE_VIDEO_CONSULTATION
              ? [["Mode", consultMode === "video" ? "📹 Video Consultation" : "🏥 In-Clinic"]]
              : []),
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium text-foreground">{value}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2.5 mt-6 w-full max-w-sm">
          <Link href="/appointments">
            <button className="w-full py-3 bg-herb-green text-white rounded-xl text-sm font-semibold hover:bg-herb-green/90 transition-all">
              View My Appointments
            </button>
          </Link>
          <div className="flex gap-2.5">
            <Link href="/" className="flex-1">
              <button className="w-full py-3 border border-border text-sm font-medium rounded-xl hover:bg-muted transition-colors">
                Back to Home
              </button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
        <Link href="/discover" className="hover:text-foreground">Discover</Link>
        <span>›</span>
        <button
          onClick={async () => {
            await setNavContext("doctor", { doctorId: doctor.id });
            router.push("/doctor");
          }}
          className="hover:text-foreground"
        >
          {doctor.name}
        </button>
        <span>›</span>
        <span className="text-foreground font-medium">Book Appointment</span>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3 mb-6">
        {[
          { id: "configure", label: "Configure" }
        ].map((s, i) => (
          <div key={s.id} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold",
                  step === s.id
                    ? "bg-herb-green text-white"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {i + 1}
              </div>
              <span className={cn("text-xs font-medium", step === s.id ? "text-foreground" : "text-muted-foreground")}>
                {s.label}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Left: Form */}
        <div className="space-y-4">
          {step === "configure" && (
            <>
              {/* Doctor summary */}
              <div className="bg-white rounded-2xl border border-border p-5 flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-herb-gradient flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-lg font-bold">{doctor.avatar}</span>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">{doctor.name}</p>
                  <p className="text-sm text-muted-foreground">{doctorSpecialties}</p>
                  <HPRBadge hprId={doctor.hprId} className="mt-1.5" />
                  <p className="text-xs text-herb-green mt-1 font-medium">
                    📅 {dateLabel} · {slot} · {consultMode === "video" ? "📹 Video" : "🏥 Clinic"}
                  </p>
                </div>
              </div>

              {/* Mode — only show toggle if practitioner offers BOTH modes */}
              {ENABLE_VIDEO_CONSULTATION && (
              <div className="bg-white rounded-2xl border border-border p-5">
                <h3 className="font-semibold text-foreground text-sm mb-3">Consultation Mode</h3>
                {availableModes.length > 1 ? (
                  // Both modes available — show toggle
                  <div className="flex rounded-xl border border-border overflow-hidden bg-background">
                    {(["video", "clinic"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setConsultMode(m)}
                        className={cn(
                          "flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all",
                          consultMode === m ? "bg-herb-green text-white" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {m === "video" ? "📹 Video Consult" : "🏥 In-Clinic"}
                      </button>
                    ))}
                  </div>
                ) : (
                  // Single mode — display as a read-only badge, no choice needed
                  <div className="flex items-center gap-3 px-4 py-3 bg-herb-green/5 border border-herb-green/20 rounded-xl">
                    <span className="text-lg">{availableModes[0] === "video" ? "📹" : "🏥"}</span>
                    <div>
                      <p className="text-xs font-bold text-herb-green">
                        {availableModes[0] === "video" ? "Video Consultation" : "In-Clinic Visit"}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {availableModes[0] === "video"
                          ? "Join via video call — no travel needed"
                          : "Visit the clinic in person"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              )}

              {/* Patient */}
              <div className="bg-white rounded-2xl border border-border p-5">
                <h3 className="font-semibold text-foreground text-sm mb-3">Patient</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => setSelectedPatient("self")}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                      selectedPatient === "self" ? "border-herb-green bg-herb-green/5" : "border-border hover:border-herb-green/30"
                    )}
                  >
                    <div
                      className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                        selectedPatient === "self" ? "border-herb-green bg-herb-green" : "border-muted-foreground/40"
                      )}
                    >
                      {selectedPatient === "self" && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Myself — {user?.name ?? "You"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {user?.abhaLinked ? `${user.phone?.slice(-4) ?? ""}@abha` : `+91 ${user?.phone ?? ""}`}
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setSelectedPatient("family");
                      if (familyMembers.length > 0 && !selectedFamilyMemberId) {
                        setSelectedFamilyMemberId(familyMembers[0].id);
                      }
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                      selectedPatient === "family" ? "border-herb-green bg-herb-green/5" : "border-border hover:border-herb-green/30"
                    )}
                  >
                    <div
                      className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                        selectedPatient === "family" ? "border-herb-green bg-herb-green" : "border-muted-foreground/40"
                      )}
                    >
                      {selectedPatient === "family" && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Family Member</p>
                      <p className="text-xs text-muted-foreground">Book on behalf of a family member</p>
                    </div>
                  </button>

                  {selectedPatient === "family" && (
                    <div className="mt-3 pl-8 space-y-2">
                      {familyMembers.length === 0 ? (
                        <p className="text-xs text-amber-600 bg-amber-50 rounded-xl p-3 border border-amber-100">
                          No family profiles found. <Link href="/profile/family" className="underline font-semibold text-herb-green">Add one here</Link> first.
                        </p>
                      ) : (
                        <select
                          value={selectedFamilyMemberId || ""}
                          onChange={(e) => setSelectedFamilyMemberId(e.target.value)}
                          className="w-full text-sm border border-border rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:border-herb-green/50"
                        >
                          {familyMembers.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.relationship})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Reason */}
              <div className="bg-white rounded-2xl border border-border p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-foreground text-sm">
                    Chief Complaint
                  </h3>

                  <span className="text-xs text-muted-foreground">
                    Optional
                  </span>
                </div>

                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Briefly describe your reason for the consultation (optional)..."
                  maxLength={500}
                  className="w-full text-sm resize-none p-3 rounded-xl border border-border focus:outline-none focus:border-herb-green/50 focus:ring-2 focus:ring-herb-green/10 transition-all placeholder:text-muted-foreground"
                />
              </div>

              <button
                onClick={() => {
                  if (
                    selectedPatient === "family" &&
                    !selectedFamilyMemberId
                  ) {
                    toast.error("Please select a family member");
                    return;
                  }

                  handleBookNow();
                }}
                disabled={
                  isProcessing ||
                  (selectedPatient === "family" &&
                    (!selectedFamilyMemberId ||
                      familyMembers.length === 0))
                }
                className="w-full py-3 bg-herb-green text-white rounded-xl text-sm font-semibold hover:bg-herb-green/90 transition-all active:scale-95 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? "Booking…" : "Book Appointment"}
              </button>
            </>
          )}
        </div>

        {/* Right: Invoice */}
        <div>
          <div className="bg-white rounded-2xl border border-border p-5 sticky top-20">
            <h3 className="font-semibold text-foreground text-sm mb-4">Order Summary</h3>
            <div className="flex items-center gap-3 pb-4 border-b border-border mb-4">
              <div className="w-10 h-10 rounded-xl bg-herb-gradient flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm">{doctor.avatar}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{doctor.name}</p>
                <p className="text-xs text-muted-foreground">{dateLabel} · {slot}</p>
              </div>
            </div>
            <div className="space-y-2">
              {[
                ["Consultation Fee", formatCurrency(doctor.fee)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-xs text-muted-foreground">
                  <span>{label}</span>
                  <span>{value}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between font-bold text-foreground border-t border-border pt-3 mt-3">
              <span className="text-sm">Total</span>
              <span className="text-herb-green">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BookingPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-herb-green border-t-transparent animate-spin" />
      </div>
    }>
      <BookingContent />
    </Suspense>
  );
}