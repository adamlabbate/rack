"use client";

import { useState } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { Check, Layers } from "lucide-react";
import { BottomSheet, SheetHeader } from "@/components/bottom-sheet";
import type { UploadResult } from "@/lib/api";
import { cn } from "@/lib/utils";

export type ReviewOutcome = { add: number[] } | "retake" | "skip";

type Props = {
  upload: UploadResult | null;
  onDone: (outcome: ReviewOutcome) => void;
};

// "Found N items": pick which garments from one photo to add to the closet.
export function DetectionsSheet({ upload, onDone }: Props) {
  return (
    <BottomSheet open={upload !== null} onOpenChange={(open) => !open && onDone("skip")}>
      {upload && <ReviewBody key={upload.upload_id} upload={upload} onDone={onDone} />}
    </BottomSheet>
  );
}

function ReviewBody({ upload, onDone }: { upload: UploadResult; onDone: (outcome: ReviewOutcome) => void }) {
  const { detections } = upload;
  const [checked, setChecked] = useState(() => new Set(detections.map((d) => d.index)));
  const [showOverlap, setShowOverlap] = useState(false);

  const chosen = detections.filter((d) => checked.has(d.index));
  const anyOverlap = chosen.some((d) => d.overlapping);

  function toggle(index: number) {
    setShowOverlap(false);
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const add = () => onDone({ add: chosen.map((d) => d.index) });

  return (
    <>
      <SheetHeader>
        <Drawer.Close className="flex h-11 items-center rounded-full px-4 text-base text-muted-foreground">
          Cancel
        </Drawer.Close>
      </SheetHeader>

      <Drawer.Content className="min-h-0 flex-1 touch-auto overflow-y-auto overscroll-contain px-4">
        <Drawer.Title className="text-xl font-semibold">
          Found {detections.length} {detections.length === 1 ? "item" : "items"}
        </Drawer.Title>
        <Drawer.Description className="mt-1 text-sm text-muted-foreground">
          Uncheck anything you don&apos;t want on your Rack.
        </Drawer.Description>

        <ul className="mt-4 grid grid-cols-2 gap-3 pb-4">
          {detections.map((d) => {
            const on = checked.has(d.index);
            return (
              <li key={d.index}>
                <button
                  onClick={() => toggle(d.index)}
                  aria-pressed={on}
                  className={cn(
                    "relative block w-full overflow-hidden rounded-xl garment-surface text-left ring-2 transition",
                    on ? "ring-primary" : "opacity-60 ring-transparent",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- images come from the API server */}
                  <img
                    src={d.preview_path}
                    alt={d.tags?.subtype ?? "Detected item"}
                    className="aspect-square w-full object-contain"
                  />
                  <span
                    className={cn(
                      "absolute top-2 right-2 flex size-7 items-center justify-center rounded-full border-2",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-white bg-white/70",
                    )}
                  >
                    {on && <Check className="size-4" />}
                  </span>
                  <div className="bg-background px-2 py-1.5">
                    <p className="truncate text-sm font-medium capitalize">{d.tags?.subtype ?? "Item"}</p>
                    <p className="text-xs text-muted-foreground">
                      {[d.visibility === "partial" && "partly hidden", d.overlapping && "overlaps"]
                        .filter(Boolean)
                        .join(" · ") || d.tags?.category}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </Drawer.Content>

      <div className="shrink-0 border-t px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {showOverlap ? (
          <div>
            <p className="flex items-start gap-2 text-sm">
              <Layers className="mt-0.5 size-4 shrink-0" />
              These items overlap. Lay them out separately for clean cutouts.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => onDone("retake")}
                className="h-12 rounded-full bg-primary text-base font-medium text-primary-foreground"
              >
                Retake
              </button>
              <button onClick={add} className="h-12 rounded-full bg-muted text-base font-medium">
                Add anyway
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => (anyOverlap ? setShowOverlap(true) : add())}
            disabled={chosen.length === 0}
            className="h-12 w-full rounded-full bg-primary text-base font-medium text-primary-foreground disabled:opacity-40"
          >
            {chosen.length === 0
              ? "Pick at least one"
              : `Add ${chosen.length} ${chosen.length === 1 ? "item" : "items"}`}
          </button>
        )}
      </div>
    </>
  );
}
