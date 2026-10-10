"use client";

import { Lock, LockOpen } from "lucide-react";
import { imageUrl, type Item, type StyledOutfit } from "@/lib/api";
import { cn } from "@/lib/utils";

// "baggy · full · mid rise": the fit tags worth showing, skipping unknown ones.
function fitLabel(item: Item) {
  const parts = [
    item.silhouette !== "unknown" && item.silhouette !== "regular" ? item.silhouette : null,
    item.length !== "unknown" && item.length !== "regular" ? item.length : null,
    item.rise && item.rise !== "n_a" ? `${item.rise} rise` : null,
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ").replace(/_/g, " ") : (item.subtype ?? item.category ?? "");
}

type PieceProps = {
  item: Item;
  locked: boolean;
  onTap: (item: Item) => void;
  onToggleLock: (item: Item) => void;
};

function Piece({ item, locked, onTap, onToggleLock }: PieceProps) {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <button
        onClick={() => onTap(item)}
        className="flex min-h-0 w-full flex-col items-center gap-1 rounded-xl active:scale-[0.97]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- images come from the API server */}
        <img
          src={imageUrl(item.cutout_path ?? item.image_path)}
          alt={item.subtype ?? item.category ?? "Clothing item"}
          className="min-h-0 w-full flex-1 object-contain drop-shadow-sm"
        />
        <span className="max-w-full truncate text-[10px] leading-tight text-muted-foreground">
          {fitLabel(item)}
        </span>
      </button>
      <button
        onClick={() => onToggleLock(item)}
        aria-pressed={locked}
        aria-label={locked ? `Unlock ${item.subtype}` : `Lock ${item.subtype}`}
        className={cn(
          "absolute -top-1 -right-1 flex size-9 items-center justify-center rounded-full shadow-sm transition-colors",
          locked ? "bg-foreground text-background" : "bg-background/85 text-muted-foreground",
        )}
      >
        {locked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
      </button>
    </div>
  );
}

type Props = {
  styled: StyledOutfit;
  lockedIds: number[];
  onTapItem: (item: Item) => void;
  onToggleLock: (item: Item) => void;
};

// Flat-lay: outerwear and top up top, bottom in the middle, shoes at the bottom, accessories to the side.
export function OutfitCard({ styled, lockedIds, onTapItem, onToggleLock }: Props) {
  const { outfit, items } = styled;
  const of = (category: string) => items.filter((i) => i.category === category);
  const piece = (item: Item) => (
    <Piece
      key={item.id}
      item={item}
      locked={lockedIds.includes(item.id)}
      onTap={onTapItem}
      onToggleLock={onToggleLock}
    />
  );
  const accessories = of("accessory");

  return (
    <article className="overflow-hidden rounded-3xl border bg-background">
      <div className="flex aspect-[4/5] gap-2 bg-[#F5F5F3] p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex min-h-0 flex-[3] gap-3">{[...of("outerwear"), ...of("top")].map(piece)}</div>
          <div className="flex min-h-0 flex-[3.2] justify-center">{of("bottom").map(piece)}</div>
          <div className="flex min-h-0 flex-[1.6] justify-center">{of("shoes").map(piece)}</div>
        </div>
        {accessories.length > 0 && (
          <div className="flex w-1/4 flex-col justify-center gap-3">{accessories.map(piece)}</div>
        )}
      </div>
      <div className="px-4 py-3">
        <h2 className="text-lg font-semibold">{outfit.name}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{outfit.reason}</p>
      </div>
    </article>
  );
}
