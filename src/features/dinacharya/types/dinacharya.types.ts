/**
 * Dinacharya (daily routine) types.
 */

export interface DinacharTask {
  id: string;
  time: string;
  title: string;
  description: string;
  done: boolean;
  category: "diet" | "exercise" | "mindfulness" | "medicine";
}
