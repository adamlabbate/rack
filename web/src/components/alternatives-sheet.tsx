"use client";

import { useEffect, useState } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { Loader2 } from "lucide-react";
import { BottomSheet, SheetHeader } from "@/components/bottom-sheet";
import { getAlternatives, type Alternative, type Item } from "@/lib/api";
import { useUser } from "@/components/user-context";
import { cn } from "@/lib/utils";

const PLURAL: Record<string, string> = {
  top: "tops",
  bottom: "bottoms",
  shoes: "shoes",
  outerwear: "outerwear",
  accessory: "accessories",
};

type Props = {
  target: { outfitId: number; item: Item } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (outfitId: number, oldItem: Item, newItem: Item) => Promise<void>;
};

// Tap a piece of an outfit: other items of the same category, ranked by the API.
export function AlternativesSheet({ target, open, onOpenChange, onPick }: Props) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      {target && (
        <SheetBody key={`${target.outfitId}-${target.item.id}`} {...target} onPick={onPick} />
      )}
    </BottomSheet>
  );
}

function SheetBody({ outfitId, item, onPick }: { outfitId: number; item: Item; onPick: Props["onPick"] }) {
  const [alternatives, setAlternatives] = useState<Alternative[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [swapping, setSwapping] = useState<number | null>(null);
  const { users, currentUser } = useUser();
  const ownerOf = (alt: Alternative) =>
    alt.item.owner_id === currentUser?.id ? null : users.find((u) => u.id === alt.item.owner_id)?.name;

  const useDevice = !currentUser?.location_city;

  useEffect(() => {
    getAlternatives(item.id, outfitId, useDevice)
      .then(setAlternatives)
      .catch((err) => setError(err.message));
  }, [item.id, outfitId, useDevice]);

  async function pick(alt: Alternative) {
    setSwapping(alt.item.id);
    setError(null);
    try {
      await onPick(outfitId, item, alt.item);
    } catch (err) {
      setError((err as Error).message);
      setSwapping(null);
    }
  }

  const category = PLURAL[item.category ?? ""] ?? "items";

  return (
    <>
      <SheetHeader />
      <div className="overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <Drawer.Title className="text-xl font-semibold">Swap {item.subtype ?? item.category}</Drawer.Title>
        <p className="mt-1 text-sm text-muted-foreground">
          Other {category} from your Rack and your friends&apos;, best match for this outfit first.
        </p>

        {error && (
          <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        {alternatives === null && !error ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : alternatives?.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No other {category} on your Rack yet.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {alternatives?.map((alt) => (
              <li key={alt.item.id}>
                <button
                  onClick={() => pick(alt)}
                  disabled={swapping !== null}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border p-2 text-left active:bg-muted disabled:opacity-60",
                    swapping === alt.item.id && "disabled:opacity-100",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- images come from the API server */}
                  <img
                    src={alt.item.cutout_path ?? alt.item.image_path}
                    alt={alt.item.subtype ?? "Clothing item"}
                    className="size-20 shrink-0 rounded-xl garment-surface object-contain p-1.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium capitalize">
                      {[alt.item.colors[0], alt.item.subtype].filter(Boolean).join(" ")}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {ownerOf(alt) && (
                        <span className="rounded-full bg-foreground px-2 py-0.5 text-xs text-background capitalize">
                          {ownerOf(alt)}&apos;s
                        </span>
                      )}
                      {alt.notes.map((note) => (
                        <span key={note} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {note}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="shrink-0 pr-2 text-sm font-medium tabular-nums">
                    {swapping === alt.item.id ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : (
                      `${Math.round(alt.score * 100)}%`
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
