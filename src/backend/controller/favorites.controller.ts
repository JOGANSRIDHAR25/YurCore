import { NextRequest } from "next/server";

import { FavoritesService, favoritePractitionerSchema } from "../service/favorites.service";

import { requireAuth } from "@/shared/auth/require-auth";
import { requirePermission } from "@/shared/auth/require-permission";
import { PERMISSIONS } from "@/shared/security/permissions";
import { apiSuccess } from "@/shared/api/api-response";
import { ValidationError } from "@/shared/api/api-error";

/**
 * GET /api/favorites
 *
 * Returns the authenticated patient's favorited practitioner ids.
 */
export async function getFavoritesController(req: NextRequest) {
  const auth = await requireAuth(req);
  requirePermission(auth, PERMISSIONS.FAVORITES_READ);

  const practitionerIds = await FavoritesService.listFavoritePractitionerIds(auth);

  return apiSuccess({ practitionerIds });
}

/**
 * POST /api/favorites
 *
 * Adds a practitioner to the authenticated patient's favorites.
 */
export async function createFavoriteController(req: NextRequest) {
  const auth = await requireAuth(req);
  requirePermission(auth, PERMISSIONS.FAVORITES_CREATE);

  const body: unknown = await req.json();
  const parsed = favoritePractitionerSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError("Favorite validation failed", parsed.error.format());
  }

  await FavoritesService.addFavorite(auth, parsed.data.practitionerId);

  return apiSuccess({ practitionerId: parsed.data.practitionerId, favorited: true });
}

/**
 * DELETE /api/favorites?practitionerId=...
 *
 * Removes a practitioner from the authenticated patient's favorites.
 */
export async function deleteFavoriteController(req: NextRequest) {
  const auth = await requireAuth(req);
  requirePermission(auth, PERMISSIONS.FAVORITES_DELETE);

  const practitionerId = req.nextUrl.searchParams.get("practitionerId") ?? "";
  const parsed = favoritePractitionerSchema.safeParse({ practitionerId });

  if (!parsed.success) {
    throw new ValidationError("Favorite validation failed", parsed.error.format());
  }

  await FavoritesService.removeFavorite(auth, parsed.data.practitionerId);

  return apiSuccess({ practitionerId: parsed.data.practitionerId, favorited: false });
}