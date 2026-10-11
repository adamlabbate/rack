// The phone's position, sent with stylist and swap requests so the weather is local.
// Browsers only allow geolocation on secure pages (HTTPS or localhost). On http://<LAN IP> from a
// phone it's unavailable and the API falls back to campus (New Brunswick, NJ).

export type Coords = { latitude: number; longitude: number };

let cached: { coords: Coords | null; at: number } | null = null;
const MAX_AGE_MS = 10 * 60 * 1000;

export function getLocation(): Promise<Coords | null> {
  if (cached && Date.now() - cached.at < MAX_AGE_MS) return Promise.resolve(cached.coords);
  if (!window.isSecureContext || !("geolocation" in navigator)) return Promise.resolve(null);

  return new Promise((resolve) => {
    const done = (coords: Coords | null) => {
      cached = { coords, at: Date.now() };
      resolve(coords);
    };
    navigator.geolocation.getCurrentPosition(
      // ~1 km is plenty for a forecast, and keeps the exact spot off the server.
      (pos) =>
        done({
          latitude: Math.round(pos.coords.latitude * 100) / 100,
          longitude: Math.round(pos.coords.longitude * 100) / 100,
        }),
      () => done(null), // denied or timed out: use campus weather
      { enableHighAccuracy: false, timeout: 8000, maximumAge: MAX_AGE_MS },
    );
  });
}
