// Run against an existing dev server: node e2e/palettes.mjs
// Built-in colour themes (Settings › Appearance › Theme): selection, token
// repaint in light/dark, persistence across reload, default reset, and the
// palette surviving system-scheme changes while the mode follows the system.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { openSettingsSection } from "./settings-navigation.mjs";

const base = process.env.E2E_BASE_URL || "http://127.0.0.1:30141";
const artifacts = "test-results/palettes/";
await mkdir(artifacts, { recursive: true });

// Same compositing method as e2e/themes.mjs, plus Chrome's 8-digit-hex and
// rgb(r g b / a) serialisations of translucent tokens.
function parseColor(value) {
  const text = value.trim();
  if (text === "transparent") return [0, 0, 0, 0];
  if (text.startsWith("#")) {
    const digits = text.length <= 5 ? [...text.slice(1)].map((d) => d + d).join("") : text.slice(1);
    const parts = digits.match(/../g).map((p) => parseInt(p, 16));
    if (parts.length === 3) parts.push(1); else parts[3] /= 255;
    return parts;
  }
  const match = text.match(/^rgba?\(([^)]+)\)$/);
  assert.ok(match, `Unsupported color token: ${value}`);
  const parts = match[1].split(/[\s,/]+/).filter(Boolean);
  const channel = (v) => v.endsWith("%") ? Number(v.slice(0, -1)) * 2.55 : Number(v);
  const [r, g, b] = parts.slice(0, 3).map(channel);
  const a = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? Number(parts[3].slice(0, -1)) / 100 : Number(parts[3]);
  return [r, g, b, a];
}
function contrast(a, b) {
  const composite = (c, base) => [0, 1, 2].map((i) => c[i] * c[3] + base[i] * (1 - c[3]));
  const luminance = (rgb) => {
    const ch = rgb.map((p) => { const v = p / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return ch[0] * 0.2126 + ch[1] * 0.7152 + ch[2] * 0.0722;
  };
  const bg = composite(parseColor(b), [255, 255, 255]);
  const fg = composite(parseColor(a), bg);
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Playwright honours this env var; it lets a machine without the bundled
// Chromium run against the installed Chrome (see e2e docs).
const browser = await chromium.launch(process.env.E2E_CHROME_CHANNEL ? { channel: process.env.E2E_CHROME_CHANNEL } : {});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US", colorScheme: "light", reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(/\/api\/sessions(?:\?.*)?$/, (route) => route.fulfill({ json: { sessions: [] } }));
  await page.goto(base);
  await page.getByText("No projects found", { exact: true }).waitFor({ state: "attached" });
  await openSettingsSection(page, "Appearance");

  const claude = page.getByRole("radio", { name: "Claude", exact: true });
  await claude.locator("..").click();
  assert.equal(await claude.isChecked(), true);
  await page.waitForFunction(() => document.documentElement.dataset.palette === "claude");
  assert.equal(await page.evaluate(() => localStorage.getItem("pi-palette")), "claude");
  // Computed custom properties may serialise #ffffff as #fff.
  const norm = (v) => /^#[0-9a-f]{3}$/i.test(v) ? "#" + [...v.slice(1)].map((c) => c + c).join("") : v;
  const read = async (keys) => Object.fromEntries(Object.entries(await page.locator("html").evaluate((root, ks) => {
    const style = getComputedStyle(root);
    return Object.fromEntries(ks.map((key) => [key, style.getPropertyValue(`--${key}`).trim()]));
  }, keys)).map(([k, v]) => [k, norm(v)]));
  const light = await read(["bg", "workbench-bg", "accent", "accent-contrast", "user-bg", "text", "text-muted", "text-dim", "menu-selection-color"]);
  assert.equal(light.accent, "#d97757");
  assert.equal(light.bg, "#fafafa");
  assert.equal(light["workbench-bg"], "#ffffff");
  assert.equal(light["menu-selection-color"], "#d97757");
  // Neutral text keeps this fork's contrast floors on the palette's surfaces
  // (4.5:1 labels, 3:1 dim). The terracotta accent is a brand fill and is
  // deliberately exempt — see the Claude block in native-theme.css.
  for (const [fg, floor] of [["text", 4.5], ["text-muted", 4.5], ["text-dim", 3]]) {
    assert.ok(contrast(light[fg], light.bg) >= floor, `claude light: ${fg} on bg`);
    assert.ok(contrast(light[fg], light["workbench-bg"]) >= floor, `claude light: ${fg} on workbench`);
    assert.ok(contrast(light[fg], light["user-bg"]) >= floor, `claude light: ${fg} on user bubble`);
  }
  await page.screenshot({ path: `${artifacts}/claude-light-settings.png` });

  // Dark mode via the color-mode radios; the palette must persist across it.
  await page.getByRole("radio", { name: "Dark", exact: true }).locator("..").click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.palette), "claude");
  const dark = await read(["bg", "workbench-bg", "accent", "text", "text-muted", "text-dim", "surface-elevated", "user-bg", "menu-selection-color"]);
  assert.equal(dark.bg, "#1f1f1f");
  assert.equal(dark["workbench-bg"], "#191919");
  assert.equal(dark.accent, "#d97757");
  assert.equal(dark["menu-selection-color"], "#d97757");
  for (const [fg, floor] of [["text", 4.5], ["text-muted", 4.5], ["text-dim", 3]]) {
    for (const bg of ["bg", "workbench-bg", "surface-elevated", "user-bg"]) {
      assert.ok(contrast(dark[fg], dark[bg]) >= floor, `claude dark: ${fg} on ${bg}`);
    }
  }
  await page.screenshot({ path: `${artifacts}/claude-dark-settings.png` });

  // Reload: first-paint script must restore both mode and palette.
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.palette === "claude" && document.documentElement.dataset.theme === "dark");
  await page.getByText("No projects found", { exact: true }).waitFor({ state: "attached" });
  await page.screenshot({ path: `${artifacts}/claude-dark-main.png` });

  // Back to default removes the attribute and restores the base tokens.
  await openSettingsSection(page, "Appearance");
  await page.getByRole("radio", { name: "Default", exact: true }).locator("..").click();
  await page.waitForFunction(() => document.documentElement.dataset.palette === undefined);
  const baseDark = await read(["bg", "accent"]);
  assert.equal(baseDark.bg, "#19191a");
  assert.equal(baseDark.accent, "#ececec");
  assert.equal(await page.evaluate(() => localStorage.getItem("pi-palette")), "default");

  // System scheme change while a palette is active keeps the palette.
  await page.getByRole("radio", { name: "Claude", exact: true }).locator("..").click();
  await page.getByRole("radio", { name: "System", exact: true }).locator("..").click();
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.palette), "claude");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.palette), "claude");

  assert.deepEqual(errors, []);
  console.log("PASS palettes: selection, tokens light/dark, persistence, reload, default reset, system mode");
  await context.close();
} finally {
  await browser.close();
}