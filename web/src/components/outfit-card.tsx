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
  order: number; // position in the flat-lay, for the staggered fade-in
  locked: boolean;
  unavailable: boolean; // unshared or lent to someone else since the outfit was made
  // Set for a friend's piece: whose it is and how far the borrow request got.
  borrow: { owner: string; status: BorrowStatus | null; onRequest: () => void } | null;
  onTap: (item: Item) => void;
  onToggleLock: (item: Item) => void;
};

function Piece({ item, order, locked, unavailable, borrow, onTap, onToggleLock }: PieceProps) {
  return (
    <div
      style={{ animationDelay: `${order * 90}ms` }}
      className="relative flex min-h-0 min-w-0 flex-1 animate-in fill-mode-both duration-500 ease-out fade-in slide-in-from-bottom-3 motion-reduce:animate-none"
    >
      <button
        onClick={() => onTap(item)}
        className="flex min-h-0 w-full flex-col items-center gap-1.5 rounded-xl transition-transform active:scale-[0.96]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- images come from the API server */}
        <img
          src={item.cutout_path ?? item.image_path}
          alt={item.subtype ?? item.category ?? "Clothing item"}
          className={cn("min-h-0 w-full flex-1 object-contain drop-shadow-sm", unavailable && "opacity-35 grayscale")}
        />
        <span className="max-w-full truncate text-[9px] leading-tight tracking-[0.14em] text-muted-foreground uppercase">
          {fitLabel(item)}
        </span>
      </button>
      <button
        onClick={() => onToggleLock(item)}
        aria-pressed={locked}
        aria-label={locked ? `Unlock ${item.subtype}` : `Lock ${item.subtype}`}
        className={cn(
          "absolute -top-1 -right-1 flex size-9 items-center justify-center rounded-full shadow-sm transition-[transform,background-color] active:scale-90",
          locked ? "bg-foreground text-background" : "bg-background/85 text-muted-foreground",
        )}
      >
        {/* Keyed so the icon pops in when the lock flips. */}
        <span key={String(locked)} className="animate-in duration-200 zoom-in-50 motion-reduce:animate-none">
          {locked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
        </span>
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
              ? "bg-background text-brand ring-1 ring-brand ring-inset"
              : borrow.status === "pending"
                ? "bg-brand-soft text-brand-soft-foreground"
                : "bg-brand text-brand-foreground",
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
  look?: number; // "Look 01": its place in the carousel
  lockedIds: number[];
  onTapItem: (item: Item) => void;
  onToggleLock: (item: Item) => void;
  onSeeOnMe: () => void;
  onRestyle: () => void; // when a piece isn't available anymore
};

// A lookbook page. Flat-lay: outerwear and top up top, bottom in the middle, shoes at the bottom,
// accessories to the side.
export function OutfitCard({ styled, look, lockedIds, onTapItem, onToggleLock, onSeeOnMe, onRestyle }: Props) {
  const { outfit, items, unavailable_item_ids: unavailable } = styled;
  const { users } = useUser();
  const { statusFor, askToBorrow } = useBorrows();
  const of = (category: string) => items.filter((i) => i.category === category);
  const accessories = of("accessory");
  // Fade pieces in top to bottom, the order you'd read the flat-lay.
  const order = [...of("outerwear"), ...of("top"), ...of("bottom"), ...of("shoes"), ...accessories];
  const piece = (item: Item) => (
    <Piece
      key={item.id}
      item={item}
      order={order.indexOf(item)}
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
  return (
    <article className="overflow-hidden rounded-3xl border bg-background">
      <div className="flex aspect-[3/4] gap-3 garment-surface px-5 pt-6 pb-5">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex min-h-0 flex-[3] gap-4">{[...of("outerwear"), ...of("top")].map(piece)}</div>
          <div className="flex min-h-0 flex-[3.4] justify-center">{of("bottom").map(piece)}</div>
          <div className="flex min-h-0 flex-[1.5] justify-center">{of("shoes").map(piece)}</div>
        </div>
        {accessories.length > 0 && (
          <div className="flex w-1/4 flex-col justify-center gap-4">{accessories.map(piece)}</div>
        )}
      </div>
      <div className="px-5 pt-4 pb-5">
        <p className="text-[10px] font-medium tracking-[0.2em] text-muted-foreground uppercase">
          {look ? `Look ${String(look).padStart(2, "0")} · ` : ""}
          {items.length} pieces
        </p>
        <h2 className="mt-1 text-2xl leading-tight font-semibold tracking-tight">{outfit.name}</h2>
        <p className="mt-1.5 text-sm leading-snug text-muted-foreground">{outfit.reason}</p>
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
