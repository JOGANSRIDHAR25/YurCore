/**
 * Standardized API response types used across the application.
 */

/** Standard API success response */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  message: string;
  data?: T;
}

/** Standard API error response */
export interface ApiErrorResponse {
  success: false;
  message: string;
  error?: string;
}

/** Union type for any API response */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/** Paginated response wrapper */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
