"use client";

import { useState } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { Check, Clock, Loader2 } from "lucide-react";
import { BottomSheet, SheetHeader } from "@/components/bottom-sheet";
import { useBorrows } from "@/components/borrow-context";
import { useUser } from "@/components/user-context";
import { imageUrl, requestBorrow, type Item } from "@/lib/api";

// Local YYYY-MM-DD, `days` from today (toISOString would use UTC and can be off by a day).
function localDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function itemName(item: Item) {
  return [item.colors[0], item.subtype ?? item.category].filter(Boolean).join(" ");
}

type Props = { item: Item | null; open: boolean; onOpenChange: (open: boolean) => void };

// Ask a friend to borrow one of their shared items.
export function BorrowSheet({ item, open, onOpenChange }: Props) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      {item && <SheetBody key={item.id} item={item} onSent={() => onOpenChange(false)} />}
    </BottomSheet>
  );
}

function SheetBody({ item, onSent }: { item: Item; onSent: () => void }) {
  const { users, currentUser } = useUser();
  const { statusFor, refresh } = useBorrows();
  const [date, setDate] = useState(localDate(1));
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const owner = users.find((u) => u.id === item.owner_id)?.name ?? "your friend";
  const status = statusFor(item.id);

  async function send() {
    if (!currentUser) return;
    setSending(true);
    setError(null);
    try {
      await requestBorrow(item.id, currentUser.id, date || null, note.trim());
      await refresh();
      onSent();
    } catch (err) {
      setError((err as Error).message);
      setSending(false);
    }
  }

  return (
    <>
      <SheetHeader />
      <Drawer.Content className="min-h-0 flex-1 touch-auto overflow-y-auto overscroll-contain px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-[#F5F5F3] p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- images come from the API server */}
          <img
            src={imageUrl(item.cutout_path ?? item.image_path)}
            alt={item.subtype ?? "Clothing item"}
            className="max-h-full max-w-full object-contain"
          />
        </div>
        <Drawer.Title className="mt-4 text-xl font-semibold">
          Borrow <span className="capitalize">{owner}</span>&apos;s {itemName(item)}
        </Drawer.Title>

        {error && (
          <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        {status === "pending" || status === "accepted" ? (
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-muted px-3 py-3 text-sm">
            {status === "pending" ? <Clock className="size-4" /> : <Check className="size-4" />}
            {status === "pending" ? (
              <span>
                Requested. Waiting for <span className="capitalize">{owner}</span> to answer.
              </span>
            ) : (
              <span>
                Borrowed. <span className="capitalize">{owner}</span> said yes.
              </span>
            )}
          </p>
        ) : (
          <>
            {status === "declined" && (
              <p className="mt-2 text-sm text-muted-foreground">
                <span className="capitalize">{owner}</span> declined last time. You can ask again.
              </p>
            )}
            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-medium text-muted-foreground">Needed by</span>
              <input
                type="date"
                value={date}
                min={localDate(0)}
                onChange={(e) => setDate(e.target.value)}
                className="h-12 w-full rounded-xl border bg-background px-3 text-base"
              />
            </label>
            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-medium text-muted-foreground">Note (optional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="e.g. Career fair tomorrow, I'll bring it back Friday"
                className="w-full resize-none rounded-xl border bg-background px-3 py-2 text-base placeholder:text-muted-foreground"
              />
            </label>
            <button
              onClick={send}
              disabled={sending}
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-base font-medium text-primary-foreground disabled:opacity-60"
            >
              {sending && <Loader2 className="size-4 animate-spin" />}
              Send request
            </button>
          </>
        )}
      </Drawer.Content>
    </>
  );
}
