"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const BOOT_ONCE_KEY = "dsh-theme-boot-played";
export const BOOT_DISABLED_KEY = "dsh-theme-boot-disabled";
export const BOOT_DURATION_MS = 1700;
export const BOOT_FADE_OUT_MS = 260;

export interface BootStorageContext {
  localStorage?: Pick<Storage, "getItem"> | null;
  sessionStorage?: Pick<Storage, "getItem"> | null;
}

export function shouldPlayThemeBoot(ctx: BootStorageContext): boolean {
  try {
    if (ctx.localStorage?.getItem(BOOT_DISABLED_KEY) === "1") {
      return false;
    }
  } catch {
    // Storage access blocked in private mode; continue checking sessionStorage.
  }
  try {
    if (ctx.sessionStorage?.getItem(BOOT_ONCE_KEY) === "1") {
      return false;
    }
  } catch {
    // Private mode fallback: allow playing once for current mount.
  }
  return true;
}

export function markThemeBootPlayed(
  sessionStorage?: Pick<Storage, "setItem"> | null,
): void {
  try {
    sessionStorage?.setItem(BOOT_ONCE_KEY, "1");
  } catch {
    // Ignore storage quota / security errors.
  }
}

export function isBootSkipKey(key: string): boolean {
  return key === "Enter" || key === "Escape";
}

export function ThemeBootCurtain() {
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const finishedRef = useRef(false);
  const mainTimerRef = useRef<number | null>(null);
  const removeTimerRef = useRef<number | null>(null);
  const hasCheckedRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (mainTimerRef.current !== null) {
      window.clearTimeout(mainTimerRef.current);
      mainTimerRef.current = null;
    }
    if (removeTimerRef.current !== null) {
      window.clearTimeout(removeTimerRef.current);
      removeTimerRef.current = null;
    }
  }, []);

  const finish = useCallback((immediateSkip: boolean = false) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearTimers();
    setLeaving(true);
    const fadeDelay = immediateSkip ? 0 : BOOT_FADE_OUT_MS;
    if (fadeDelay <= 0) {
      setVisible(false);
    } else {
      removeTimerRef.current = window.setTimeout(() => {
        setVisible(false);
      }, fadeDelay);
    }
  }, [clearTimers]);

  useEffect(() => {
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    if (!shouldPlayThemeBoot({
      localStorage: window.localStorage,
      sessionStorage: window.sessionStorage,
    })) {
      return;
    }

    markThemeBootPlayed(window.sessionStorage);
    const isReduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    setReducedMotion(isReduced);
    setVisible(true);

    let rafId: number | null = null;
    if (isReduced) {
      setReady(true);
    } else {
      rafId = window.requestAnimationFrame(() => {
        setReady(true);
      });
    }

    mainTimerRef.current = window.setTimeout(() => {
      finish(false);
    }, BOOT_DURATION_MS);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isBootSkipKey(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        finish(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKeyDown, true);
      clearTimers();
    };
  }, [clearTimers, finish]);

  if (!visible) return null;

  return (
    <div
      id="dsh-boot-overlay"
      className="dsh-boot-overlay"
      role="status"
      aria-label="PI"
      data-ready={ready ? "1" : "0"}
      data-leaving={leaving ? "1" : undefined}
      data-reduced-motion={reducedMotion ? "1" : "0"}
      onClick={() => finish(true)}
    >
      <svg className="dsh-boot-mark" viewBox="0 0 64 64" aria-hidden="true">
        <rect className="dsh-boot-mark-bg" x="4" y="4" width="56" height="56" rx="14" />
        <g className="dsh-boot-mark-spokes">
          <rect x="29.5" y="14" width="5" height="36" rx="2.5" />
          <rect x="29.5" y="14" width="5" height="36" rx="2.5" transform="rotate(60 32 32)" />
          <rect x="29.5" y="14" width="5" height="36" rx="2.5" transform="rotate(120 32 32)" />
        </g>
        <circle className="dsh-boot-mark-core" cx="32" cy="32" r="6" />
      </svg>
      <div className="dsh-boot-title">PI</div>
      <div className="dsh-boot-line" role="progressbar" aria-label="PI" />
    </div>
  );
}
