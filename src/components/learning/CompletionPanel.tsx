"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import { Award, Ban, CheckCircle2, Copy, Download, Loader2, Lock, MessageSquare, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { CREDIT_TYPE_LABEL, formatCredits } from "@/shared/learning/credits";
import type { CourseCompletion } from "@/shared/learning/types";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
const RATING_LABEL = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

export type CompletionHandlers = {
  submitFeedback: (input: { rating: number; comment: string }) => Promise<void>;
  downloadCertificate: (id: string) => Promise<void>;
};

/**
 * The course's Feedback module and certificate, after all course content. Feedback (when the admin enabled it)
 * unlocks once the content is complete; the certificate is issued by the server once every rule is met, and only
 * then is a download offered.
 */
export function CompletionPanel({ completion, handlers }: { completion: CourseCompletion; handlers: CompletionHandlers }) {
  const c = completion;
  const fb = c.feedback;
  const credits = c.credits > 0 ? `${formatCredits(c.credits)} ${CREDIT_TYPE_LABEL[c.creditType]} ${c.credits === 1 ? "credit" : "credits"}` : null;

  return (
    <div id="course-completion" className="scroll-mt-4 space-y-4">
      {fb.enabled && <FeedbackModule completion={c} onSubmit={handlers.submitFeedback} />}
      <section className={cn("rounded-2xl border bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:p-7", c.stage === "issued" ? "border-emerald-200" : "border-neutral-200/80")} aria-labelledby="certificate-title">
        <div className="flex flex-wrap items-start gap-4">
          <span className={cn("flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl", c.stage === "issued" ? "bg-emerald-50 text-emerald-600" : c.stage === "revoked" ? "bg-neutral-100 text-neutral-400" : "bg-neutral-100 text-neutral-500")}>
            {c.stage === "revoked" ? <Ban size={20} /> : c.stage === "issued" ? <Award size={20} /> : <Lock size={18} />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="certificate-title" className="font-display text-lg font-bold text-foreground">Certificate of completion</h2>
            {c.stage === "in_progress" && <p className="mt-1 text-sm text-muted-foreground">Complete every item in this course{fb.enabled ? " and submit your feedback" : ""} to receive your certificate{credits ? ` and ${credits}` : ""}.</p>}
            {c.stage === "feedback_required" && <p className="mt-1 text-sm font-medium text-amber-800">Course content completed. Submit your feedback to unlock your certificate.</p>}
            {c.stage === "issuing" && <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Your certificate is being issued. Refresh in a moment.</p>}
            {c.stage === "revoked" && c.certificate && <p className="mt-1 text-sm text-muted-foreground">Certificate {c.certificate.number} was revoked{c.certificate.revokeReason ? `: ${c.certificate.revokeReason}` : ""}.</p>}
            {c.stage === "issued" && c.certificate && <IssuedCertificate cert={c.certificate} credits={credits} onDownload={handlers.downloadCertificate} />}
          </div>
        </div>
      </section>
    </div>
  );
}

function IssuedCertificate({ cert, credits, onDownload }: { cert: NonNullable<CourseCompletion["certificate"]>; credits: string | null; onDownload: (id: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <p className="mt-1 text-sm text-foreground/80">Completed on {fmt(cert.completedAt)}{credits ? ` · ${credits} added to your record` : ""}.</p>
      <p className="mt-1 font-mono text-xs text-muted-foreground">{cert.number}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onDownload(cert.id);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not download the certificate");
            } finally {
              setBusy(false);
            }
          }}
          className="inline-flex items-center gap-2 h-11 rounded-xl bg-herb-green px-4 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)] transition-colors duration-150 hover:bg-herb-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-green/40 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Download certificate
        </button>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(cert.verifyUrl).then(() => toast.success("Verification link copied"), () => toast.error("Could not copy the link"))}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-neutral-50"
        >
          <Copy size={15} /> Copy verify link
        </button>
      </div>
    </>
  );
}

function FeedbackModule({ completion, onSubmit }: { completion: CourseCompletion; onSubmit: (input: { rating: number; comment: string }) => Promise<void> }) {
  const fb = completion.feedback;
  const locked = !completion.contentComplete;
  const [editing, setEditing] = useState(!fb.submitted);
  const [rating, setRating] = useState<number>(fb.submitted?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(fb.submitted?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (rating < 1 || rating > 5) return setError("Choose a rating from 1 to 5");
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ rating, comment: fb.allowComment ? comment.trim() : "" });
      setEditing(false);
      toast.success("Thank you for your feedback");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your feedback could not be saved. Please try again."); // input is kept
    } finally {
      setBusy(false);
    }
  }

  const shown = hover || rating;
  return (
    <section className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:p-7" aria-labelledby="feedback-title">
      <div className="flex items-start gap-4">
        <span className={cn("flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl", locked ? "bg-neutral-100 text-neutral-400" : fb.submitted ? "bg-emerald-50 text-emerald-600" : "bg-indigo-50 text-indigo-600")}>
          {locked ? <Lock size={18} /> : fb.submitted && !editing ? <CheckCircle2 size={20} /> : <MessageSquare size={19} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Course feedback</p>
          <h2 id="feedback-title" className="font-display text-lg font-bold text-foreground">{fb.title}</h2>

          {locked ? (
            <p className="mt-1 text-sm text-muted-foreground">Available once you have completed all course content.</p>
          ) : fb.submitted && !editing ? (
            <div className="mt-2">
              <p className="flex items-center gap-1 text-ayur-gold" aria-label={`Your rating: ${fb.submitted.rating} out of 5`}>
                {Array.from({ length: 5 }, (_, i) => <Star key={i} size={18} fill={i < fb.submitted!.rating ? "currentColor" : "none"} />)}
                <span className="ml-2 text-sm font-medium text-foreground/70">Submitted {fmt(fb.submitted.submittedAt)}</span>
              </p>
              {fb.submitted.comment && <p className="mt-2 whitespace-pre-line text-sm text-foreground/80">{fb.submitted.comment}</p>}
              <button type="button" onClick={() => setEditing(true)} className="mt-3 text-xs font-semibold text-copper hover:underline">Edit feedback</button>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <fieldset>
                <legend className="mb-1.5 text-sm font-semibold text-foreground">Your rating <span className="text-red-500" aria-hidden>*</span></legend>
                <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating from 1 to 5" onMouseLeave={() => setHover(0)}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={rating === n}
                      aria-label={`${n} out of 5, ${RATING_LABEL[n]}`}
                      onMouseEnter={() => setHover(n)}
                      onClick={() => { setRating(n); setError(null); }}
                      className="rounded-md p-1 text-ayur-gold transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
                    >
                      <Star size={30} fill={n <= shown ? "currentColor" : "none"} strokeWidth={1.5} />
                    </button>
                  ))}
                  <span className="ml-2 min-w-20 text-sm font-medium text-foreground/70">{shown ? RATING_LABEL[shown] : ""}</span>
                </div>
              </fieldset>
              {fb.allowComment && (
                <div>
                  <label htmlFor="feedback-comment" className="mb-1.5 block text-sm font-semibold text-foreground">Comments <span className="font-normal text-muted-foreground">(optional)</span></label>
                  <textarea id="feedback-comment" rows={4} maxLength={5000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What was most useful? What could be improved?" className="w-full rounded-xl border border-border bg-white px-3.5 py-3 text-sm outline-none focus:border-copper focus:ring-2 focus:ring-copper/15" />
                </div>
              )}
              {error && <p className="text-sm font-medium text-red-600" role="alert">{error}</p>}
              <div className="flex gap-2">
                {fb.submitted && <button type="button" onClick={() => setEditing(false)} disabled={busy} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-neutral-50">Cancel</button>}
                <button type="button" onClick={submit} disabled={busy} className="inline-flex items-center gap-2 h-11 rounded-xl bg-herb-green px-5 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)] transition-colors duration-150 hover:bg-herb-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-green/40 focus-visible:ring-offset-2 disabled:opacity-60">
                  {busy && <Loader2 size={15} className="animate-spin" />} Submit Feedback
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
