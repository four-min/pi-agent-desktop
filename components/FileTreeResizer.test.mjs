import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appShellSource = (await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const themeCssSource = (await readFile(new URL("../app/native-theme.css", import.meta.url), "utf8")).replace(/\r\n/g, "\n");

test("the file list and viewer tabs are mutually exclusive full-width views", () => {
  assert.match(appShellSource, /const fileTreeShown = Boolean\(workbenchCwd\) && !panelHasViewer;/);
  assert.match(appShellSource, /\{workbenchCwd && \(rightPanelOpen \|\| fileTreeShown\) && \(/);
  assert.match(appShellSource, /style=\{\{ display: fileTreeShown \? "flex" : "none" \}\}/);
  assert.doesNotMatch(appShellSource, /data-resize-handle="file-tree"/);
  assert.match(appShellSource, /display:\s*fileTreeShown\s*\?\s*"none"\s*:\s*"flex"/);
});

test("the file list fills the right panel without a side-by-side preview split", () => {
  const block = themeCssSource.match(/\.file-tree-panel\s*\{[\s\S]*?\}/)?.[0] ?? "";
  assert.match(block, /width:\s*100%;/);
  assert.match(block, /flex:\s*1;/);
});
