import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script } from "node:vm";
import { createJiti } from "jiti";
import ts from "typescript";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { ChatInput } = await jiti.import("./ChatInput.tsx");
const { ComposerEnhanceButton } = await jiti.import("./ComposerEnhanceButton.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

const sourceText = readFileSync(new URL("./ChatInput.tsx", import.meta.url), "utf8");
const buttonSource = readFileSync(new URL("./ComposerEnhanceButton.tsx", import.meta.url), "utf8");

function render(props) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(ChatInput, { onSend() {}, onAbort() {}, isStreaming: false, ...props }),
    ),
  );
}

function chatInputCallback(name, context) {
  const source = ts.createSourceFile("ChatInput.tsx", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function findCallback(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) {
      return node.initializer.arguments[0];
    }
    return ts.forEachChild(node, findCallback);
  }
  const found = findCallback(source);
  assert.ok(found, `callback ${name} exists`);
  return new Script(ts.transpileModule(found.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText).runInNewContext(context);
}

test("the enhance button shows only with a handler and stays disabled on an empty draft", () => {
  assert.doesNotMatch(render({}), /composer-enhance-button/);
  const html = render({ onEnhancePrompt: async () => "x" });
  assert.match(html, /composer-enhance-button/);
  assert.match(html, /aria-label="Enhance prompt"/);
  assert.match(html, /disabled/);
  // The compact quote composer never grows the button.
  assert.doesNotMatch(render({ compact: true, onEnhancePrompt: async () => "x" }), /composer-enhance-button/);
});

test("the button becomes the cancel control while a rewrite runs", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(ComposerEnhanceButton, { pending: true, disabled: false, onEnhance() {}, onCancel() {} }),
    ),
  );
  assert.match(html, /aria-label="Cancel enhancement"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /composer-enhance-spinner/);
  assert.doesNotMatch(html, /disabled/);
});

test("a finished rewrite replaces the draft only while it is unchanged", async () => {
  function context(current, result) {
    const state = {
      valueRef: { current },
      draftKeyRef: { current: "s1" },
      enhancePendingRef: { current: false },
      enhanceGenerationRef: { current: 0 },
      applied: [],
      errors: [],
      pendingStates: [],
      onEnhancePrompt: async () => result,
      setEnhancePending(v) { state.pendingStates.push(v); },
      setEnhanceError(v) { state.errors.push(v); },
      setValue(v) { state.applied.push(v); },
      setAtQuery() {}, setHashQuery() {}, setHistoryMenuOpen() {},
      textareaRef: { current: null },
      requestAnimationFrame(fn) { fn(); },
    };
    return state;
  }

  const unchanged = context("fix the bug", "  Fix the bug in lib/x.ts, with a test.  ");
  await chatInputCallback("handleEnhance", unchanged)();
  assert.deepEqual(unchanged.applied, ["Fix the bug in lib/x.ts, with a test."]);
  assert.equal(unchanged.valueRef.current, "Fix the bug in lib/x.ts, with a test.");
  assert.deepEqual(unchanged.pendingStates, [true, false]);
  assert.deepEqual(unchanged.errors, [null]);

  // The user typed while the model worked: their text wins.
  const edited = context("fix the bug", "rewrite");
  edited.onEnhancePrompt = async () => { edited.valueRef.current = "fix the bug and add docs"; return "rewrite"; };
  await chatInputCallback("handleEnhance", edited)();
  assert.deepEqual(edited.applied, []);

  // A chat switch mid-flight discards the result.
  const switched = context("fix the bug", "rewrite");
  switched.onEnhancePrompt = async () => { switched.draftKeyRef.current = "s2"; return "rewrite"; };
  await chatInputCallback("handleEnhance", switched)();
  assert.deepEqual(switched.applied, []);
});

test("an empty draft never starts a request, and one request runs at a time", async () => {
  let calls = 0;
  const state = {
    valueRef: { current: "   " },
    draftKeyRef: { current: "s1" },
    enhancePendingRef: { current: false },
    enhanceGenerationRef: { current: 0 },
    onEnhancePrompt: async () => { calls += 1; return "x"; },
    setEnhancePending() {}, setEnhanceError() {}, setValue() {},
    setAtQuery() {}, setHashQuery() {}, setHistoryMenuOpen() {},
    textareaRef: { current: null },
    requestAnimationFrame(fn) { fn(); },
  };
  const enhance = chatInputCallback("handleEnhance", state);
  await enhance();
  assert.equal(calls, 0);

  state.valueRef.current = "draft";
  state.enhancePendingRef.current = true;
  await enhance();
  assert.equal(calls, 0);
});

test("a failed rewrite reports the error and an abort stays silent", async () => {
  function context(error) {
    const state = {
      valueRef: { current: "draft" },
      draftKeyRef: { current: "s1" },
      enhancePendingRef: { current: false },
      enhanceGenerationRef: { current: 0 },
      errors: [],
      onEnhancePrompt: async () => { throw error; },
      setEnhancePending() {},
      setEnhanceError(v) { state.errors.push(v); },
      setValue() {}, setAtQuery() {}, setHashQuery() {}, setHistoryMenuOpen() {},
      textareaRef: { current: null },
      requestAnimationFrame(fn) { fn(); },
    };
    return state;
  }
  const failed = context(new Error("401 invalid key"));
  await chatInputCallback("handleEnhance", failed)();
  assert.deepEqual(failed.errors, [null, "Error: 401 invalid key"]);

  const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
  const cancelled = context(abort);
  await chatInputCallback("handleEnhance", cancelled)();
  assert.deepEqual(cancelled.errors, [null]);
});

test("the wiring reaches the session route and the settings row", () => {
  const chatWindow = readFileSync(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
  assert.match(chatWindow, /onEnhancePrompt=\{handleEnhancePrompt\}/);
  assert.match(chatWindow, /onEnhanceCancel=\{promptEnhance\.cancel\}/);
  const hook = readFileSync(new URL("../hooks/usePromptEnhance.ts", import.meta.url), "utf8");
  assert.match(hook, /\/enhance-prompt/);
  assert.match(sourceText, /<ComposerEnhanceButton/);
  assert.match(buttonSource, /chat\.enhancePrompt/);
  const settings = readFileSync(new URL("./SettingsPanel.tsx", import.meta.url), "utf8");
  assert.match(settings, /<PromptEnhanceSettingRow \/>/);
  const settingRow = readFileSync(new URL("./PromptEnhanceSettingRow.tsx", import.meta.url), "utf8");
  assert.match(settingRow, /settings\.promptEnhancePrompt/);
  assert.match(settingRow, /settings\.promptEnhancePromptReset/);
  assert.match(settingRow, /handleResetPrompt/);
});

test("a brand-new session shows the button and creates its runtime on demand", () => {
  const chatWindow = readFileSync(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
  // Visibility no longer waits for a session id: a cwd a session could start in is enough.
  assert.match(chatWindow, /canEnhancePrompt = Boolean\(session\?\.id \?\? sessionIdRef\.current \?\? newSessionCwd\)/);
  assert.match(chatWindow, /enhanceDraft\(ensureSessionForEnhance, draft\)/);
  // The resolver goes through ensure_session (no message, no run, no promotion).
  const agentSession = readFileSync(new URL("../hooks/useAgentSession.ts", import.meta.url), "utf8");
  assert.match(agentSession, /const ensureSessionForEnhance = useCallback\(async \(\): Promise<string \| null> => \{[\s\S]*?sessionIdRef\.current \?\? await ensureNewSession\(\)/);
  assert.match(agentSession, /ensureSessionForEnhance, setActiveLeafId/);
});

test("the hook resolves the session id before the POST and a null resolution fails cleanly", async () => {
  const { usePromptEnhance } = await jiti.import("@/hooks/usePromptEnhance.ts");
  // Drive the callback body directly: React hooks need a renderer, the logic does not.
  const hookSource = readFileSync(new URL("../hooks/usePromptEnhance.ts", import.meta.url), "utf8");
  const source = ts.createSourceFile("usePromptEnhance.ts", hookSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function findEnhance(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "enhance") {
      return node.initializer.arguments[0];
    }
    return ts.forEachChild(node, findEnhance);
  }
  const body = findEnhance(source);
  assert.ok(body);
  const calls = [];
  const context = {
    controllerRef: { current: null },
    setPending() {},
    DOMException,
    AbortController,
    encodeURIComponent,
    JSON,
    Error,
    fetch: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, json: async () => ({ text: "rewritten" }) };
    },
  };
  const enhance = new Script(ts.transpileModule(body.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText).runInNewContext(context);

  assert.equal(await enhance(async () => "sid-1", "draft"), "rewritten");
  assert.equal(calls[0].url, "/api/agent/sid-1/enhance-prompt");
  assert.deepEqual(calls[0].body, { draft: "draft" });

  // No session could be created (no cwd): a clean error, no POST.
  await assert.rejects(() => enhance(async () => null, "draft"), /No session is available/);
  assert.equal(calls.length, 1);
  assert.ok(usePromptEnhance);
});