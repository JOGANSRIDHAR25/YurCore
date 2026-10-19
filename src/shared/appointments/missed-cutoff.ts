/**
 * Single source of truth for "when does a scheduled appointment count as
 * missed?" — every place in the codebase that flips an appointment to
 * missed/no_show (or shows a countdown for one) must go through this, so the
 * cutoff can never drift between the doctor's queue, the patient's
 * notifications sweep, and the appointments list.
 *
 * The window is always the practitioner's own slot duration + buffer, since
 * that's what actually varies per doctor (set on their Availability page) —
 * never a hardcoded number.
 */

export const DEFAULT_SLOT_DURATION_MIN = 20;
export const DEFAULT_BUFFER_MIN = 0;

/** Epoch ms at which a scheduled slot's grace window ends. */
export function getAppointmentCutoffMs(
    scheduledDate: string,
    scheduledTime: string,
    slotDurationMin?: number | null,
    bufferMin?: number | null
): number {
    const [hours, minutes] = scheduledTime.split(":").map((n) => parseInt(n, 10));
    const slotStart = new Date(`${scheduledDate}T00:00:00`);
    slotStart.setHours(hours || 0, minutes || 0, 0, 0);

    const duration = slotDurationMin ?? DEFAULT_SLOT_DURATION_MIN;
    const buffer = bufferMin ?? DEFAULT_BUFFER_MIN;
    return slotStart.getTime() + (duration + buffer) * 60_000;
}

export function isAppointmentPastCutoff(
    scheduledDate: string,
    scheduledTime: string,
    slotDurationMin?: number | null,
    bufferMin?: number | null,
    now: number = Date.now()
): boolean {
    return now > getAppointmentCutoffMs(scheduledDate, scheduledTime, slotDurationMin, bufferMin);
}