import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { PALETTE_INIT_SCRIPT, PALETTE_OPTIONS, DEFAULT_PALETTE, applyThemePalette, isThemePalette } from "./theme-palettes.ts";

test("first paint restores every palette and ignores invalid or blocked storage", () => {
  for (const stored of [...PALETTE_OPTIONS.map(({ id }) => id), null, "", "mist", "unknown", new Error("Blocked")]) {
    const root = { dataset: {} };
    runInNewContext(PALETTE_INIT_SCRIPT, {
      localStorage: { getItem: () => { if (stored instanceof Error) throw stored; return stored; } },
      document: { documentElement: root },
    });
    const expected = isThemePalette(stored) && stored !== DEFAULT_PALETTE ? stored : undefined;
    assert.equal(root.dataset.palette, expected);
  }
});

test("applyThemePalette sets the attribute for built-ins and clears it for the default", () => {
  const root = { dataset: {} };
  const context = { document: { documentElement: root } };
  for (const { id } of PALETTE_OPTIONS) {
    runInNewContext(`(${applyThemePalette.toString()})(${JSON.stringify(id)})`, { ...context, DEFAULT_PALETTE });
    assert.equal(root.dataset.palette, id === DEFAULT_PALETTE ? undefined : id);
  }
});

test("isThemePalette accepts only registry ids", () => {
  for (const { id } of PALETTE_OPTIONS) assert.equal(isThemePalette(id), true);
  for (const value of [null, undefined, "", "light", "dark", "mist", 42, {}]) assert.equal(isThemePalette(value), false);
});

test("every registered non-default palette has light and dark token blocks in native-theme.css", () => {
  const css = readFileSync(new URL("../app/native-theme.css", import.meta.url), "utf8");
  for (const { id } of PALETTE_OPTIONS) {
    if (id === DEFAULT_PALETTE) continue;
    assert.ok(css.includes(`:root[data-palette="${id}"] {`), `missing light block for ${id}`);
    assert.ok(css.includes(`html.dark[data-palette="${id}"] {`), `missing dark block for ${id}`);
  }
});

test("claude palette defines warm beige surface, ink text, terracotta orange accent, Absolutely code theme and diff colors", async () => {
  const css = readFileSync(new URL("../app/native-theme.css", import.meta.url), "utf8");
  const lightStart = css.indexOf(':root[data-palette="claude"] {');
  assert.ok(lightStart >= 0, "missing claude light token block");
  const lightBlock = css.slice(lightStart, css.indexOf("}", lightStart) + 1);

  assert.match(lightBlock, /--bg:\s*#f5f3ee;/);
  assert.match(lightBlock, /--workbench-bg:\s*#f5f3ee;/);
  assert.match(lightBlock, /--surface:\s*#f5f3ee;/);
  assert.match(lightBlock, /--text:\s*#1d1b16;/);
  assert.match(lightBlock, /--accent:\s*#da7756;/);
  assert.match(lightBlock, /--diff-added:\s*#00c853;/);
  assert.match(lightBlock, /--diff-removed:\s*#ff5f38;/);
  assert.match(lightBlock, /--success:\s*#00c853;/);
  assert.match(lightBlock, /--danger:\s*#ff5f38;/);
  assert.match(lightBlock, /--code-bg:\s*#f9f9f7;/);
  assert.match(lightBlock, /--code-fg:\s*#2d2d2b;/);
  assert.match(lightBlock, /--code-keyword:\s*#ff5f38;/);
  assert.match(lightBlock, /--code-constant:\s*#ff5f38;/);
  assert.match(lightBlock, /--code-string:\s*#00c853;/);
  assert.match(lightBlock, /--code-comment:\s*#939391;/);
  assert.match(lightBlock, /--code-parameter:\s*#bc7559;/);
  assert.match(lightBlock, /--code-punctuation:\s*#6f6d68;/);
  assert.match(lightBlock, /--code-link:\s*#cc7d5e;/);

  const darkStart = css.lastIndexOf('html.dark[data-palette="claude"] {');
  assert.ok(darkStart >= 0, "missing claude dark token block");
  const darkBlock = css.slice(darkStart, css.indexOf("}", darkStart) + 1);
  assert.match(darkBlock, /--bg:\s*#24221f;/);
  assert.match(darkBlock, /--accent:\s*#da7756;/);
  assert.match(darkBlock, /--diff-added:\s*#00c853;/);
  assert.match(darkBlock, /--diff-removed:\s*#ff5f38;/);
  assert.match(darkBlock, /--code-bg:\s*#2d2d2b;/);
  assert.match(darkBlock, /--code-fg:\s*#f9f9f7;/);
  assert.match(darkBlock, /--code-keyword:\s*#ff5f38;/);
  assert.match(darkBlock, /--code-string:\s*#00c853;/);
  assert.match(darkBlock, /--code-comment:\s*#b2b2b0;/);
  assert.match(darkBlock, /--code-parameter:\s*#d28e73;/);
  assert.match(darkBlock, /--code-punctuation:\s*#a8a6a2;/);
});