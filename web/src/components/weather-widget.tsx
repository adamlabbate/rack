"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Cloud, CloudFog, CloudRain, CloudSnow, CloudSun, MapPin, Sun } from "lucide-react";
import { getWeather, type Weather } from "@/lib/api";
import { useUser } from "@/components/user-context";

function WeatherIcon({ weather }: { weather: Weather }) {
  const c = weather.conditions ?? "";
  const Icon = weather.snow
    ? CloudSnow
    : /rain|drizzle|shower|thunder/.test(c)
      ? CloudRain
      : c.includes("fog")
        ? CloudFog
        : c.includes("overcast")
          ? Cloud
          : c.includes("partly") || c.includes("mostly")
            ? CloudSun
            : Sun;
  return <Icon className="size-9 shrink-0" />;
}

// Today's weather where the stylist thinks you are. Tap to change the location in Settings.
export function WeatherWidget() {
  const { currentUser } = useUser();
  // Keyed by the user and their saved city, so a stale forecast never shows for someone else.
  const key = currentUser ? `${currentUser.id}:${currentUser.location_city ?? ""}` : null;
  const [state, setState] = useState<{ key: string; weather: Weather | null } | null>(null);

  useEffect(() => {
    if (!currentUser || !key) return;
    let stale = false;
    getWeather(currentUser.id, !currentUser.location_city)
      .then((weather) => !stale && setState({ key, weather }))
      .catch(() => !stale && setState({ key, weather: null }));
    return () => {
      stale = true;
    };
  }, [currentUser, key]);

  const weather = state?.key === key ? state.weather : undefined;

  return (
    <Link
      href="/profile?tab=settings"
      aria-label="Weather. Tap to change your location"
      className="mb-4 flex items-center gap-3 rounded-2xl bg-[#F5F5F3] px-4 py-3 active:scale-[0.98]"
    >
      {weather === undefined ? (
        <div className="h-10 flex-1 animate-pulse rounded-lg bg-muted" />
      ) : !weather || weather.error ? (
        <p className="flex-1 text-sm text-muted-foreground">Weather is unavailable right now</p>
      ) : (
        <>
          <WeatherIcon weather={weather} />
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{weather.temp_f}°</span>
              <span className="truncate text-sm capitalize">{weather.conditions}</span>
            </p>
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">
                {weather.city}
                {weather.source === "default" && " (default)"} · H {weather.high_f}° L {weather.low_f}°
                {(weather.rain_chance ?? 0) > 0 && ` · ${weather.rain_chance}% rain`}
              </span>
            </p>
          </div>
        </>
      )}
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
