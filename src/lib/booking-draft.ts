import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { serverEnv } from "@/shared/config/env";

const BOOKING_DRAFT_SECRET = new TextEncoder().encode(
  serverEnv.JWT_SECRET || "meyveda-secret-key-at-least-32-chars-long",
);

export const BOOKING_DRAFT_COOKIE = "booking_draft";
export const BOOKING_DRAFT_TTL_SECONDS = 15 * 60;

export type BookingDraft = {
  userId: string;
  doctorId: string;
  slotId: string;
  slot: string;
  date: string;
  mode: "video" | "clinic";
  availableModes: ("video" | "clinic")[];
};

/**
 * Signs the user's in-progress booking selection into a short-lived JWT so
 * it can travel as an httpOnly cookie instead of query-string parameters.
 * Scoped to the authenticated user's id so a copied/leaked cookie can't be
 * replayed under a different session.
 */
export async function signBookingDraft(draft: BookingDraft): Promise<string> {
  return await new SignJWT({ ...draft })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${BOOKING_DRAFT_TTL_SECONDS}s`)
    .sign(BOOKING_DRAFT_SECRET);
}

export async function verifyBookingDraft(
  token: string,
  userId: string,
): Promise<BookingDraft | null> {
  try {
    const { payload } = await jwtVerify(token, BOOKING_DRAFT_SECRET);
    const draft = payload as unknown as BookingDraft;

    if (draft.userId !== userId) {
      return null;
    }

    return draft;
  } catch {
    return null;
  }
}
