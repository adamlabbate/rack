"use client";

import { useLayoutEffect } from "react";
import { reapplyTheme } from "@/lib/theme";

// In development, Strict Mode's remount resets <html> to the attributes React manages, dropping the
// "dark" class the <head> script set. Re-apply it before paint. A no-op in production.
export function ThemeSync() {
  useLayoutEffect(reapplyTheme, []);
  return null;
}
