/**
 * Slots controller — handles slot queries and creation.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/shared/db/supabase.server";
import { errorResponse } from "@/lib/utils/response";
import { requireAuth } from "@/shared/auth/require-auth";
import { ROLES } from "@/shared/security/roles";
import { AppError } from "@/shared/api/api-error";

/**
 * GET /api/slots — Get slots for a practitioner.
 */
export async function getSlots(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const practitionerId = searchParams.get("practitioner_id");
  const date = searchParams.get("date");

  if (!practitionerId) {
    return errorResponse("Missing practitioner_id", 400);
  }

  // Cast to any — database types are not yet generated
  const supabase: any = createClient();

  let query = supabase
    .from("slots")
    .select("*")
    .eq("practitioner_id", practitionerId);

  if (date) {
    query = query.eq("slot_date", date);
  }

  query = query.order("start_time", { ascending: true });

  const { data, error } = await query;

  if (error) {
    return errorResponse(error.message, 500);
  }

  return NextResponse.json({ slots: data });
}

/**
 * POST /api/slots — Insert new slots.
 */
export async function createSlots(req: NextRequest) {
  const authUser = await requireAuth(req);

  const isStaff = authUser.role === ROLES.ADMIN || authUser.role === ROLES.SUPER_ADMIN;
  const isDoctor = authUser.role === ROLES.DOCTOR;

  if (!isStaff && !isDoctor) {
    throw new AppError("Not authorized to create slots", 403);
  }

  const body = await req.json();
  const { slots } = body;

  if (!slots || !Array.isArray(slots) || slots.length === 0) {
    return errorResponse("Missing or invalid 'slots' array in request body", 400);
  }

  // Cast to any — database types are not yet generated
  const supabase: any = createClient();

  // A doctor can only ever create slots for themselves — the practitioner_id
  // on every submitted slot is overwritten with their own resolved id so a
  // client-supplied practitioner_id can never inject slots for someone else.
  let scopedSlots = slots;
  if (isDoctor) {
    const { data: practitioner } = await supabase
      .from("practitioners")
      .select("id")
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (!practitioner?.id) {
      throw new AppError("Practitioner profile not found", 404);
    }

    scopedSlots = slots.map((slot: Record<string, unknown>) => ({
      ...slot,
      practitioner_id: practitioner.id,
    }));
  }

  const { data, error } = await supabase.from("slots").insert(scopedSlots).select();

  if (error) {
    return NextResponse.json({ error: error.message, details: error }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Slots inserted successfully", inserted: data });
}
