
/**
 * GET /api/location/cities?state=<state>
 * Returns the list of cities/districts for the given Indian state / union
 * territory, sourced live from the india-pincode-api (see
 * src/lib/india-location-api.ts).
 */
import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/utils/response";
import { getIndiaCities } from "@/lib/india-location-api";

export async function GET(req: NextRequest) {
  const state = req.nextUrl.searchParams.get("state");
  if (!state) {
    return errorResponse("Query param 'state' is required", 400);
  }

  try {
    const cities = await getIndiaCities(state);
    return successResponse(cities);
  } catch (err) {
    return errorResponse("Unable to load cities. Please try again.", 502, err instanceof Error ? err.message : String(err));
  }
}