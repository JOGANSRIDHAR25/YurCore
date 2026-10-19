import "server-only";

import { z } from "zod";

import { FavoritesRepository } from "../repo/favorites.repo";
import type { AuthUser } from "@/shared/auth/auth.types";

export const favoritePractitionerSchema = z.object({
  practitionerId: z.string().min(1, "practitionerId is required"),
});

export class FavoritesService {
  static async listFavoritePractitionerIds(auth: AuthUser): Promise<string[]> {
    return FavoritesRepository.listPractitionerIds(auth.id);
  }

  static async addFavorite(auth: AuthUser, practitionerId: string): Promise<void> {
    await FavoritesRepository.addFavorite(auth.id, practitionerId);
  }

  static async removeFavorite(auth: AuthUser, practitionerId: string): Promise<void> {
    await FavoritesRepository.removeFavorite(auth.id, practitionerId);
  }
}