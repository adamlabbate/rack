"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, Shirt } from "lucide-react";
import { getGroups, getSharedCloset, type Category, type GroupWithMembers, type SharedItem } from "@/lib/api";
import { useBorrows } from "@/components/borrow-context";
import { CategoryFilter, FILTERS } from "@/components/category-filter";
import { useUser } from "@/components/user-context";
import { cn } from "@/lib/utils";

type Loaded = { userId: number; shared: SharedItem[]; groups: GroupWithMembers[] };

// A friend's shared closet, or everything a group's members share. Tap a piece to ask for it.
export function SharedCloset({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = use(params);
  const { users, currentUser } = useUser();
  const { statusFor, askToBorrow } = useBorrows();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Category | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    let stale = false;
    Promise.all([getSharedCloset(currentUser.id), getGroups(currentUser.id)])
      .then(([shared, groups]) => {
        if (stale) return;
        setLoaded({ userId: currentUser.id, shared, groups });
        setError(null);
      })
      .catch((err) => !stale && setError(err.message));
    return () => {
      stale = true;
    };
  }, [currentUser]);

  const data = loaded && loaded.userId === currentUser?.id ? loaded : null;
  const isGroup = kind === "group";
  const group = isGroup ? data?.groups.find((g) => g.group.id === Number(id)) : undefined;
  const ownerIds = isGroup ? (group?.members.map((m) => m.id) ?? []) : [Number(id)];
  const items = data?.shared.filter((s) => ownerIds.includes(s.item.owner_id));
  const visible = items?.filter((s) => !filter || s.item.category === filter);
  const friendName = users.find((u) => u.id === Number(id))?.name ?? "Friend";

  return (
    <div>
      <Link href="/friends" className="-ml-2 mb-1 flex h-10 w-fit items-center gap-1 rounded-full pr-3 pl-1 text-sm text-muted-foreground">
        <ChevronLeft className="size-5" /> Friends
      </Link>
      <h1 className="text-2xl font-semibold">
        {isGroup ? (group?.group.name ?? "Group") : <><span className="capitalize">{friendName}</span>&apos;s Rack</>}
      </h1>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        {isGroup ? "Everything members share with the group." : "Shared with you."} Tap a piece to borrow it.
      </p>

      {error && (
        <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <CategoryFilter value={filter} onChange={setFilter} />

      {items === undefined && !error ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : items?.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <Shirt className="size-10" />
          <p>Nothing shared with you here yet.</p>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3">
            {visible?.map(({ item, owner_name }) => {
              const status = statusFor(item.id);
              return (
                <li key={item.id}>
                  <button
                    onClick={() => askToBorrow(item)}
                    className="relative block aspect-square w-full overflow-hidden rounded-xl bg-[#F5F5F3] active:scale-[0.98]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- images come from the API server */}
                    <img
                      src={item.cutout_path ?? item.image_path}
                      alt={item.subtype ?? item.category ?? "Clothing item"}
                      className={cn("size-full", item.cutout_path ? "object-contain p-4" : "object-cover")}
                    />
                    {isGroup && (
                      <span className="absolute top-2 left-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium capitalize">
                        {owner_name}
                      </span>
                    )}
                    <BorrowPill status={status} className="absolute right-2 bottom-2" />
                  </button>
                </li>
              );
            })}
          </ul>
          {visible?.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No {FILTERS.find((f) => f.category === filter)?.label.toLowerCase()} shared.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// "Request" until you ask, then "Requested", then "Borrowed" once the owner accepts.
export function BorrowPill({ status, className }: { status: string | null; className?: string }) {
  const [label, style] =
    status === "accepted"
      ? ["Borrowed", "bg-emerald-600 text-white"]
      : status === "pending"
        ? ["Requested", "bg-amber-100 text-amber-800"]
        : ["Request", "bg-primary text-primary-foreground"];
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium shadow-sm", style, className)}>{label}</span>
  );
}
