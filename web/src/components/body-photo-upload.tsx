"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { uploadBodyPhoto, type User } from "@/lib/api";
import { useUser } from "@/components/user-context";

// The current user's full-body photo with a Replace button, or a prompt to add one.
// Used on the Profile tab and in the "See it on me" sheet when there's no photo yet.
export function BodyPhotoUpload({ onUploaded }: { onUploaded?: (user: User) => void }) {
  const { currentUser, updateUser } = useUser();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const photo = currentUser?.full_body_photo;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same photo again
    if (!file || !currentUser) return;
    setUploading(true);
    setError(null);
    try {
      const user = await uploadBodyPhoto(currentUser.id, file);
      updateUser(user);
      onUploaded?.(user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {photo ? (
        <div className="relative overflow-hidden rounded-3xl bg-[#F5F5F3]">
          {/* eslint-disable-next-line @next/next/no-img-element -- images come from the API server */}
          <img src={photo} alt="Your full-body photo" className="aspect-[3/4] w-full object-cover" />
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Loader2 className="size-8 animate-spin" />
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading || !currentUser}
          className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed bg-[#F5F5F3] px-8 text-center text-muted-foreground active:scale-[0.98]"
        >
          {uploading ? <Loader2 className="size-10 animate-spin" /> : <Camera className="size-10" />}
          <span className="font-medium text-foreground">{uploading ? "Uploading…" : "Add a full-body photo"}</span>
          <span className="text-sm">Standing, facing the camera, head to toe, in good light.</span>
        </button>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      {photo && (
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="mt-3 h-12 w-full rounded-full bg-muted font-medium active:scale-[0.98] disabled:opacity-50"
        >
          Replace
        </button>
      )}
      {/* No `capture` attribute: the phone offers Take Photo, Photo Library, or Files. */}
      <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}
