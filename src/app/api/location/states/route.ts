
/**
 * GET /api/location/states
 * Returns the list of Indian states / union territories, sourced live from
 * the india-pincode-api (see src/lib/india-location-api.ts).
 */
import { successResponse, errorResponse } from "@/lib/utils/response";
import { getIndiaStates } from "@/lib/india-location-api";

export async function GET() {
  try {
    const states = await getIndiaStates();
    return successResponse(states);
  } catch (err) {
    return errorResponse("Unable to load states. Please try again.", 502, err instanceof Error ? err.message : String(err));
  }
}