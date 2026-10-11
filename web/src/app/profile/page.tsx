"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BodyPhotoUpload } from "@/components/body-photo-upload";
import { ProfileSettings } from "@/components/profile-settings";
import { useUser } from "@/components/user-context";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "photo", label: "Fit photo" },
  { id: "settings", label: "Settings" },
] as const;

export default function ProfilePage() {
  const { currentUser } = useUser();

  return (
    <div>
      <h1 className="text-2xl font-semibold capitalize">{currentUser?.name ?? "Profile"}</h1>
      {currentUser?.bio && <p className="mt-1 text-sm whitespace-pre-line">{currentUser.bio}</p>}
      {/* The tab comes from ?tab=, which is request data, so it needs Suspense. */}
      <Suspense>
        <ProfileTabs />
      </Suspense>
    </div>
  );
}

function ProfileTabs() {
  const { currentUser } = useUser();
  // ?tab=settings opens Settings (the Style tab's weather widget links here).
  const tab = useSearchParams().get("tab") === "settings" ? "settings" : "photo";

  return (
    <>
      <div className="mt-4 mb-4 flex rounded-full bg-muted p-1" role="tablist">
        {TABS.map(({ id, label }) => (
          <Link
            key={id}
            href={id === "photo" ? "/profile" : "/profile?tab=settings"}
            replace
            role="tab"
            aria-selected={tab === id}
            className={cn(
              "flex h-10 flex-1 items-center justify-center rounded-full text-sm font-medium transition-colors",
              tab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </div>
      {tab === "photo" ? (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            Your photo for &ldquo;See it on me&rdquo;: Gemini dresses it in the outfits it styles for you.
          </p>
          <BodyPhotoUpload />
        </>
      ) : (
        // Keyed by user so switching users resets the form to their bio.
        <ProfileSettings key={currentUser?.id} />
      )}
    </>
  );
}
