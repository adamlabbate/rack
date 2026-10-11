"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getBorrows, type BorrowLists, type BorrowStatus, type Item } from "@/lib/api";
import { BorrowSheet } from "@/components/borrow-sheet";
import { useUser } from "@/components/user-context";

type BorrowContextValue = {
  lists: BorrowLists | null; // the current user's incoming and outgoing requests
  pendingIncoming: number; // the bell badge
  // Status of the current user's latest request for this item; null if never asked or returned.
  statusFor: (itemId: number) => BorrowStatus | null;
  refresh: () => Promise<void>;
  askToBorrow: (item: Item) => void; // opens the request sheet
};

const BorrowContext = createContext<BorrowContextValue | null>(null);

// Poll so a request accepted on another phone shows up without a reload.
const POLL_MS = 10_000;

export function BorrowProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useUser();
  // Keyed by user so switching users never shows the previous user's requests.
  const [state, setState] = useState<{ userId: number; lists: BorrowLists } | null>(null);
  const [sheetItem, setSheetItem] = useState<Item | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const userId = currentUser?.id;

  const refresh = useCallback(async () => {
    if (userId === undefined) return;
    try {
      setState({ userId, lists: await getBorrows(userId) });
    } catch (err) {
      console.error("Could not load borrow requests", err);
    }
  }, [userId]);

  useEffect(() => {
    // Wrapped so the first load isn't a synchronous setState inside the effect.
    const load = () => void refresh();
    const first = setTimeout(load, 0);
    const timer = setInterval(() => document.visibilityState === "visible" && load(), POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [refresh]);

  const lists = state && state.userId === userId ? state.lists : null;
  const pendingIncoming = lists?.incoming.filter((b) => b.request.status === "pending").length ?? 0;

  function statusFor(itemId: number) {
    // The API sends newest first, so the first match is the latest request.
    const latest = lists?.outgoing.find((b) => b.request.item_id === itemId);
    return latest && latest.request.status !== "returned" ? latest.request.status : null;
  }

  function askToBorrow(item: Item) {
    setSheetItem(item);
    setSheetOpen(true);
  }

  return (
    <BorrowContext.Provider value={{ lists, pendingIncoming, statusFor, refresh, askToBorrow }}>
      {children}
      <BorrowSheet item={sheetItem} open={sheetOpen} onOpenChange={setSheetOpen} />
    </BorrowContext.Provider>
  );
}

export function useBorrows() {
  const ctx = useContext(BorrowContext);
  if (!ctx) throw new Error("useBorrows must be used inside BorrowProvider");
  return ctx;
}
