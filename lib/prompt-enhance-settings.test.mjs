import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  DEFAULT_PROMPT_ENHANCE_INSTRUCTIONS,
  PROMPT_ENHANCE_INSTRUCTIONS_MAX_CHARS,
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

test("defaults to following the conversation and built-in instructions, and malformed blocks read as unset", () => {
  assert.deepEqual(readPromptEnhanceSettings(settingsFile()), { model: null, prompt: "" });
  assert.deepEqual(parsePromptEnhanceSettings({ model: { provider: "p" }, prompt: 42 }), { model: null, prompt: "" });
  assert.deepEqual(parsePromptEnhanceSettings({ model: { provider: "", modelId: "m" }, prompt: "   " }), { model: null, prompt: "" });
  assert.deepEqual(parsePromptEnhanceSettings({ prompt: DEFAULT_PROMPT_ENHANCE_INSTRUCTIONS }), { model: null, prompt: "" });
  assert.deepEqual(parsePromptEnhanceSettings("nonsense"), { model: null, prompt: "" });
  // An unreadable file must not break the enhance request.
  assert.deepEqual(readPromptEnhanceSettings(settingsFile("{not json")), { model: null, prompt: "" });
});

test("writes merge into Pi Web's settings and keep the other keys", () => {
  const path = settingsFile({ version: 1, artifactsPrompt: false, autoTitle: true });
  const saved = writePromptEnhanceSettings({ model: { provider: "p", modelId: "m" } }, path);
  assert.deepEqual(saved, { model: { provider: "p", modelId: "m" }, prompt: "" });
  const stored = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(stored.artifactsPrompt, false);
  assert.equal(stored.autoTitle, true);
  assert.deepEqual(stored.promptEnhance, { model: { provider: "p", modelId: "m" } });

  // Custom prompt merges without clobbering the configured model.
  const withPrompt = writePromptEnhanceSettings({ prompt: "Rewrite in Chinese only." }, path);
  assert.deepEqual(withPrompt, { model: { provider: "p", modelId: "m" }, prompt: "Rewrite in Chinese only." });
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")).promptEnhance, {
    model: { provider: "p", modelId: "m" },
    prompt: "Rewrite in Chinese only.",
  });

  // Resetting to the built-in instructions or empty string drops prompt from the file.
  assert.deepEqual(
    writePromptEnhanceSettings({ prompt: DEFAULT_PROMPT_ENHANCE_INSTRUCTIONS }, path),
    { model: { provider: "p", modelId: "m" }, prompt: "" },
  );
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")).promptEnhance, { model: { provider: "p", modelId: "m" } });

  // null clears the model choice and drops it out of the file.
  assert.deepEqual(writePromptEnhanceSettings({ model: null }, path), { model: null, prompt: "" });
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")).promptEnhance, {});
});

test("a patch is validated before anything is written", () => {
  assert.deepEqual(validatePromptEnhancePatch({ model: null }), { model: null });
  assert.deepEqual(validatePromptEnhancePatch({ model: { provider: "p", modelId: "m" } }), { model: { provider: "p", modelId: "m" } });
  assert.deepEqual(validatePromptEnhancePatch({ prompt: "Custom rewrite prompt" }), { prompt: "Custom rewrite prompt" });
  assert.deepEqual(validatePromptEnhancePatch({ prompt: null }), { prompt: "" });
  assert.deepEqual(validatePromptEnhancePatch({ prompt: "   " }), { prompt: "" });
  assert.deepEqual(validatePromptEnhancePatch({ prompt: DEFAULT_PROMPT_ENHANCE_INSTRUCTIONS }), { prompt: "" });
  assert.throws(() => validatePromptEnhancePatch({}), /model or prompt is required/);
  assert.throws(() => validatePromptEnhancePatch({ model: { provider: "p" } }), /model must be/);
  assert.throws(() => validatePromptEnhancePatch({ model: "p/m" }), /model must be/);
  assert.throws(() => validatePromptEnhancePatch({ prompt: 123 }), /prompt must be/);
  assert.throws(
    () => validatePromptEnhancePatch({ prompt: "x".repeat(PROMPT_ENHANCE_INSTRUCTIONS_MAX_CHARS + 1) }),
    /limited to/,
  );
  assert.throws(() => validatePromptEnhancePatch([]), /object/);
});