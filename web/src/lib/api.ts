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

export type Item = {
  id: number;
  owner_id: number;
  image_path: string;
  cutout_path: string | null;
  category: string | null;
  subtype: string | null;
  colors: string[];
  style: string | null;
  formality: string | null;
  season: string | null;
  silhouette: string | null;
  length: string | null;
  rise: string | null;
  fit_confirmed: boolean;
  shared: boolean;
  created_at: string;
};

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

export function uploadItem(ownerId: number, file: File) {
  const form = new FormData();
  form.append("file", file);
  form.append("owner_id", String(ownerId));
  return request<Item>("/items", { method: "POST", body: form });
}
