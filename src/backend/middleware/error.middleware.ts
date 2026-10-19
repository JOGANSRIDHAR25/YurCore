/**
 * Centralized error handling wrapper for API route controllers.
 */
import { NextRequest} from "next/server";
import { AppError } from "@/shared/api/api-error";
import { apiError } from "@/shared/api/api-response";
import { ZodError } from "zod";

type RouteHandler = (
  req: NextRequest,
  context?: unknown
) => Promise<Response>;

export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return async (req: NextRequest, context?: unknown) => {
    try {
      return await handler(req, context);
    } catch (error: unknown) {
      const statusCode = error instanceof AppError ? error.statusCode : 500;
      
      if (statusCode >= 500) {
        console.error(`[API Error] ${req.method} ${req.nextUrl.pathname}:`, error);
      }

      // Handle custom AppErrors
      if (error instanceof AppError) {
        return apiError(
          error.message,
          error.statusCode,
          error.constructor.name,
          'details' in error ? (error as { details: unknown }).details : undefined
        );
      }

      // Handle Zod Validation Errors
      if (error instanceof ZodError) {
        return apiError(
          "Validation Error",
          400,
          "ValidationError",
          error.issues
        );
      }

      // Fallback for unhandled/native errors
      return apiError(
        "An unexpected error occurred",
        500,
        "INTERNAL_ERROR"
      );
    }
  };
}
