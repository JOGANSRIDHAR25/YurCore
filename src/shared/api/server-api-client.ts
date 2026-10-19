import "server-only";

import { headers } from "next/headers";
import { AppError } from "./api-error";

interface ServerFetchOptions extends RequestInit {
  params?: Record<
    string,
    string | number | boolean | null | undefined
  >;
}

interface ErrorResponse {
  message?: string;
  error?: string;
}

function getBaseUrl(requestHeaders: Headers): string {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (configuredUrl) {
    return configuredUrl;
  }

  const host = requestHeaders.get("host");

  if (!host) {
    return "http://localhost:3000";
  }

  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");

  return `${protocol}://${host}`;
}

export async function serverApiClient<T>(
  endpoint: string,
  options: ServerFetchOptions = {}
): Promise<T> {
  const incomingHeaders = await headers();
  const { params, headers: customHeaders, ...requestOptions } =
    options;

  const url = new URL(endpoint, getBaseUrl(incomingHeaders));

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const requestHeaders = new Headers(customHeaders);

  const cookie = incomingHeaders.get("cookie");
  const authorization = incomingHeaders.get("authorization");

  if (cookie) {
    requestHeaders.set("cookie", cookie);
  }

  if (authorization) {
    requestHeaders.set("authorization", authorization);
  }

  if (
    requestOptions.body &&
    !(requestOptions.body instanceof FormData)
  ) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(url.toString(), {
    ...requestOptions,
    headers: requestHeaders,
    cache: requestOptions.cache ?? "no-store",
  });

  const contentType = response.headers.get("content-type");

  const data: unknown = contentType?.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

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

    console.error("Server API request failed", {
      endpoint: url.toString(),
      method: requestOptions.method ?? "GET",
      status: response.status,
      response: data,
    });

    throw new AppError(message, response.status);
  }

  return data as T;
}