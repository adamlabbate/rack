"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Loader2, LocateFixed, MapPin, Monitor, Moon, Sun } from "lucide-react";
import { removeAvatar, updateProfile, uploadAvatar } from "@/lib/api";
import { requestLocation, type LocationError } from "@/lib/location";
import { getTheme, setTheme, subscribeTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/avatar";
import { useUser } from "@/components/user-context";

const BIO_MAX = 200; // same limit as the API

const THEMES: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: "system", label: "System", icon: Monitor },
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
];

// Light / dark lives on this device (localStorage), not the account, so it doesn't need a user.
function AppearancePicker() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => "system");
  return (
    <section>
      <h2 className="text-sm font-medium">Appearance</h2>
      <div className="mt-2 flex rounded-full bg-muted p-1" role="radiogroup" aria-label="Appearance">
        {THEMES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="radio"
            aria-checked={theme === id}
            onClick={() => setTheme(id)}
            className={cn(
              "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-medium transition-colors",
              theme === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

const LOCATION_HELP: Record<LocationError, string> = {
  insecure: "Location only works on the https:// link. Open that instead, or type a city.",
  denied:
    "Location is blocked for this site. Allow it from the icon left of the address bar (on a phone: Settings > your browser > Location), then try again. Or type a city.",
  unavailable:
    "Your device couldn't find where it is. On a Mac, turn on Location Services for your browser in System Settings > Privacy & Security > Location Services. Or type a city.",
  timeout: "Finding your location took too long. Try again, or type a city.",
};

// Profile tab > Settings: the bio, and where the weather (stylist and Style widget) comes from.
export function ProfileSettings() {
  const { currentUser, updateUser } = useUser();
  const [bio, setBio] = useState(currentUser?.bio ?? "");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState<"avatar" | "bio" | "city" | "device" | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  if (!currentUser) return null;

  async function run(kind: NonNullable<typeof busy>, action: () => Promise<string>) {
    setBusy(kind);
    setMessage(null);
    try {
      setMessage({ text: await action() });
    } catch (err) {
      setMessage({ text: (err as Error).message, error: true });
    } finally {
      setBusy(null);
    }
  }

  async function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same photo again
    if (!file) return;
    await run("avatar", async () => {
      updateUser(await uploadAvatar(currentUser!.id, file));
      return "Profile picture saved";
    });
  }

  const deleteAvatar = () =>
    run("avatar", async () => {
      updateUser(await removeAvatar(currentUser.id));
      return "Profile picture removed";
    });

  const saveBio = () =>
    run("bio", async () => {
      updateUser(await updateProfile(currentUser.id, { bio }));
      return "Bio saved";
    });

  const saveCity = () =>
    run("city", async () => {
      const user = await updateProfile(currentUser.id, { city });
      updateUser(user);
      setCity("");
      return `Weather now comes from ${user.location_city}`;
    });

  // Asks for permission right here, so it never pops up in the middle of styling.
  const useCurrent = () =>
    run("device", async () => {
      const result = await requestLocation();
      if ("error" in result) throw new Error(LOCATION_HELP[result.error]);
      if (currentUser.location_city) updateUser(await updateProfile(currentUser.id, { city: "" }));
      return "Using your current location";
    });

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-sm font-medium">Profile picture</h2>
        <div className="mt-2 flex items-center gap-4">
          <div className="relative">
            <Avatar user={currentUser} className="size-20 text-3xl" />
            {busy === "avatar" && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
                <Loader2 className="size-6 animate-spin" />
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <button
              onClick={() => avatarInput.current?.click()}
              disabled={busy !== null}
              className="h-10 rounded-full bg-muted text-sm font-medium active:scale-[0.98] disabled:opacity-50"
            >
              {currentUser.avatar ? "Change picture" : "Add a picture"}
            </button>
            {currentUser.avatar && (
              <button
                onClick={deleteAvatar}
                disabled={busy !== null}
                className="h-10 rounded-full text-sm font-medium text-destructive active:bg-destructive/10 disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
        </div>
        <input ref={avatarInput} type="file" accept="image/*" className="hidden" onChange={pickAvatar} />
      </section>

      <section>
        <label htmlFor="bio" className="text-sm font-medium">
          Bio
        </label>
        <textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
          rows={3}
          placeholder="e.g. Rutgers '27. Baggy fits, thrifted denim."
          className="mt-1.5 w-full resize-none rounded-2xl border bg-background px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring/40"
        />
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {bio.length}/{BIO_MAX}
          </span>
          <button
            onClick={saveBio}
            disabled={busy !== null || bio === (currentUser.bio ?? "")}
            className="flex h-10 items-center gap-2 rounded-full bg-brand px-5 text-sm font-medium text-brand-foreground active:scale-95 disabled:opacity-40"
          >
            {busy === "bio" && <Loader2 className="size-4 animate-spin" />}
            Save bio
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium">Location for the weather</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          The stylist dresses you for the forecast here.
        </p>
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-muted px-4 py-3">
          <MapPin className="size-5 shrink-0" />
          <span className="text-sm">
            {currentUser.location_city ?? "Your phone's current location"}
            {!currentUser.location_city && (
              <span className="block text-xs text-muted-foreground">New Brunswick, NJ if it can&apos;t be shared</span>
            )}
          </span>
        </div>

        <button
          onClick={useCurrent}
          disabled={busy !== null}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-muted font-medium active:scale-[0.98] disabled:opacity-50"
        >
          {busy === "device" ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
          Use my current location
        </button>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (city.trim()) saveCity();
          }}
          className="mt-3 flex items-center gap-2 rounded-full border bg-background p-1.5 pl-4 focus-within:ring-2 focus-within:ring-ring/40"
        >
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Or type a city, e.g. Austin, TX"
            enterKeyHint="done"
            className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={busy !== null || !city.trim()}
            className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-brand px-4 text-sm font-medium text-brand-foreground disabled:opacity-40"
          >
            {busy === "city" && <Loader2 className="size-4 animate-spin" />}
            Set
          </button>
        </form>
      </section>

      <AppearancePicker />

      {message && (
        <p
          role="status"
          className={
            message.error
              ? "rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              : "rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          }
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
