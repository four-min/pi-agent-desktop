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