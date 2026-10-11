"use client";

import { BodyPhotoUpload } from "@/components/body-photo-upload";
import { useUser } from "@/components/user-context";

export default function ProfilePage() {
  const { currentUser } = useUser();

  return (
    <div>
      <h1 className="text-2xl font-semibold capitalize">{currentUser?.name ?? "Profile"}</h1>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        Your photo for &ldquo;See it on me&rdquo;: Gemini dresses it in the outfits it styles for you.
      </p>
      <BodyPhotoUpload />
    </div>
  );
}
