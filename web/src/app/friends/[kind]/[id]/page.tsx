import { Suspense } from "react";
import { SharedCloset } from "@/components/shared-closet";

// /friends/user/2 or /friends/group/1. The params are only known per request, so with
// cacheComponents they're read inside Suspense.
export default function SharedClosetPage({ params }: PageProps<"/friends/[kind]/[id]">) {
  return (
    <Suspense>
      <SharedCloset params={params} />
    </Suspense>
  );
}
