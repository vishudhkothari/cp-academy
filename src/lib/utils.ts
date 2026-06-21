import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Codeforces-style rating -> color band.
export function ratingColor(rating?: number | null): string {
  if (!rating) return "var(--muted)";
  if (rating < 1200) return "#9aa4b2";
  if (rating < 1400) return "#45c98a";
  if (rating < 1600) return "#46b9b0";
  if (rating < 1900) return "#5b8cff";
  if (rating < 2100) return "#b06bff";
  if (rating < 2400) return "#f0a13a";
  return "#ef5e6b";
}

export const AXES = [
  { key: "obs", label: "Observation", color: "var(--obs)", field: "obsDifficulty" },
  { key: "tech", label: "Technique", color: "var(--tech)", field: "techDifficulty" },
  { key: "impl", label: "Implementation", color: "var(--impl)", field: "implDifficulty" },
] as const;
