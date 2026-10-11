// The phone's position, sent with stylist and swap requests so the weather is local.
// Browsers only allow geolocation on secure pages (HTTPS or localhost). On http://<LAN IP> from a
// phone it's unavailable and the API falls back to campus (New Brunswick, NJ).

export type Coords = { latitude: number; longitude: number };

let cached: { coords: Coords | null; at: number } | null = null;
const MAX_AGE_MS = 10 * 60 * 1000;

export function getLocation(): Promise<Coords | null> {
  if (cached && Date.now() - cached.at < MAX_AGE_MS) return Promise.resolve(cached.coords);
  return requestLocation(8000).then((r) => ("coords" in r ? r.coords : null)); // null: campus weather
}

// Why the browser gave no location, so Settings can say what to fix.
export type LocationError = "insecure" | "denied" | "unavailable" | "timeout";

// Always asks the browser (no cache). Settings uses it directly, with a longer timeout: laptops find
// themselves over Wi-Fi, which is slower than a phone's GPS.
export function requestLocation(timeout = 15000): Promise<{ coords: Coords } | { error: LocationError }> {
  if (!window.isSecureContext || !("geolocation" in navigator)) return Promise.resolve({ error: "insecure" });

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // ~1 km is plenty for a forecast, and keeps the exact spot off the server.
        const coords = {
          latitude: Math.round(pos.coords.latitude * 100) / 100,
          longitude: Math.round(pos.coords.longitude * 100) / 100,
        };
        cached = { coords, at: Date.now() };
        resolve({ coords });
      },
      (err) => {
        cached = { coords: null, at: Date.now() };
        const reasons = { 1: "denied", 2: "unavailable", 3: "timeout" } as const;
        resolve({ error: reasons[err.code as 1 | 2 | 3] ?? "unavailable" });
      },
      { enableHighAccuracy: false, timeout, maximumAge: MAX_AGE_MS },
    );
  });
}
