"use client";

import { Lock, LockOpen, RefreshCw, Sparkles } from "lucide-react";
import type { BorrowStatus, Item, StyledOutfit } from "@/lib/api";
import { useBorrows } from "@/components/borrow-context";
import { useUser } from "@/components/user-context";
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
  unavailable: boolean; // unshared or lent to someone else since the outfit was made
  // Set for a friend's piece: whose it is and how far the borrow request got.
  borrow: { owner: string; status: BorrowStatus | null; onRequest: () => void } | null;
  onTap: (item: Item) => void;
  onToggleLock: (item: Item) => void;
};

function Piece({ item, locked, unavailable, borrow, onTap, onToggleLock }: PieceProps) {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <button
        onClick={() => onTap(item)}
        className="flex min-h-0 w-full flex-col items-center gap-1 rounded-xl active:scale-[0.97]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- images come from the API server */}
        <img
          src={item.cutout_path ?? item.image_path}
          alt={item.subtype ?? item.category ?? "Clothing item"}
          className={cn("min-h-0 w-full flex-1 object-contain drop-shadow-sm", unavailable && "opacity-35 grayscale")}
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
      {unavailable ? (
        <span className="absolute -top-1 -left-1 h-7 rounded-full bg-background/90 px-2 text-[11px] leading-7 font-medium text-muted-foreground shadow-sm">
          Unavailable
        </span>
      ) : borrow && (
        <button
          onClick={borrow.onRequest}
          className={cn(
            "absolute -top-1 -left-1 h-7 max-w-[calc(100%-2rem)] truncate rounded-full px-2 text-[11px] font-medium shadow-sm",
            borrow.status === "accepted"
              ? "bg-emerald-600 text-white"
              : borrow.status === "pending"
                ? "bg-amber-100 text-amber-800"
                : "bg-background/90 text-foreground",
          )}
        >
          {borrow.status === "accepted"
            ? "Borrowed"
            : borrow.status === "pending"
              ? "Requested"
              : <>Borrow from <span className="capitalize">{borrow.owner}</span></>}
        </button>
      )}
    </div>
  );
}

type Props = {
  styled: StyledOutfit;
  lockedIds: number[];
  onTapItem: (item: Item) => void;
  onToggleLock: (item: Item) => void;
  onSeeOnMe: () => void;
  onRestyle: () => void; // when a piece isn't available anymore
};

// Flat-lay: outerwear and top up top, bottom in the middle, shoes at the bottom, accessories to the side.
export function OutfitCard({ styled, lockedIds, onTapItem, onToggleLock, onSeeOnMe, onRestyle }: Props) {
  const { outfit, items, unavailable_item_ids: unavailable } = styled;
  const { users } = useUser();
  const { statusFor, askToBorrow } = useBorrows();
  const of = (category: string) => items.filter((i) => i.category === category);
  const piece = (item: Item) => (
    <Piece
      key={item.id}
      item={item}
      locked={lockedIds.includes(item.id)}
      unavailable={unavailable.includes(item.id)}
      borrow={
        item.owner_id === outfit.user_id
          ? null
          : {
              owner: users.find((u) => u.id === item.owner_id)?.name ?? "a friend",
              status: statusFor(item.id),
              onRequest: () => askToBorrow(item),
            }
      }
      onTap={onTapItem}
      onToggleLock={onToggleLock}
    />
  );
  const accessories = of("accessory");

  return (
    <article className="overflow-hidden rounded-3xl border bg-background">
      <div className="flex aspect-[4/5] gap-2 garment-surface p-4">
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
        {unavailable.length > 0 ? (
          <>
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              {unavailable.length === 1 ? "A piece isn't" : "Some pieces aren't"} available anymore. Tap a
              piece to swap it, or restyle.
            </p>
            <button
              onClick={onRestyle}
              className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-muted font-medium active:scale-[0.98]"
            >
              <RefreshCw className="size-4" />
              Restyle
            </button>
          </>
        ) : (
          <button
            onClick={onSeeOnMe}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-muted font-medium active:scale-[0.98]"
          >
            <Sparkles className="size-4" />
            See it on me
          </button>
        )}
      </div>
    </article>
  );
}
