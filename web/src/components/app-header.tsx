"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBorrows } from "@/components/borrow-context";
import { RequestsSheet } from "@/components/requests-sheet";
import { useUser } from "@/components/user-context";

export function AppHeader() {
  const { users, currentUser, setCurrentUser } = useUser();
  const { pendingIncoming } = useBorrows();
  const [requestsOpen, setRequestsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-10 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex h-14 items-center justify-between gap-3 px-4">
        <span className="text-xl font-semibold tracking-tight">Rack</span>
        <div className="flex items-center gap-1">
          <div className="flex rounded-full bg-muted p-1" role="group" aria-label="Switch user">
            {users.map((user) => (
              <button
                key={user.id}
                onClick={() => setCurrentUser(user)}
                aria-pressed={currentUser?.id === user.id}
                className={cn(
                  "h-9 rounded-full px-3 text-sm font-medium capitalize transition-colors",
                  currentUser?.id === user.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                {user.name}
              </button>
            ))}
          </div>
          <button
            onClick={() => setRequestsOpen(true)}
            aria-label={pendingIncoming ? `Borrow requests, ${pendingIncoming} new` : "Borrow requests"}
            className="relative flex size-11 shrink-0 items-center justify-center rounded-full active:bg-muted"
          >
            <Bell className="size-6" />
            {pendingIncoming > 0 && (
              <span className="absolute top-1 right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold text-white">
                {pendingIncoming}
              </span>
            )}
          </button>
        </div>
      </div>
      <RequestsSheet open={requestsOpen} onOpenChange={setRequestsOpen} />
    </header>
  );
}
