"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Loader2, Users } from "lucide-react";
import { getFriends, getGroups, getSharedCloset, type GroupWithMembers, type SharedItem, type User } from "@/lib/api";
import { useUser } from "@/components/user-context";

type Social = { userId: number; friends: User[]; groups: GroupWithMembers[]; shared: SharedItem[] };

const KIND_LABEL = { dorm: "Dorm", club: "Club", friends: "Friend group" };

export default function FriendsPage() {
  const { currentUser } = useUser();
  const [social, setSocial] = useState<Social | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    let stale = false;
    Promise.all([getFriends(currentUser.id), getGroups(currentUser.id), getSharedCloset(currentUser.id)])
      .then(([friends, groups, shared]) => {
        if (stale) return;
        setSocial({ userId: currentUser.id, friends, groups, shared });
        setError(null);
      })
      .catch((err) => !stale && setError(err.message));
    return () => {
      stale = true;
    };
  }, [currentUser]);

  const mine = social && social.userId === currentUser?.id ? social : null;
  const sharedBy = (ids: number[]) => mine?.shared.filter((s) => ids.includes(s.item.owner_id)).length ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Friends</h1>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        Browse what your friends and groups share, and ask to borrow it.
      </p>

      {error && (
        <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {mine === null && !error ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : mine && mine.friends.length === 0 && mine.groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <Users className="size-10" />
          <p>No friends or groups yet.</p>
        </div>
      ) : (
        mine && (
          <>
            {mine.groups.length > 0 && (
              <Section title="Groups">
                {mine.groups.map(({ group, members }) => {
                  const others = members.filter((m) => m.id !== currentUser?.id);
                  return (
                    <Row
                      key={group.id}
                      href={`/friends/group/${group.id}`}
                      initial={group.name[0]}
                      title={group.name}
                      subtitle={`${KIND_LABEL[group.kind] ?? group.kind} · ${members.length} members · ${sharedBy(others.map((m) => m.id))} shared pieces`}
                    />
                  );
                })}
              </Section>
            )}
            {mine.friends.length > 0 && (
              <Section title="Friends">
                {mine.friends.map((friend) => (
                  <Row
                    key={friend.id}
                    href={`/friends/user/${friend.id}`}
                    initial={friend.name[0]}
                    title={friend.name}
                    subtitle={`${sharedBy([friend.id])} shared pieces`}
                  />
                ))}
              </Section>
            )}
          </>
        )
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">{title}</h2>
      <ul className="flex flex-col gap-2">{children}</ul>
    </section>
  );
}

function Row({ href, initial, title, subtitle }: { href: string; initial: string; title: string; subtitle: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 rounded-2xl border p-3 active:bg-muted">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold uppercase">
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium capitalize">{title}</span>
          <span className="block truncate text-sm text-muted-foreground">{subtitle}</span>
        </span>
        <ChevronRight className="size-5 text-muted-foreground" />
      </Link>
    </li>
  );
}
