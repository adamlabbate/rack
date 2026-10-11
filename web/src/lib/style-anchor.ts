import type { Item } from "@/lib/api";

// "Style this piece": the item sheet leaves the piece here and navigates to the Style tab, which takes it
// on mount. A module variable rather than ?item= in the URL: the Style page already has the whole item.
let pending: Item | null = null;

export function styleAround(item: Item) {
  pending = item;
}

export function takeAnchor() {
  const item = pending;
  pending = null;
  return item;
}
