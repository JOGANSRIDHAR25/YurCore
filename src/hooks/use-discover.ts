"use client";

import { useQuery } from "./useQuery";
import { apiClient } from "@/shared/api/api-client";
import type { Practitioner } from "@/features/doctor/types/doctor.types";

export type DiscoverMetadata = {
  symptoms: string[];
  disciplineCounts: Record<string, number>;
};

export function useDiscoverMetadata() {
  return useQuery<DiscoverMetadata>(async () => {
    const response = await apiClient<{ data: DiscoverMetadata }>("/api/discover/metadata");
    return response.data;
  }, []);
}

export function usePractitioners(filters?: {
  discipline?: string;
  search?: string;
  videoAvailable?: boolean;
  under500?: boolean;
  today?: boolean;
  languages?: string[];
  sortBy?: string;
}) {
  return useQuery<Practitioner[]>(
    async () => {
      const params: Record<string, string> = {};
      if (filters?.discipline) params.discipline = filters.discipline;
      if (filters?.search) params.search = filters.search;
      if (filters?.videoAvailable) params.videoAvailable = "true";
      if (filters?.under500) params.under500 = "true";
      if (filters?.today) params.today = "true";
      if (filters?.languages?.length) params.languages = filters.languages.join(",");
      if (filters?.sortBy) params.sortBy = filters.sortBy;

      const response = await apiClient<{ data: Practitioner[] }>("/api/discover/practitioners", { params });
      return response.data;
    },
    [
      filters?.discipline,
      filters?.search,
      filters?.videoAvailable,
      filters?.under500,
      filters?.today,
      JSON.stringify(filters?.languages),
      filters?.sortBy,
    ]
  );
}

export function usePractitioner(id: string | undefined) {
  return useQuery<Practitioner | null>(
    async () => {
      if (!id) return null;
      const response = await apiClient<{ data: Practitioner | null }>(`/api/discover/practitioners/${id}`);
      return response.data;
    },
    [id]
  );
}
