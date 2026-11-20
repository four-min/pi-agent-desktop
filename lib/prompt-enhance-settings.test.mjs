import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  parsePromptEnhanceSettings,
  readPromptEnhanceSettings,
  validatePromptEnhancePatch,
  writePromptEnhanceSettings,
} = await jiti.import("./prompt-enhance-settings.ts");

function settingsFile(initial) {
  const dir = mkdtempSync(join(tmpdir(), "pi-prompt-enhance-"));
  const path = join(dir, "pi-web", "settings.json");
  if (initial !== undefined) {
    mkdirSync(join(dir, "pi-web"));
    writeFileSync(path, typeof initial === "string" ? initial : JSON.stringify(initial));
  }
  return path;
}

test("defaults to following the conversation, and malformed blocks read as unset", () => {
  assert.deepEqual(readPromptEnhanceSettings(settingsFile()), { model: null });
  assert.deepEqual(parsePromptEnhanceSettings({ model: { provider: "p" } }), { model: null });
  assert.deepEqual(parsePromptEnhanceSettings({ model: { provider: "", modelId: "m" } }), { model: null });
  assert.deepEqual(parsePromptEnhanceSettings("nonsense"), { model: null });
  // An unreadable file must not break the enhance request.
  assert.deepEqual(readPromptEnhanceSettings(settingsFile("{not json")), { model: null });
});

test("writes merge into Pi Web's settings and keep the other keys", () => {
  const path = settingsFile({ version: 1, artifactsPrompt: false, autoTitle: true });
  const saved = writePromptEnhanceSettings({ model: { provider: "p", modelId: "m" } }, path);
  assert.deepEqual(saved, { model: { provider: "p", modelId: "m" } });
  const stored = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(stored.artifactsPrompt, false);
  assert.equal(stored.autoTitle, true);
  assert.deepEqual(stored.promptEnhance, { model: { provider: "p", modelId: "m" } });
  // null clears the choice and drops the model out of the file.
  assert.deepEqual(writePromptEnhanceSettings({ model: null }, path), { model: null });
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")).promptEnhance, {});
});

test("a patch is validated before anything is written", () => {
  assert.deepEqual(validatePromptEnhancePatch({ model: null }), { model: null });
  assert.deepEqual(validatePromptEnhancePatch({ model: { provider: "p", modelId: "m" } }), { model: { provider: "p", modelId: "m" } });
  assert.throws(() => validatePromptEnhancePatch({}), /model is required/);
  assert.throws(() => validatePromptEnhancePatch({ model: { provider: "p" } }), /model must be/);
  assert.throws(() => validatePromptEnhancePatch({ model: "p/m" }), /model must be/);
  assert.throws(() => validatePromptEnhancePatch([]), /object/);
});