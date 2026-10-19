import { NextRequest } from "next/server";

import {
  getFavoritesController,
  createFavoriteController,
  deleteFavoriteController,
} from "@/backend/controller/favorites.controller";

import { withErrorHandler } from "@/backend/middleware/error.middleware";

// Favorites must always reflect the current DB state — never let this route
// (or any intermediary cache) serve a stale response.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function withNoStore(res: Response): Response {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  return withNoStore(await getFavoritesController(req));
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  return withNoStore(await createFavoriteController(req));
});

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  return withNoStore(await deleteFavoriteController(req));
});