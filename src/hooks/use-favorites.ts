"use client";

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { useQuery } from "./useQuery";
import { apiClient } from "@/shared/api/api-client";

export function useFavorites(userId: string | undefined) {
  const { data, loading } = useQuery<string[]>(
    () =>
      userId
        ? apiClient<{ data: { practitionerIds: string[] } }>("/api/favorites", {
            cache: "no-store",
          }).then((r) => r.data.practitionerIds)
        : Promise.resolve([]),
    [userId]
  );

  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  // Seed local state from the database as soon as it's fetched — on mount,
  // on refresh, and whenever the logged-in user changes. This is the only
  // read of the DB state; after that, successful add/remove calls below keep
  // it in sync directly instead of waiting on a second round-trip that could
  // race with (or be served stale by) this same fetch.
  useEffect(() => {
    setFavoriteIds(new Set(data ?? []));
  }, [data]);

  async function addFavorite(practitionerId: string) {
    await apiClient("/api/favorites", {
      method: "POST",
      body: JSON.stringify({ practitionerId }),
      cache: "no-store",
    });
    setFavoriteIds((prev) => new Set(prev).add(practitionerId));
  }

  async function removeFavorite(practitionerId: string) {
    await apiClient(`/api/favorites?practitionerId=${encodeURIComponent(practitionerId)}`, {
      method: "DELETE",
      cache: "no-store",
    });
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      next.delete(practitionerId);
      return next;
    });
  }

  async function toggleFavorite(practitionerId: string) {
    try {
      if (favoriteIds.has(practitionerId)) {
        await removeFavorite(practitionerId);
      } else {
        await addFavorite(practitionerId);
      }
    } catch (error) {
      console.error("Failed to toggle favorite:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to update favorites"
      );
    }
  }

  return { favoriteIds, loading, addFavorite, removeFavorite, toggleFavorite };
}