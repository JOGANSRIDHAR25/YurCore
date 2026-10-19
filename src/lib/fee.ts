import { ENABLE_VIDEO_CONSULTATION } from "@/lib/feature-flags";

/**
 * A practitioner's consultation fee lives in two DB columns —
 * `base_video_fee` and `base_clinic_fee` (practitioners table, paise).
 * While video consultations are feature-flagged off, in-clinic is the only
 * fee a patient ever pays, so it must win whenever both are present but one
 * hasn't been configured (falls back to the other so a doctor who has only
 * filled in one field doesn't show as ₹0 everywhere else).
 */
export function resolveActiveFeeRupees(
  baseVideoFeePaise?: number | null,
  baseClinicFeePaise?: number | null
): number {
  const video = Math.round((baseVideoFeePaise ?? 0) / 100);
  const clinic = Math.round((baseClinicFeePaise ?? 0) / 100);
  return ENABLE_VIDEO_CONSULTATION ? video || clinic : clinic || video;
}

/**
 * The consultation modes a practitioner actually offers. Bookable slots are
 * generated per mode only when that mode's fee is set (see
 * AvailabilityRepository slot generation), so the fees are the source of
 * truth for "Video & In-Clinic" / "Video Only" / "In-Clinic Only".
 */
export function resolveConsultModes(
  baseVideoFeePaise?: number | null,
  baseClinicFeePaise?: number | null
): ("video" | "clinic")[] {
  const modes: ("video" | "clinic")[] = [];
  if (ENABLE_VIDEO_CONSULTATION && (baseVideoFeePaise ?? 0) > 0) modes.push("video");
  if ((baseClinicFeePaise ?? 0) > 0) modes.push("clinic");
  return modes.length > 0 ? modes : ["clinic"];
}