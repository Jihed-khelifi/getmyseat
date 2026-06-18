import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * `cn` merges conditional class names (clsx) and de-duplicates conflicting
 * Tailwind utilities (tailwind-merge). This is the shadcn/ui convention and is
 * the single class-composition helper used across components.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
