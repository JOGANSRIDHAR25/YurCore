"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Building, CalendarX2, Mail, Video, X } from "lucide-react";
import toast from "react-hot-toast";

import { cn } from "@/lib/utils";
import {
  fetchUpcomingAppointments,
  setAcceptingBookings,
  type AvailabilityState,
  type CancellationResult,
  type DoctorAppointment,
} from "@/hooks/use-availability";
import { formatTime12 } from "@/shared/availability/schedule";

export function formatDayLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function cancellationToast(result: CancellationResult, prefix: string) {
  if (result.cancelled === 0 && result.failed === 0) {
    toast.success(prefix);
    return;
  }
  const parts = [`${prefix}. ${result.cancelled} appointment(s) cancelled`];
  if (result.cancelled > 0) parts.push(`${result.emailed} patient(s) emailed`);
  if (result.failed > 0) parts.push(`${result.failed} could not be cancelled — please check your schedule`);
  (result.failed > 0 ? toast.error : toast.success)(parts.join(", ") + ".", { duration: 6000 });
}

export function Modal({
  open,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={cn("relative w-full max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl", wide ? "max-w-lg" : "max-w-md")}>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close"
        >
          <X size={16} />
        </button>
        {children}
      </div>
    </div>
  );
}

export function AppointmentList({
  appointments,
  showReason,
}: {
  appointments: (DoctorAppointment & { conflictReason?: string })[];
  showReason?: boolean;
}) {
  return (
    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 max-h-64 overflow-y-auto">
      {appointments.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">{a.patientName}</p>
            <p className="text-xs text-gray-500">
              {formatDayLabel(a.date)} · {formatTime12(a.time)}
              {showReason && a.conflictReason ? <span className="text-red-600"> · {a.conflictReason}</span> : null}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">
            {a.mode === "video" ? <Video size={10} /> : <Building size={10} />}
            {a.mode === "video" ? "Video" : "Clinic"}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * "These patients have appointments — confirm to cancel." Shown before any
 * availability change that would leave booked appointments outside the
 * doctor's hours. Nothing is cancelled unless the doctor confirms here.
 */
export function ConfirmCancellationDialog({
  open,
  title,
  description,
  appointments,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  appointments: (DoctorAppointment & { conflictReason?: string })[];
  confirmLabel: string;
  busy: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} wide>
      <div className="flex items-start gap-3 pr-6">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50">
          <AlertTriangle className="h-5 w-5 text-red-600" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <div className="mt-1 text-sm text-gray-600">{description}</div>
        </div>
      </div>

      <div className="mt-4">
        <AppointmentList appointments={appointments} showReason />
      </div>

      <label className="mt-4 block text-xs font-bold text-gray-700">
        Message to patients <span className="font-normal text-gray-400">(optional — included in the email)</span>
      </label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={300}
        rows={2}
        placeholder="e.g. I'm attending a medical conference. Sorry for the inconvenience."
        className="mt-1 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
      />

      <p className="mt-3 flex items-start gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
        <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Each patient gets an email and an in-app notification asking them to rebook. You&apos;ll get a summary email too.
      </p>

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Go back
        </button>
        <button
          type="button"
          onClick={() => onConfirm(reason)}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/**
 * The ONE "Accepting bookings" switch — same server state on the dashboard
 * and on the Availability page.
 *
 *  ON  → patients can find you and book open slots.
 *  OFF → you're hidden from patients and no new bookings are possible.
 *        Existing appointments stay, unless you choose to cancel them here.
 */
export function AcceptingBookingsSwitch({
  state,
  onChanged,
  compact,
}: {
  state: AvailabilityState | null;
  onChanged: () => void;
  compact?: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [upcoming, setUpcoming] = useState<DoctorAppointment[]>([]);
  const [loadingUpcoming, setLoadingUpcoming] = useState(false);
  const [choice, setChoice] = useState<"keep" | "cancel">("keep");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const accepting = state?.acceptingBookings ?? false;
  const configured = state?.configured ?? false;
  const live = accepting && configured;

  const turnOn = async () => {
    if (!configured) {
      toast("Set and save your availability first — then you'll go live automatically.", { icon: "🗓️" });
      return;
    }
    setBusy(true);
    try {
      await setAcceptingBookings({ accepting: true });
      toast.success("You're accepting bookings again. Patients can see your open slots.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update booking status");
    } finally {
      setBusy(false);
    }
  };

  const openTurnOff = async () => {
    setChoice("keep");
    setReason("");
    setDialogOpen(true);
    setLoadingUpcoming(true);
    try {
      setUpcoming(await fetchUpcomingAppointments());
    } catch {
      setUpcoming([]);
    } finally {
      setLoadingUpcoming(false);
    }
  };

  const confirmTurnOff = async () => {
    setBusy(true);
    try {
      const { cancellation } = await setAcceptingBookings({
        accepting: false,
        cancelUpcoming: choice === "cancel" && upcoming.length > 0,
        cancelReason: reason,
      });
      setDialogOpen(false);
      cancellationToast(cancellation, "You've stopped accepting new bookings");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update booking status");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-3 rounded-[12px] border px-4 py-3",
          live ? "border-emerald-100 bg-emerald-50/60" : "border-gray-100 bg-[#F8FAFC]",
        )}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-700">
            {!configured ? "Not live yet" : accepting ? "Accepting bookings" : "Bookings paused"}
          </p>
          {!compact && (
            <p className="text-[11px] text-gray-500">
              {!configured
                ? "Save your availability to go live"
                : accepting
                ? "Patients can see and book you"
                : "Hidden from patients · existing appointments kept"}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={busy || !state}
          onClick={() => (live ? openTurnOff() : turnOn())}
          className={cn(
            "relative h-6 w-12 shrink-0 rounded-full shadow-inner transition-all disabled:opacity-50",
            live ? "bg-emerald-500" : "bg-gray-300",
          )}
          aria-label={live ? "Stop accepting bookings" : "Start accepting bookings"}
          aria-pressed={live}
        >
          <div className={cn("absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all", live ? "left-7" : "left-1")} />
        </button>
      </div>

      <Modal open={dialogOpen} onClose={() => !busy && setDialogOpen(false)} wide>
        <h3 className="pr-6 text-lg font-bold text-gray-900">Stop accepting new bookings?</h3>
        <p className="mt-1 text-sm text-gray-600">
          You&apos;ll be hidden from patients and nobody can book a new slot until you switch this back on.
        </p>

        <Link
          href="/pro/availability?tab=dates"
          onClick={() => setDialogOpen(false)}
          className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 hover:bg-amber-100"
        >
          <CalendarX2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>Only away for a few days?</strong> Mark those dates as leave instead — patients can still book your other days.
          </span>
        </Link>

        <div className="mt-4">
          {loadingUpcoming ? (
            <p className="py-4 text-center text-xs text-gray-500">Checking your upcoming appointments…</p>
          ) : upcoming.length === 0 ? (
            <p className="rounded-xl bg-gray-50 px-3 py-3 text-sm text-gray-600">You have no upcoming appointments.</p>
          ) : (
            <>
              <p className="mb-2 text-sm font-semibold text-gray-800">
                You have {upcoming.length} upcoming appointment{upcoming.length === 1 ? "" : "s"}:
              </p>
              <AppointmentList appointments={upcoming} />
              <div className="mt-3 space-y-2">
                {(
                  [
                    { value: "keep", label: "Keep these appointments", hint: "Recommended. You'll still see them in your queue." },
                    { value: "cancel", label: "Cancel all of them", hint: "Each patient is emailed and notified to rebook." },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors",
                      choice === option.value
                        ? option.value === "cancel"
                          ? "border-red-300 bg-red-50"
                          : "border-indigo-300 bg-indigo-50"
                        : "border-gray-200 hover:bg-gray-50",
                    )}
                  >
                    <input
                      type="radio"
                      name="offline-choice"
                      className="mt-1 accent-indigo-600"
                      checked={choice === option.value}
                      onChange={() => setChoice(option.value)}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-gray-900">{option.label}</span>
                      <span className="block text-xs text-gray-500">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {choice === "cancel" && (
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={300}
                  rows={2}
                  placeholder="Message to patients (optional), e.g. I'm unwell and unable to consult this week."
                  className="mt-3 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                />
              )}
            </>
          )}
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setDialogOpen(false)}
            disabled={busy}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Stay online
          </button>
          <button
            type="button"
            onClick={confirmTurnOff}
            disabled={busy || loadingUpcoming}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60",
              choice === "cancel" && upcoming.length > 0 ? "bg-red-600 hover:bg-red-700" : "bg-gray-900 hover:bg-black",
            )}
          >
            {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
            {choice === "cancel" && upcoming.length > 0
              ? `Pause & cancel ${upcoming.length} appointment${upcoming.length === 1 ? "" : "s"}`
              : "Pause new bookings"}
          </button>
        </div>
      </Modal>
    </>
  );
}
