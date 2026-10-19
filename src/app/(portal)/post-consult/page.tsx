"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { useAppointments } from "@/hooks/use-appointments";
import { usePatientPrescriptions } from "@/hooks/use-prescriptions";

async function submitRating(params: {
  userId: string;
  consultationId: string;
  practitionerId: string;
  stars: number;
  reviewText: string;
}): Promise<void> {
  const response = await fetch("/api/booking/rating", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Unable to submit rating");
  }
}

const NEXT_STEPS = [
  { id: "rx", label: "View your care plan", href: "/prescription", icon: "📋", cta: "View Care Plan" },
  { id: "med", label: "Order prescribed medicines", href: "/apothecary", icon: "🌿", cta: "Shop Apothecary" },
  { id: "fu", label: "Book your follow-up", href: "/discover", icon: "🗓️", cta: "Book Follow-up" },
];

export default function PostConsultPage() {
  const { user } = useAuth();
  const { data: rawAppointments, loading: loadingAppts } = useAppointments(user?.id);
  const { data: rawPrescriptions, loading: loadingRx } = usePatientPrescriptions(user?.id);
  const appointments = rawAppointments ?? [];
  const prescriptions = rawPrescriptions ?? [];

  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [submittingRating, setSubmittingRating] = useState(false);

  function toggleStep(id: string) {
    setCompletedSteps((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  // Find the latest completed appointment (status === "past")
  const completedAppt = appointments.find((a) => a.status === "past");
  
  // Find the matching prescription for this completed consultation
  const matchingRx = completedAppt
    ? prescriptions.find((r) => r.doctorName === completedAppt.doctor)
    : prescriptions[0];

  async function handleSubmitRating() {
    if (!user?.id || !completedAppt || !completedAppt.consultationId || rating === 0) return;
    setSubmittingRating(true);
    try {
      await submitRating({
        userId: user.id,
        consultationId: completedAppt.consultationId,
        practitionerId: completedAppt.practitionerId,
        stars: rating,
        reviewText: feedback,
      });
      setSubmitted(true);
    } catch (err) {
      console.error("Failed to submit rating:", err);
    } finally {
      setSubmittingRating(false);
    }
  }

  const isLoading = loadingAppts || loadingRx;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 rounded-full border-2 border-herb-green border-t-transparent animate-spin" />
        </div>
      ) : !completedAppt ? (
        <div className="bg-white rounded-2xl border border-dashed border-border p-12 text-center max-w-md mx-auto my-12">
          <span className="text-4xl">🗓️</span>
          <h2 className="font-semibold text-foreground mt-3">No consultations completed yet</h2>
          <p className="text-xs text-muted-foreground mt-1 mb-6">
            When you complete a virtual consultation, your care plan and feedback form will appear here.
          </p>
          <Link href="/discover">
            <button className="px-5 py-2.5 bg-herb-green text-white text-sm font-semibold rounded-xl hover:bg-herb-green/90">
              Book a Consultation
            </button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          {/* Left */}
          <div className="space-y-5">
            {/* Session complete banner */}
            <div className="bg-herb-gradient rounded-2xl p-6 text-white relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-28 h-28 rounded-full bg-white/5" />
              <div className="absolute -right-2 -bottom-6 w-36 h-36 rounded-full bg-white/5" />
              <div className="relative z-10 flex items-start gap-5">
                <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center flex-shrink-0">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-white/70 text-xs font-medium uppercase tracking-wider">Session Complete</p>
                  <h1 className="font-display text-xl font-semibold mt-1">{completedAppt.doctor}</h1>
                  <p className="text-white/70 text-sm mt-0.5">{completedAppt.specialty}</p>
                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    <span className="text-xs bg-white/15 px-2.5 py-1 rounded-full">📅 {completedAppt.date}</span>
                    {completedAppt.duration && (
                      <span className="text-xs bg-white/15 px-2.5 py-1 rounded-full">⏱ {completedAppt.duration}</span>
                    )}
                    <span className="text-xs bg-white/15 px-2.5 py-1 rounded-full capitalize">📹 {completedAppt.mode}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Prescription released */}
            <div className="bg-white rounded-2xl border border-herb-green/30 p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📋</span>
                    <h2 className="font-semibold text-foreground text-sm">Care Plan Ready</h2>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Your practitioner has finalized and signed your prescription.
                  </p>
                </div>
                {user?.abhaLinked && (
                  <span className="text-[10px] bg-herb-green/10 text-herb-green font-semibold px-2.5 py-1 rounded-full border border-herb-green/20 flex-shrink-0">
                    ABHA ✓
                  </span>
                )}
              </div>
              
              {matchingRx && matchingRx.items.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {matchingRx.items.map((item, i) => (
                    <div key={i} className="flex items-start gap-2.5 p-2.5 bg-herb-green/4 rounded-xl border border-herb-green/10">
                      <span className="text-sm mt-0.5">🌿</span>
                      <div>
                        <p className="text-xs font-semibold text-foreground">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {item.dose} · {item.frequency} {item.anupana ? `· with ${item.anupana}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic mb-4">No formulations prescribed for this session.</p>
              )}

              <Link href="/prescription">
                <button className="w-full py-2.5 bg-herb-green text-white rounded-xl text-sm font-semibold hover:bg-herb-green/90 transition-all">
                  View Full Care Plan →
                </button>
              </Link>
            </div>

            {/* Next steps */}
            <div className="bg-white rounded-2xl border border-border p-5">
              <h2 className="font-semibold text-foreground text-sm mb-4">Your Next Steps</h2>
              <div className="space-y-3">
                {NEXT_STEPS.map((step) => (
                  <div
                    key={step.id}
                    className={cn(
                      "flex items-center gap-3 p-4 rounded-xl border transition-all",
                      completedSteps.includes(step.id)
                        ? "border-herb-green/20 bg-herb-green/5"
                        : "border-border"
                    )}
                  >
                    <button
                      onClick={() => toggleStep(step.id)}
                      className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all",
                        completedSteps.includes(step.id)
                          ? "border-herb-green bg-herb-green"
                          : "border-muted-foreground/30"
                      )}
                    >
                      {completedSteps.includes(step.id) && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3}>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                    <span className="text-base flex-shrink-0">{step.icon}</span>
                    <p className={cn("text-sm flex-1", completedSteps.includes(step.id) ? "line-through text-muted-foreground" : "text-foreground")}>
                      {step.label}
                    </p>
                    <Link href={step.href}>
                      <button className="text-xs text-herb-green font-semibold hover:underline flex-shrink-0">
                        {step.cta}
                      </button>
                    </Link>
                  </div>
                ))}
              </div>
            </div>

            {/* ABHA record note */}
            <div className="flex items-start gap-3 p-4 bg-ivory-deep rounded-xl border border-border">
              <span className="text-lg flex-shrink-0">🛡️</span>
              <div>
                <p className="text-xs font-semibold text-foreground">Saved to your ABHA Health Locker</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  This prescription has been securely uploaded. View it anytime in Health Records.
                </p>
              </div>
              <Link href="/records" className="flex-shrink-0">
                <button className="text-xs text-herb-green font-medium hover:underline mt-0.5">Records →</button>
              </Link>
            </div>
          </div>

          {/* Right */}
          <div className="space-y-5">
            {/* Rate the doctor */}
            <div className="bg-white rounded-2xl border border-border p-5">
              <h2 className="font-semibold text-foreground text-sm mb-1">Rate Your Session</h2>
              <p className="text-xs text-muted-foreground mb-4">How was your consultation with {completedAppt.doctor}?</p>

              {!completedAppt.consultationId ? (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-xl p-3 border border-amber-100 italic">
                  Feedback submission will become available once the practitioner syncs the EMR consultation record.
                </p>
              ) : !submitted ? (
                <>
                  {/* Stars */}
                  <div className="flex items-center gap-2 justify-center mb-4">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoveredRating(star)}
                        onMouseLeave={() => setHoveredRating(0)}
                        className="transition-transform hover:scale-110"
                      >
                        <svg
                          width="32"
                          height="32"
                          viewBox="0 0 24 24"
                          fill={(hoveredRating || rating) >= star ? "#F59E0B" : "none"}
                          stroke={(hoveredRating || rating) >= star ? "#F59E0B" : "#D1D5DB"}
                          strokeWidth={1.5}
                        >
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </button>
                    ))}
                  </div>
                  {rating > 0 && (
                    <p className="text-center text-xs font-medium text-foreground mb-3">
                      {rating === 5 ? "Excellent! 🎉" : rating === 4 ? "Very Good 👍" : rating === 3 ? "Good 🙂" : rating === 2 ? "Fair 😐" : "Needs Improvement"}
                    </p>
                  )}
                  <textarea
                    rows={3}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Share what went well or how the session could be better… (optional)"
                    className="w-full text-sm border border-border rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-herb-green/50 placeholder:text-muted-foreground mb-3"
                  />
                  <button
                    onClick={handleSubmitRating}
                    disabled={rating === 0 || submittingRating}
                    className={cn(
                      "w-full py-2.5 text-sm font-semibold rounded-xl transition-all",
                      rating > 0 && !submittingRating ? "bg-herb-green text-white hover:bg-herb-green/90" : "bg-muted text-muted-foreground cursor-not-allowed"
                    )}
                  >
                    {submittingRating ? "Submitting..." : "Submit Rating"}
                  </button>
                  {rating === 0 && (
                    <p className="text-center text-[10px] text-muted-foreground mt-2">Tap a star to rate</p>
                  )}
                </>
              ) : (
                <div className="text-center py-4">
                  <span className="text-4xl">🙏</span>
                  <p className="font-semibold text-foreground mt-2">Thank you!</p>
                  <p className="text-xs text-muted-foreground mt-1">Your feedback helps others find the right care.</p>
                </div>
              )}
            </div>

            {/* Reminders */}
            <div className="bg-white rounded-2xl border border-border p-5">
              <h2 className="font-semibold text-foreground text-sm mb-3">Medication Reminders</h2>
              <p className="text-xs text-muted-foreground mb-3">
                Set reminders for your prescribed formulations so you never miss a dose.
              </p>
              <div className="space-y-2">
                {matchingRx && matchingRx.items.length > 0 ? (
                  matchingRx.items.slice(0, 3).map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="text-xs font-medium text-foreground">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground">{item.frequency}</p>
                      </div>
                      <button className="text-xs text-herb-green font-medium">Set</button>
                    </div>
                  ))
                ) : (
                  <>
                    {[
                      { label: "Morning Dosage", time: "07:30 AM" },
                      { label: "Afternoon Dosage", time: "01:00 PM" },
                      { label: "Bedtime Dosage", time: "09:30 PM" },
                    ].map((r, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <div>
                          <p className="text-xs font-medium text-foreground">{r.label}</p>
                          <p className="text-[10px] text-muted-foreground">{r.time}</p>
                        </div>
                        <button className="text-xs text-herb-green font-medium">Set</button>
                      </div>
                    ))}
                  </>
                )}
              </div>
              <button className="w-full mt-3 py-2 border border-herb-green/30 text-herb-green text-xs font-semibold rounded-xl hover:bg-herb-green/5 transition-colors">
                Enable All Reminders
              </button>
            </div>

            <Link href="/">
              <button className="w-full py-3 bg-muted text-foreground text-sm font-medium rounded-xl hover:bg-muted/80 transition-colors">
                Return to Home
              </button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
