/**
 * Shared utility functions.
 *
 * `cn` is required by shadcn/ui components and must stay here.
 */
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export { formatCurrency } from "@/lib/utils/format";
