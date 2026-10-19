/**
 * Standardized API response helpers.
 *
 * All API routes should use these helpers to ensure consistent response shapes:
 *
 * Success: { success: true,  message: string, data?: T }
 * Error:   { success: false, message: string, error?: string }
 */
import { NextResponse } from "next/server";

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  message: string;
  data?: T;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  error?: string;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Create a successful JSON response.
 */
export function successResponse<T>(
  data?: T,
  message = "Success",
  status = 200
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    { success: true as const, message, data },
    { status }
  );
}

/**
 * Create an error JSON response.
 *
 * @param message  User-facing error message
 * @param status   HTTP status code (default 500)
 * @param error    Optional internal error detail (omitted in production for security)
 */
export function errorResponse(
  message: string,
  status = 500,
  error?: string
): NextResponse<ApiErrorResponse> {
  const body: ApiErrorResponse = { success: false, message };

  // Only include internal error detail in development
  if (error && process.env.NODE_ENV !== "production") {
    body.error = error;
  }

  return NextResponse.json(body, { status });
}
