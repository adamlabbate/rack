"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shirt, Sparkles, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Closet", icon: Shirt, ready: true },
  { href: "/style", label: "Style", icon: Sparkles, ready: false },
  { href: "/friends", label: "Friends", icon: Users, ready: false },
  { href: "/profile", label: "Profile", icon: User, ready: false },
];

export function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t bg-background pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-md">
        {TABS.map(({ href, label, icon: Icon, ready }) => {
          const content = (
            <>
              <Icon className="size-6" />
              <span className="text-xs">{ready ? label : `${label} · soon`}</span>
            </>
          );
          const base = "flex h-16 flex-col items-center justify-center gap-1";
          return (
            <li key={href} className="flex-1">
              {ready ? (
                <Link
                  href={href}
                  className={cn(base, pathname === href ? "text-foreground" : "text-muted-foreground")}
                >
                  {content}
                </Link>
              ) : (
                <span className={cn(base, "text-muted-foreground/40")} aria-disabled>
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
