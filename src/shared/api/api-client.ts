import { AppError } from "./api-error";

interface FetchOptions extends RequestInit {
  params?: Record<
    string,
    string | number | boolean | null | undefined
  >;
  /**
   * Skip the console.error for a failed response. Use this for calls whose
   * caller already treats a non-2xx as expected control flow (e.g. "no nav
   * context set yet" on a fresh page load) rather than a real failure.
   */
  silent?: boolean;
}

interface ErrorResponse {
  message?: string;
  error?: string;
  details?: unknown;
}

export async function apiClient<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { params, headers, body, silent, ...requestOptions } = options;

  const isBrowser = typeof window !== "undefined";
  const baseUrl = isBrowser ? "" : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
  
  // If endpoint is relative and we are in browser, use window.location.origin
  // Actually, URL constructor handles relative URLs if a base is provided, but we don't need a base if it's relative in browser.
  const url = new URL(endpoint, isBrowser && endpoint.startsWith("/") ? window.location.origin : baseUrl);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const requestHeaders = new Headers(headers);

  if (body && !(body instanceof FormData)) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(url.toString(), {
    credentials: "include",
    ...requestOptions,
    body,
    headers: requestHeaders,
  });

  const contentType = response.headers.get("content-type");

  let data: unknown = null;

  if (contentType?.includes("application/json")) {
    data = await response.json().catch(() => null);
  } else {
    data = await response.text().catch(() => null);
  }

  if (!response.ok) {
    const errorData =
      data && typeof data === "object"
        ? (data as ErrorResponse)
        : null;

    const message =
      errorData?.message ||
      errorData?.error ||
      (typeof data === "string" && data) ||
      `Request failed with status ${response.status}`;

    if (!silent) {
      console.error("API request failed", {
        endpoint: url.toString(),
        method: requestOptions.method ?? "GET",
        status: response.status,
        statusText: response.statusText,
        response: data,
      });
    }

    if (response.status === 401) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("mv_user");
        localStorage.removeItem("mv_admin");
        const path = window.location.pathname;
        if (path.startsWith("/admin")) {
          if (path !== "/admin" && path !== "/admin/") {
            window.location.href = "/admin";
          }
        } else if (!path.startsWith("/login") && !path.startsWith("/onboarding")) {
          window.location.href = "/login";
        }
      }
    }

    throw new AppError(message, response.status);
  }

  return data as T;
}