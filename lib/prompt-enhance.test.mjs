import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  PROMPT_ENHANCE_MAX_CHARS,
  buildPromptEnhanceRequest,
  enhancePrompt,
  parseEnhancedPrompt,
  resolveEnhanceThinkingLevel,
} = await jiti.import("./prompt-enhance.ts");

function model(overrides = {}) {
  return { id: "test-model", provider: "test", api: "openai-completions", reasoning: false, ...overrides };
}

function assistantMessage(text, stopReason = "stop") {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "test",
    provider: "test",
    model: "test-model",
    stopReason,
    timestamp: Date.now(),
  };
}

test("the rewrite request is one bounded user turn with the draft inside", () => {
  const { context, options } = buildPromptEnhanceRequest(model(), "fix the bug");
  assert.equal(context.messages.length, 1);
  assert.equal(context.messages[0].role, "user");
  const text = context.messages[0].content[0].text;
  assert.match(text, /<draft>\nfix the bug\n<\/draft>/);
  assert.match(context.systemPrompt, /rewritten prompt only/);
  assert.equal(options.cacheRetention, "none");
  assert.ok(options.maxTokens > 0 && options.maxTokens <= 8192);
  assert.ok(options.sessionId);
  // A non-reasoning model gets no reasoning field at all.
  assert.equal("reasoning" in options, false);
});

test("reasoning models rewrite at their cheapest supported level", () => {
  assert.equal(resolveEnhanceThinkingLevel(model()), "off");
  const gemini = model({ id: "gemini-3-pro", api: "google-generative-ai", reasoning: true });
  assert.notEqual(resolveEnhanceThinkingLevel(gemini), "off");
  assert.notEqual(resolveEnhanceThinkingLevel(gemini), "minimal");
});

test("cleans a whole-answer fence but keeps inner code blocks", () => {
  assert.equal(parseEnhancedPrompt("```markdown\nDo the thing.\n```"), "Do the thing.");
  assert.equal(parseEnhancedPrompt("  Do the thing.  "), "Do the thing.");
  const withCode = "Use:\n```js\nrun();\n```";
  assert.equal(parseEnhancedPrompt(withCode), withCode);
  assert.throws(() => parseEnhancedPrompt("  \n "), /empty rewrite/);
});

test("runs one completion through the runtime and returns its text", async () => {
  let seen;
  const runtime = {
    async completeSimple(m, context, options) {
      seen = { model: m, context, options };
      return assistantMessage("A clearer, fuller prompt.");
    },
  };
  const text = await enhancePrompt(runtime, model(), "make it better");
  assert.equal(text, "A clearer, fuller prompt.");
  assert.match(seen.context.messages[0].content[0].text, /make it better/);
  assert.ok(seen.options.signal instanceof AbortSignal);
});

test("refuses an empty or oversized draft before any request", async () => {
  const runtime = { async completeSimple() { throw new Error("must not be called"); } };
  await assert.rejects(() => enhancePrompt(runtime, model(), "   "), /empty/);
  await assert.rejects(() => enhancePrompt(runtime, model(), "x".repeat(PROMPT_ENHANCE_MAX_CHARS + 1)), /limited to/);
});

test("surfaces model errors and empty answers as failures", async () => {
  const failing = { async completeSimple() { return { ...assistantMessage(""), stopReason: "error", errorMessage: "401 invalid key" }; } };
  await assert.rejects(() => enhancePrompt(failing, model(), "draft"), /401 invalid key/);
  const empty = { async completeSimple() { return assistantMessage("  "); } };
  await assert.rejects(() => enhancePrompt(empty, model(), "draft"), /empty rewrite/);
});