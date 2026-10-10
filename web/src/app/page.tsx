"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Shirt } from "lucide-react";
import { getItems, imageUrl, uploadItem, type Item } from "@/lib/api";
import { useUser } from "@/components/user-context";

export default function ClosetPage() {
  const { currentUser } = useUser();
  // Keyed by owner so switching users never flashes the previous user's closet.
  const [closet, setCloset] = useState<{ ownerId: number; items: Item[] } | null>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const items = closet && closet.ownerId === currentUser?.id ? closet.items : null;

  useEffect(() => {
    if (!currentUser) return;
    let stale = false;
    getItems(currentUser.id)
      .then((list) => {
        if (stale) return;
        setCloset({ ownerId: currentUser.id, items: list });
        setError(null);
      })
      .catch((err) => !stale && setError(err.message));
    return () => {
      stale = true;
    };
  }, [currentUser]);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow picking the same photos again
    if (files.length === 0 || !currentUser) return;

    setError(null);
    let failed = 0;
    // One at a time: keeps the phone's connection and the API's image processing calm.
    for (const [i, file] of files.entries()) {
      setUploading({ done: i, total: files.length });
      try {
        const item = await uploadItem(currentUser.id, file);
        setCloset((prev) =>
          prev?.ownerId === item.owner_id ? { ...prev, items: [item, ...prev.items] } : prev,
        );
      } catch {
        failed++;
      }
    }
    setUploading(null);
    if (failed) setError(`${failed} of ${files.length} photos couldn't be uploaded.`);
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold capitalize">
        {currentUser ? `${currentUser.name}'s closet` : "Closet"}
      </h1>

      {error && (
        <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {items === null && !error ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : items?.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <Shirt className="size-10" />
          <p>No clothes yet.</p>
          <p className="text-sm">Tap + to snap a photo or pick from your library.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {items?.map((item) => (
            <li key={item.id} className="aspect-square overflow-hidden rounded-xl bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- images come from the API server */}
              <img
                src={imageUrl(item.cutout_path ?? item.image_path)}
                alt={item.subtype ?? item.category ?? "Clothing item"}
                className="size-full object-cover"
              />
            </li>
          ))}
        </ul>
      )}

      {/* No `capture` attribute: the phone offers Take Photo, Photo Library, or Files. */}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
      {uploading && uploading.total > 1 && (
        <p className="fixed right-[max(1rem,calc(50vw-14rem+1rem))] bottom-[calc(10rem+env(safe-area-inset-bottom))] z-20 rounded-full bg-foreground px-3 py-1.5 text-sm text-background shadow">
          Uploading {uploading.done + 1} of {uploading.total}…
        </p>
      )}
      <button
        onClick={() => fileInput.current?.click()}
        disabled={uploading !== null || !currentUser}
        aria-label="Add clothing"
        className="fixed right-[max(1rem,calc(50vw-14rem+1rem))] bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 disabled:opacity-60"
      >
        {uploading ? <Loader2 className="size-7 animate-spin" /> : <Plus className="size-8" />}
      </button>
    </div>
  );
}
