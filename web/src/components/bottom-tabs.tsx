"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shirt, Sparkles, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Rack", icon: Shirt, ready: true },
  { href: "/style", label: "Style", icon: Sparkles, ready: true },
  { href: "/friends", label: "Friends", icon: Users, ready: true },
  { href: "/profile", label: "Profile", icon: User, ready: false },
];

// Friends stays highlighted while browsing a friend's closet (/friends/user/2).
function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function BottomTabs() {
  return <TabBar pathname={usePathname()} />;
}

// The bar itself. With pathname null (while BottomTabs waits on the URL inside Suspense) no tab is
// highlighted, so the bar never disappears.
export function TabBar({ pathname }: { pathname: string | null }) {
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
                  className={cn(base, pathname && isActive(pathname, href) ? "text-foreground" : "text-muted-foreground")}
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
