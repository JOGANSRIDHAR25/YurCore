import { apiClient } from "@/shared/api/api-client";
import type { NavContextKey } from "./nav-session";

/**
 * Client-side pair for the /api/nav-context endpoint. Call `setNavContext`
 * right before navigating to a route that no longer carries the id in its
 * URL, then have that route call `getNavContext` with the same key on
 * mount.
 */
export async function setNavContext(
  key: NavContextKey,
  data: Record<string, unknown>,
): Promise<void> {
  await apiClient("/api/nav-context", {
    method: "POST",
    body: JSON.stringify({ key, data }),
  });
}

export async function getNavContext<T = Record<string, unknown>>(
  key: NavContextKey,
): Promise<T | null> {
  try {
    const result = await apiClient<{ data: T }>("/api/nav-context", {
      params: { key },
      silent: true,
    });
    return result.data;
  } catch {
    return null;
  }
}
