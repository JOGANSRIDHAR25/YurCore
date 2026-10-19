/**
 * Display formatting utilities (currency, numbers, text).
 */

/**
 * Format a number as Indian Rupees.
 * Example: 500 → "₹500"
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}
