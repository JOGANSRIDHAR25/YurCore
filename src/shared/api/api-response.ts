import { NextResponse } from "next/server";

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: {
    code?: string;
    details?: unknown;
  };
}

export function apiSuccess<T>(data: T, message: string = "Success", status: number = 200) {
  const response: ApiResponse<T> = {
    success: true,
    message,
    data,
  };
  return NextResponse.json(response, { status });
}

export function apiError(message: string, status: number = 500, errorCode?: string, details?: unknown) {
  const response: ApiResponse = {
    success: false,
    message,
    error: {
      code: errorCode || "INTERNAL_ERROR",
      details,
    },
  };
  return NextResponse.json(response, { status });
}
