"use client";

import { useState } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { Loader2 } from "lucide-react";
import { BottomSheet, SheetHeader } from "@/components/bottom-sheet";
import { useBorrows } from "@/components/borrow-context";
import { itemName } from "@/components/borrow-sheet";
import { useUser } from "@/components/user-context";
import { updateBorrow, type Borrow, type BorrowStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

// How each status reads from the borrower's side and from the owner's side.
const OUTGOING_LABEL: Record<BorrowStatus, string> = {
  pending: "Requested",
  accepted: "Borrowed",
  declined: "Declined",
  returned: "Returned",
};
const INCOMING_LABEL: Record<BorrowStatus, string> = {
  pending: "Wants it",
  accepted: "Lent out",
  declined: "Declined",
  returned: "Returned",
};
const STATUS_STYLE: Record<BorrowStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  accepted: "bg-emerald-100 text-emerald-800",
  declined: "bg-muted text-muted-foreground",
  returned: "bg-muted text-muted-foreground",
};

// "Oct 11"
function shortDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

// The bell: requests for your items (accept / decline) and your requests to friends.
export function RequestsSheet({ open, onOpenChange }: Props) {
  const { lists } = useBorrows();
  // Open requests first, then the rest; each list is already newest first.
  const sort = (list: Borrow[]) =>
    [...list].sort((a, b) => Number(isDone(a)) - Number(isDone(b)));

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <SheetHeader />
      <Drawer.Content className="min-h-0 flex-1 touch-auto overflow-y-auto overscroll-contain px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <Drawer.Title className="text-xl font-semibold">Borrow requests</Drawer.Title>
        {lists === null ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : (
          <>
            <h3 className="mt-5 mb-2 text-sm font-medium text-muted-foreground">For your clothes</h3>
            {lists.incoming.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No one has asked to borrow anything yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {sort(lists.incoming).map((b) => (
                  <Row key={b.request.id} borrow={b} incoming />
                ))}
              </ul>
            )}
            <h3 className="mt-6 mb-2 text-sm font-medium text-muted-foreground">You asked for</h3>
            {lists.outgoing.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                Browse a friend&apos;s closet on the Friends tab to borrow something.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {sort(lists.outgoing).map((b) => (
                  <Row key={b.request.id} borrow={b} incoming={false} />
                ))}
              </ul>
            )}
          </>
        )}
      </Drawer.Content>
    </BottomSheet>
  );
}

function isDone(b: Borrow) {
  return b.request.status === "declined" || b.request.status === "returned";
}

function Row({ borrow, incoming }: { borrow: Borrow; incoming: boolean }) {
  const { currentUser } = useUser();
  const { refresh } = useBorrows();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { request, item } = borrow;
  const other = incoming ? borrow.from_name : borrow.to_name;

  async function act(status: "accepted" | "declined" | "returned") {
    if (!currentUser) return;
    setBusy(status);
    setError(null);
    try {
      await updateBorrow(request.id, status, currentUser.id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const label = (incoming ? INCOMING_LABEL : OUTGOING_LABEL)[request.status];

  return (
    <li className={cn("rounded-2xl border p-2", isDone(borrow) && "opacity-60")}>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- images come from the API server */}
        <img
          src={item.cutout_path ?? item.image_path}
          alt={item.subtype ?? "Clothing item"}
          className="size-16 shrink-0 rounded-xl bg-[#F5F5F3] object-contain p-1"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            <span className="capitalize">{other}</span>
            {incoming ? " · your " : "'s "}
            {itemName(item)}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {request.date_needed ? `Needed ${shortDate(request.date_needed)}` : "No date"}
            {request.note && ` · “${request.note}”`}
          </p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-1 text-xs font-medium", STATUS_STYLE[request.status])}>
          {label}
        </span>
      </div>

      {error && <p className="mt-2 px-1 text-sm text-destructive">{error}</p>}

      {incoming && request.status === "pending" && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <ActionButton busy={busy === "declined"} disabled={busy !== null} onClick={() => act("declined")}>
            Decline
          </ActionButton>
          <ActionButton busy={busy === "accepted"} disabled={busy !== null} onClick={() => act("accepted")} primary>
            Accept
          </ActionButton>
        </div>
      )}
      {request.status === "accepted" && (
        <ActionButton
          busy={busy === "returned"}
          disabled={busy !== null}
          onClick={() => act("returned")}
          className="mt-2 w-full"
        >
          {incoming ? "Got it back" : "I gave it back"}
        </ActionButton>
      )}
    </li>
  );
}

function ActionButton({
  busy,
  primary,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy: boolean; primary?: boolean }) {
  return (
    <button
      {...props}
      className={cn(
        "flex h-11 items-center justify-center gap-2 rounded-full text-sm font-medium disabled:opacity-60",
        primary ? "bg-primary text-primary-foreground" : "bg-muted",
        className,
      )}
    >
      {busy && <Loader2 className="size-4 animate-spin" />}
      {props.children}
    </button>
  );
}
