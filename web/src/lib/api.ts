// The API runs on port 8000 of the same machine that serves the web app,
// so this works both on localhost and from a phone on the LAN.
export function apiBase() {
  return `http://${window.location.hostname}:8000`;
}

export function imageUrl(path: string) {
  return `${apiBase()}${path}`;
}

export type User = {
  id: number;
  name: string;
  avatar: string | null;
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
  >
>;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, init);
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
