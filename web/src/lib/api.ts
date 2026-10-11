import { getLocation } from "@/lib/location";

export type User = {
  id: number;
  name: string;
  avatar: string | null;
  full_body_photo: string | null; // what "See it on me" renders outfits on
};

// Same vocabularies as api/gemini.py; the API rejects anything else.
export const CATEGORIES = ["top", "bottom", "shoes", "outerwear", "accessory"] as const;
export const STYLES = ["streetwear", "casual", "smart_casual", "formal", "athletic"] as const;
export const SEASONS = ["warm", "cold", "all"] as const;
export const WEATHER = ["rain", "snow"] as const;
export const SILHOUETTES = [
  "slim",
  "straight",
  "relaxed",
  "baggy",
  "wide_leg",
  "boxy",
  "oversized",
  "regular",
  "unknown",
] as const;
export const LENGTHS = ["cropped", "regular", "full", "stacked", "unknown"] as const;
export const RISES = ["low", "mid", "high", "n_a"] as const;
export const FIT_FIELDS = ["silhouette", "length", "rise"] as const;

export type Category = (typeof CATEGORIES)[number];

export type Item = {
  id: number;
  owner_id: number;
  image_path: string;
  cutout_path: string | null;
  onbody_path: string | null;
  category: Category | null;
  subtype: string | null;
  colors: string[];
  style: (typeof STYLES)[number] | null;
  formality: number | null;
  season: (typeof SEASONS)[number] | null;
  warmth: number | null;
  weather_ok: (typeof WEATHER)[number][];
  silhouette: (typeof SILHOUETTES)[number] | null;
  length: (typeof LENGTHS)[number] | null;
  rise: (typeof RISES)[number] | null;
  custom_tags: string[];
  fit_confirmed: boolean;
  user_edited: boolean;
  edited_fields: string[];
  needs_retake: boolean;
  shared: boolean;
  created_at: string;
};

export type ItemUpdate = Partial<
  Pick<
    Item,
    | "category"
    | "subtype"
    | "colors"
    | "style"
    | "formality"
    | "season"
    | "warmth"
    | "weather_ok"
    | "silhouette"
    | "length"
    | "rise"
    | "custom_tags"
    | "fit_confirmed"
    | "shared"
  >
>;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Same origin: next.config.ts proxies /api/* to the FastAPI server (and /static/* for images).
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export function getUsers() {
  return request<User[]>("/users");
}

export function getItems(ownerId: number) {
  return request<Item[]>(`/items?owner_id=${ownerId}`);
}

// A garment Gemini found in a photo, waiting for the user to keep or skip it.
export type Detection = {
  index: number;
  preview_path: string;
  visibility: "full" | "partial";
  overlapping: boolean;
  tags: { category: Category; subtype: string } | null;
};

export type UploadResult = {
  upload_id: string;
  photo_type: "flat_lay" | "on_body" | "hanger" | "product";
  items: Item[]; // added right away (one clean garment)
  detections: Detection[]; // several garments or overlap: user picks which to add
};

export function uploadPhoto(ownerId: number, file: File) {
  const form = new FormData();
  form.append("file", file);
  form.append("owner_id", String(ownerId));
  return request<UploadResult>("/uploads", { method: "POST", body: form });
}

export function confirmUpload(uploadId: string, indexes: number[]) {
  return request<Item[]>(`/uploads/${uploadId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ indexes }),
  });
}

export function updateItem(id: number, changes: ItemUpdate) {
  return request<Item>(`/items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
}

export function retagItem(id: number) {
  return request<Item>(`/items/${id}/retag`, { method: "POST" });
}

export function deleteItem(id: number) {
  return request<{ deleted: number }>(`/items/${id}`, { method: "DELETE" });
}

// Throw away a photo whose "Found N items" sheet was cancelled.
export function discardUpload(uploadId: string) {
  return request<{ deleted: string }>(`/uploads/${uploadId}`, { method: "DELETE" });
}

// ---------- Stylist (stage 2) ----------

export type Outfit = {
  id: number;
  user_id: number;
  request: string;
  name: string;
  reason: string;
  item_ids: number[];
  locked_item_ids: number[];
  borrowed_item_ids: number[]; // pieces that belong to a friend
  render_path: string | null; // "See it on me" preview, once made
  created_at: string;
};

// An outfit with its items expanded, in the same order as item_ids.
export type StyledOutfit = { outfit: Outfit; items: Item[] };

export type Alternative = { item: Item; score: number; notes: string[] };

// Takes ~15-40s with the real stylist. Sends the phone's location (if allowed) for local weather.
export async function styleOutfits(userId: number, text: string, lockedItemIds: number[]) {
  const location = await getLocation();
  return request<StyledOutfit[]>("/stylist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, request: text, locked_item_ids: lockedItemIds, location }),
  });
}

export async function getAlternatives(itemId: number, outfitId: number) {
  const location = await getLocation();
  const where = location ? `&lat=${location.latitude}&lon=${location.longitude}` : "";
  return request<Alternative[]>(`/items/${itemId}/alternatives?outfit_id=${outfitId}${where}`);
}

export function swapItem(outfitId: number, oldItemId: number, newItemId: number) {
  return request<StyledOutfit>(`/outfits/${outfitId}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ old_item_id: oldItemId, new_item_id: newItemId }),
  });
}

// ---------- See it on me (stage 3) ----------

export function uploadBodyPhoto(userId: number, file: File) {
  const form = new FormData();
  form.append("file", file);
  return request<User>(`/users/${userId}/photo`, { method: "POST", body: form });
}

// ~10-20s with Nano Banana; instant when a render is already saved (unless force).
export function renderOutfit(outfitId: number, force = false) {
  return request<StyledOutfit>(`/outfits/${outfitId}/render${force ? "?force=true" : ""}`, { method: "POST" });
}

// ---------- Social (stage 4) ----------

export type Group = { id: number; name: string; kind: "dorm" | "club" | "friends" };
export type GroupWithMembers = { group: Group; members: User[] };
export type SharedItem = { item: Item; owner_name: string };

export type BorrowStatus = "pending" | "accepted" | "declined" | "returned";

export type BorrowRequest = {
  id: number;
  item_id: number;
  from_user: number; // borrower
  to_user: number; // owner
  status: BorrowStatus;
  date_needed: string | null; // YYYY-MM-DD
  note: string | null;
  created_at: string;
};

// A request with its item and both names.
export type Borrow = { request: BorrowRequest; item: Item; from_name: string; to_name: string };
export type BorrowLists = { incoming: Borrow[]; outgoing: Borrow[] };

export function getFriends(userId: number) {
  return request<User[]>(`/users/${userId}/friends`);
}

export function getGroups(userId: number) {
  return request<GroupWithMembers[]>(`/users/${userId}/groups`);
}

// Every shared item from the user's friends and groups.
export function getSharedCloset(userId: number) {
  return request<SharedItem[]>(`/closet/shared?user_id=${userId}`);
}

export function getBorrows(userId: number) {
  return request<BorrowLists>(`/borrow?user_id=${userId}`);
}

export function requestBorrow(itemId: number, fromUser: number, dateNeeded: string | null, note: string) {
  return request<Borrow>("/borrow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_id: itemId, from_user: fromUser, date_needed: dateNeeded, note }),
  });
}

export function updateBorrow(id: number, status: "accepted" | "declined" | "returned", userId: number) {
  return request<Borrow>(`/borrow/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, user_id: userId }),
  });
}
