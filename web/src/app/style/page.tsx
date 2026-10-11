"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, RefreshCw, Sparkles } from "lucide-react";
import { getOutfits, styleOutfits, swapItem, type Item, type StyledOutfit } from "@/lib/api";
import { AlternativesSheet } from "@/components/alternatives-sheet";
import { OutfitCard } from "@/components/outfit-card";
import { RenderSheet } from "@/components/render-sheet";
import { useUser } from "@/components/user-context";
import { cn } from "@/lib/utils";

const QUICK_PROMPTS = ["Class tomorrow", "Date night", "Career fair"];

// The stylist takes 15-40s; cycle through what it's actually doing so the wait reads as progress.
const THINKING = [
  "Looking through your Rack…",
  "Checking the weather…",
  "Matching fits and colors…",
  "Putting outfits together…",
  "Double-checking every outfit…",
];

// Only one of each can be locked (the API rejects two locked tops); accessories can stack.
const SINGLE = ["top", "bottom", "shoes", "outerwear"];

type Results = { userId: number; request: string; outfits: StyledOutfit[] };

// Survives switching tabs (the page unmounts), so the last outfits are still here on return.
let lastResults: Results | null = null;
let lastLocked: number[] = [];

export default function StylePage() {
  const { currentUser } = useUser();
  const [text, setText] = useState("");
  const [results, setResults] = useState<Results | null>(lastResults);
  const [lockedIds, setLockedIds] = useState<number[]>(lastLocked);
  const [loading, setLoading] = useState(false);
  const [thinking, setThinking] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0); // which card is in view
  const [target, setTarget] = useState<{ outfitId: number; item: Item } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [renderTarget, setRenderTarget] = useState<StyledOutfit | null>(null);
  const [renderOpen, setRenderOpen] = useState(false);
  const carousel = useRef<HTMLDivElement>(null);

  const mine = results && results.userId === currentUser?.id ? results : null;

  useEffect(() => {
    lastResults = results;
    lastLocked = lockedIds;
  }, [results, lockedIds]);

  // Coming back to this tab: pieces may have been edited, deleted or lent out in the meantime.
  useEffect(() => {
    if (!lastResults) return;
    const ids = lastResults.outfits.map((o) => o.outfit.id);
    getOutfits(ids)
      .then((fresh) =>
        setResults((prev) =>
          prev && {
            ...prev,
            outfits: prev.outfits.map((o) => fresh.find((f) => f.outfit.id === o.outfit.id) ?? o),
          },
        ),
      )
      .catch(() => {}); // keep what's on screen; it was right a moment ago
  }, []);

  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(() => setThinking((n) => (n + 1) % THINKING.length), 3500);
    return () => clearInterval(timer);
  }, [loading]);

  async function ask(request: string, locked: number[]) {
    if (!currentUser || !request.trim() || loading) return;
    setLoading(true);
    setThinking(0);
    setError(null);
    try {
      const outfits = await styleOutfits(currentUser.id, request.trim(), locked);
      setResults({ userId: currentUser.id, request: request.trim(), outfits });
      setActive(0);
      carousel.current?.scrollTo({ left: 0 });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function submit(request: string) {
    setText("");
    setLockedIds([]); // a new request starts fresh; Regenerate keeps the locks
    ask(request, []);
  }

  function regenerate() {
    if (!mine) return;
    // Only pieces still on screen and available: a locked item may have been swapped out or deleted since.
    const gone = new Set(mine.outfits.flatMap((o) => o.unavailable_item_ids));
    const shown = new Set(mine.outfits.flatMap((o) => o.outfit.item_ids).filter((id) => !gone.has(id)));
    ask(mine.request, lockedIds.filter((id) => shown.has(id)));
  }

  function toggleLock(item: Item) {
    setLockedIds((prev) => {
      if (prev.includes(item.id)) return prev.filter((id) => id !== item.id);
      if (!SINGLE.includes(item.category ?? "")) return [...prev, item.id];
      // Locking a second jacket replaces the first.
      const sameCategory = new Set(
        mine?.outfits.flatMap((o) => o.items).filter((i) => i.category === item.category).map((i) => i.id),
      );
      return [...prev.filter((id) => !sameCategory.has(id)), item.id];
    });
  }

  // Swaps and renders both come back as the updated outfit.
  function replaceOutfit(updated: StyledOutfit) {
    setResults((prev) =>
      prev && {
        ...prev,
        outfits: prev.outfits.map((o) => (o.outfit.id === updated.outfit.id ? updated : o)),
      },
    );
  }

  async function pickAlternative(outfitId: number, oldItem: Item, newItem: Item) {
    replaceOutfit(await swapItem(outfitId, oldItem.id, newItem.id));
    setLockedIds((prev) => prev.filter((id) => id !== oldItem.id));
    setSheetOpen(false);
  }

  function onScroll() {
    const el = carousel.current;
    const card = el?.firstElementChild as HTMLElement | null;
    if (!el || !card) return;
    setActive(Math.round(el.scrollLeft / (card.offsetWidth + 12)));
  }

  const lockedShown = mine
    ? lockedIds.filter((id) => mine.outfits.some((o) => o.outfit.item_ids.includes(id))).length
    : 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Style me</h1>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        Say where you&apos;re going. Gemini builds outfits from your Rack.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
        className="flex items-center gap-2 rounded-full border bg-background p-1.5 pl-4 focus-within:ring-2 focus-within:ring-ring/40"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Rainy day, lots of walking"
          enterKeyHint="go"
          disabled={loading}
          className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={loading || !text.trim() || !currentUser}
          aria-label="Style me"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
        >
          <ArrowUp className="size-5" />
        </button>
      </form>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => submit(prompt)}
            disabled={loading || !currentUser}
            className="h-10 shrink-0 rounded-full bg-muted px-4 text-sm font-medium active:scale-95 disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {loading ? (
        <div className="mt-6">
          <div role="status" className="flex aspect-[4/5] flex-col items-center justify-center gap-3 rounded-3xl bg-[#F5F5F3] text-muted-foreground">
            <Sparkles className="size-8 animate-pulse" />
            <p key={thinking} className="animate-in fade-in text-sm font-medium text-foreground duration-500">
              {THINKING[thinking]}
            </p>
            <p className="text-xs">This usually takes 15–40 seconds</p>
          </div>
        </div>
      ) : mine ? (
        <section className="mt-6">
          <p className="mb-3 text-sm text-muted-foreground">
            {mine.outfits.length} outfits for <span className="text-foreground">“{mine.request}”</span>.
            Tap a piece to swap it, lock what you want to keep.
          </p>
          <div
            ref={carousel}
            onScroll={onScroll}
            className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 [scrollbar-width:none]"
          >
            {mine.outfits.map((styled) => (
              <div key={styled.outfit.id} className="w-[88%] shrink-0 snap-center">
                <OutfitCard
                  styled={styled}
                  lockedIds={lockedIds}
                  onTapItem={(item) => {
                    setTarget({ outfitId: styled.outfit.id, item });
                    setSheetOpen(true);
                  }}
                  onToggleLock={toggleLock}
                  onRestyle={regenerate}
                  onSeeOnMe={() => {
                    setRenderTarget(styled);
                    setRenderOpen(true);
                  }}
                />
              </div>
            ))}
          </div>
          {mine.outfits.length > 1 && (
            <div className="mt-3 flex justify-center gap-1.5">
              {mine.outfits.map((o, i) => (
                <span
                  key={o.outfit.id}
                  className={cn(
                    "size-2 rounded-full transition-colors",
                    i === active ? "bg-foreground" : "bg-muted-foreground/30",
                  )}
                />
              ))}
            </div>
          )}
          <button
            onClick={regenerate}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary font-medium text-primary-foreground active:scale-[0.98]"
          >
            <RefreshCw className="size-4" />
            Regenerate
            {lockedShown > 0 && <span className="opacity-70">· keeping {lockedShown} locked</span>}
          </button>
        </section>
      ) : (
        !error && (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
            <Sparkles className="size-10" />
            <p>Pick a prompt or type your own.</p>
          </div>
        )
      )}

      <AlternativesSheet target={target} open={sheetOpen} onOpenChange={setSheetOpen} onPick={pickAlternative} />
      <RenderSheet styled={renderTarget} open={renderOpen} onOpenChange={setRenderOpen} onRendered={replaceOutfit} />
    </div>
  );
}
