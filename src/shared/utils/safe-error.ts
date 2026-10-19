import { AppError } from "../api/api-error";

export function safeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof Error) {
    return new AppError(error.message, 500);
  }
  return new AppError("An unexpected error occurred", 500);
}
