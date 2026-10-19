"use client";

import { useQuery } from "./useQuery";
import { apiClient } from "@/shared/api/api-client";

/** All Indian states / union territories, served via our own API proxy. */
export function useIndiaStates() {
  return useQuery<string[]>(async () => {
    const response = await apiClient<{ data: string[] }>("/api/location/states");
    return response.data ?? [];
  }, []);
}

/**
 * Cities for the given state. Refetches whenever the state changes, and stays
 * empty (without hitting the network) while no state is selected.
 */
export function useIndiaCities(state: string | null | undefined) {
  return useQuery<string[]>(async () => {
    if (!state) return [];
    const response = await apiClient<{ data: string[] }>("/api/location/cities", {
      params: { state },
    });
    return response.data ?? [];
  }, [state]);
}