"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Shirt } from "lucide-react";
import {
  confirmUpload,
  discardUpload,
  getItems,
  uploadPhoto,
  type Category,
  type Item,
  type UploadResult,
} from "@/lib/api";
import { CategoryFilter, FILTERS } from "@/components/category-filter";
import { DetectionsSheet, type ReviewOutcome } from "@/components/detections-sheet";
import { ItemSheet } from "@/components/item-sheet";
import { useUser } from "@/components/user-context";
import { cn } from "@/lib/utils";

export default function ClosetPage() {
  const { currentUser } = useUser();
  // Keyed by owner so switching users never flashes the previous user's closet.
  const [closet, setCloset] = useState<{ ownerId: number; items: Item[] } | null>(null);
  // Photo `done` of `total` is being analyzed, reviewed by the user, or cut out (`adding` items).
  const [uploading, setUploading] = useState<{
    done: number;
    total: number;
    step: "analyzing" | "reviewing" | "adding";
    adding?: number;
  } | null>(null);
  const [review, setReview] = useState<{
    upload: UploadResult;
    resolve: (outcome: ReviewOutcome) => void;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Category | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const items = closet && closet.ownerId === currentUser?.id ? closet.items : null;
  const visible = items?.filter((item) => !filter || item.category === filter);
  // Kept after the sheet closes so its content doesn't vanish mid-animation.
  const selected = items?.find((item) => item.id === selectedId) ?? null;

  function removeItem(deleted: Item) {
    setSheetOpen(false);
    setCloset((prev) =>
      prev?.ownerId === deleted.owner_id
        ? { ...prev, items: prev.items.filter((item) => item.id !== deleted.id) }
        : prev,
    );
  }

  function replaceItem(updated: Item) {
    setCloset((prev) =>
      prev?.ownerId === updated.owner_id
        ? { ...prev, items: prev.items.map((item) => (item.id === updated.id ? updated : item)) }
        : prev,
    );
  }

  function addItems(added: Item[]) {
    if (added.length === 0) return;
    setCloset((prev) =>
      prev?.ownerId === added[0].owner_id ? { ...prev, items: [...added, ...prev.items] } : prev,
    );
  }

  // Shows the "Found N items" sheet and waits for the user's choice.
  function askUser(upload: UploadResult) {
    return new Promise<ReviewOutcome>((resolve) => setReview({ upload, resolve }));
  }

  function finishReview(outcome: ReviewOutcome) {
    // Open the picker inside the tap itself; phones block file dialogs opened later.
    if (outcome === "retake") fileInput.current?.click();
    review?.resolve(outcome);
    setReview(null);
  }

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
    const errors: string[] = [];
    // One at a time: keeps the phone's connection and the API's image processing calm.
    for (const [i, file] of files.entries()) {
      const progress = { done: i, total: files.length };
      setUploading({ ...progress, step: "analyzing" });
      try {
        const result = await uploadPhoto(currentUser.id, file);
        addItems(result.items);
        if (result.detections.length === 0) continue;

        // Several garments (or overlap): the user picks which ones become items.
        setUploading({ ...progress, step: "reviewing" });
        const outcome = await askUser(result);
        if (outcome === "retake" || outcome === "skip") {
          discardUpload(result.upload_id).catch(() => {}); // only frees disk space; fine if it fails
          if (outcome === "retake") break; // the picker is already open for the new photo
          continue;
        }
        setUploading({ ...progress, step: "adding", adding: outcome.add.length });
        addItems(await confirmUpload(result.upload_id, outcome.add));
      } catch (err) {
        errors.push((err as Error).message);
      }
    }
    setUploading(null);
    if (errors.length === 1) setError(errors[0]);
    else if (errors.length > 1) setError(`${errors.length} of ${files.length} photos couldn't be added.`);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">
        {currentUser ? (
          <>
            <span className="capitalize">{currentUser.name}</span>&apos;s Rack
          </>
        ) : (
          "Your Rack"
        )}
      </h1>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        Best results: one item, laid flat on the floor on a plain, solid background.
      </p>

      {error && (
        <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <CategoryFilter value={filter} onChange={setFilter} />

      {items === null && !error ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : items?.length === 0 && !uploading ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <Shirt className="size-10" />
          <p>No clothes yet.</p>
          <p className="text-sm">Tap + to snap a photo or pick from your library.</p>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3">
            {/* Photos still being processed (background removal + tagging take a few seconds each). */}
            {pendingTiles(uploading).map((tile, i) => (
              <li
                key={`pending-${i}`}
                className={cn(
                  "flex aspect-square flex-col items-center justify-center gap-2 rounded-xl p-3 text-center text-xs text-muted-foreground",
                  tile.busy ? "shimmer" : "bg-surface",
                )}
              >
                {tile.busy && <Loader2 className="size-6 animate-spin" />}
                {tile.label}
              </li>
            ))}
            {visible?.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => {
                    setSelectedId(item.id);
                    setSheetOpen(true);
                  }}
                  className="relative block aspect-square w-full overflow-hidden rounded-xl garment-surface active:scale-[0.98]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- images come from the API server */}
                  <img
                    src={item.cutout_path ?? item.image_path}
                    alt={item.subtype ?? item.category ?? "Clothing item"}
                    className={cn("size-full", item.cutout_path ? "object-contain p-4" : "object-cover")}
                  />
                  {item.needs_retake && (
                    <span className="absolute bottom-2 left-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      retake
                    </span>
                  )}
                  {!item.fit_confirmed && (
                    <span
                      className="absolute top-2.5 right-2.5 size-2.5 rounded-full bg-amber-500 ring-2 ring-[#F5F5F3]"
                      aria-label="Fit not confirmed yet"
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
          {visible?.length === 0 && !uploading && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No {FILTERS.find((f) => f.category === filter)?.label.toLowerCase()} yet.
            </p>
          )}
        </>
      )}

      <DetectionsSheet upload={review?.upload ?? null} onDone={finishReview} />
      <ItemSheet
        item={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onItemChange={replaceItem}
        onItemDeleted={removeItem}
      />

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
          Processing {uploading.done + 1} of {uploading.total}…
        </p>
      )}
      <button
        onClick={() => fileInput.current?.click()}
        disabled={uploading !== null || !currentUser}
        aria-label="Add clothing"
        className="fixed right-[max(1rem,calc(50vw-14rem+1rem))] bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 flex size-16 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg active:scale-95 disabled:opacity-60"
      >
        {uploading ? <Loader2 className="size-7 animate-spin" /> : <Plus className="size-8" />}
      </button>
    </div>
  );
}

// Placeholder tiles while photos are processed: the current step, then one per queued photo.
function pendingTiles(
  uploading: { done: number; total: number; step: string; adding?: number } | null,
): { label: string; busy: boolean }[] {
  if (!uploading) return [];
  const current =
    uploading.step === "analyzing"
      ? [{ label: "Finding clothes…", busy: true }]
      : uploading.step === "adding"
        ? Array.from({ length: uploading.adding ?? 1 }, () => ({ label: "Cutting out…", busy: true }))
        : [];
  const queued = Array.from({ length: uploading.total - uploading.done - 1 }, () => ({
    label: "Waiting…",
    busy: false,
  }));
  return [...current, ...queued];
}
