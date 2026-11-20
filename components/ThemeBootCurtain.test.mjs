import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});

const {
  BOOT_DISABLED_KEY,
  BOOT_DURATION_MS,
  BOOT_ONCE_KEY,
  isBootSkipKey,
  markThemeBootPlayed,
  shouldPlayThemeBoot,
} = await jiti.import("./ThemeBootCurtain.tsx");

test("boot curtain constants and storage gates respect once-per-window and dsh-theme-boot-disabled", () => {
  assert.equal(BOOT_ONCE_KEY, "dsh-theme-boot-played");
  assert.equal(BOOT_DISABLED_KEY, "dsh-theme-boot-disabled");
  assert.equal(BOOT_DURATION_MS, 1700);

  const localStore = new Map();
  const sessionStore = new Map();
  const ctx = {
    localStorage: { getItem: (k) => localStore.get(k) ?? null },
    sessionStorage: {
      getItem: (k) => sessionStore.get(k) ?? null,
      setItem: (k, v) => sessionStore.set(k, v),
    },
  };

  assert.equal(shouldPlayThemeBoot(ctx), true);
  markThemeBootPlayed(ctx.sessionStorage);
  assert.equal(sessionStore.get("dsh-theme-boot-played"), "1");
  assert.equal(shouldPlayThemeBoot(ctx), false, "must only play once per window");

  sessionStore.clear();
  localStore.set("dsh-theme-boot-disabled", "1");
  assert.equal(
    shouldPlayThemeBoot(ctx),
    false,
    "localStorage.setItem('dsh-theme-boot-disabled', '1') must disable boot curtain",
  );
});

test("boot curtain supports skipping via Enter and Escape and renders terracotta logo, PI wordmark, and orange progress line", () => {
  assert.equal(isBootSkipKey("Enter"), true);
  assert.equal(isBootSkipKey("Escape"), true);
  assert.equal(isBootSkipKey("a"), false);

  const source = readFileSync(
    new URL("./ThemeBootCurtain.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /id="dsh-boot-overlay"/);
  assert.match(source, /className="dsh-boot-mark"/);
  assert.match(source, /<div className="dsh-boot-title">PI<\/div>/);
  assert.match(source, /className="dsh-boot-line"/);

  const css = readFileSync(
    new URL("../app/native-theme.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /#dsh-boot-overlay[\s\S]*?background:\s*#f5f3ee;/);
  assert.match(css, /#dsh-boot-overlay \.dsh-boot-mark-spokes\s*\{\s*fill:\s*#da7756;/);
  assert.match(css, /#dsh-boot-overlay \.dsh-boot-line[\s\S]*?background:\s*#da7756;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?#dsh-boot-overlay \.dsh-boot-line/);
});
