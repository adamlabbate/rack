"use client";

import type { Category } from "@/lib/api";
import { cn } from "@/lib/utils";

export const FILTERS: { label: string; category: Category | null }[] = [
  { label: "All", category: null },
  { label: "Tops", category: "top" },
  { label: "Bottoms", category: "bottom" },
  { label: "Shoes", category: "shoes" },
  { label: "Outerwear", category: "outerwear" },
  { label: "Accessories", category: "accessory" },
];

// Horizontally scrolling category chips above a closet grid.
export function CategoryFilter({
  value,
  onChange,
}: {
  value: Category | null;
  onChange: (category: Category | null) => void;
}) {
  return (
    <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
      {FILTERS.map(({ label, category }) => (
        <button
          key={label}
          onClick={() => onChange(category)}
          aria-pressed={value === category}
          className={cn(
            "h-10 shrink-0 rounded-full px-4 text-sm font-medium transition-colors",
            value === category ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
