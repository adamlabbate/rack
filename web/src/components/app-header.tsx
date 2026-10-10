"use client";

import { cn } from "@/lib/utils";
import { useUser } from "@/components/user-context";

export function AppHeader() {
  const { users, currentUser, setCurrentUser } = useUser();

  return (
    <header className="sticky top-0 z-10 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex h-14 items-center justify-between gap-3 px-4">
        <span className="text-xl font-semibold tracking-tight">Rack</span>
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
      </div>
    </header>
  );
}
