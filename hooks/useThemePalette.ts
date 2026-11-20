"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getPref, setPref } from "@/lib/app-prefs";
import {
  applyThemePalette,
  DEFAULT_PALETTE,
  isThemePalette,
  PALETTE_STORAGE_KEY,
  type ThemePalette,
} from "@/lib/theme-palettes";

export type { ThemePalette } from "@/lib/theme-palettes";

// Same shape as useTheme: one external store so every consumer (settings
// picker today, anything later) repaints together. Independent of the
// light/dark mode — the palette layers on top of whichever mode is resolved.
const listeners = new Set<() => void>();
let state: ThemePalette | null = null;

function ensureState(): ThemePalette {
  if (typeof window === "undefined") return DEFAULT_PALETTE;
  if (state !== null) return state;
  const stored = getPref(PALETTE_STORAGE_KEY);
  state = isThemePalette(stored) ? stored : DEFAULT_PALETTE;
  applyThemePalette(state);
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  ensureState();
  return () => {
    listeners.delete(listener);
  };
}

export function useThemePalette() {
  const palette = useSyncExternalStore(subscribe, ensureState, () => DEFAULT_PALETTE);

  const setPalette = useCallback((next: ThemePalette) => {
    if (!isThemePalette(next) || ensureState() === next) return;
    state = next;
    applyThemePalette(next);
    setPref(PALETTE_STORAGE_KEY, next);
    listeners.forEach((listener) => listener());
  }, []);

  return { palette, setPalette };
}