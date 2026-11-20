import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ModelSelector.tsx", import.meta.url), "utf8");

test("does not autofocus the model filter on mobile", () => {
  // Autofocus would open the on-screen keyboard as soon as the picker opens.
  assert.match(source, /aria-label=\{t\("chat\.filterModels"\)\}[\s\S]*?autoFocus=\{!isMobile\}/);
  assert.doesNotMatch(source, /^\s*autoFocus\s*$/m);
});

test("groups show the provider's display name and the filter matches it, its id and provider/model (M4)", async () => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
  const { filterModelOptions } = await jiti.import("./ModelSelector.tsx");
  const options = [
    { provider: "zai-coding-cn", providerName: "Z.AI Coding CN", modelId: "glm-5.3", name: "GLM-5.3" },
    { provider: "deepseek", providerName: "DeepSeek", modelId: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
    { provider: "aliyun-bailian", modelId: "qwen3.7-plus", name: "Qwen 3.7 Plus" },
  ];
  const ids = (query) => filterModelOptions(options, query).map((option) => option.modelId);
  assert.deepEqual(ids("z.ai coding"), ["glm-5.3"]);
  assert.deepEqual(ids("zai-coding-cn"), ["glm-5.3"]);
  assert.deepEqual(ids("aliyun-bailian/qwen"), ["qwen3.7-plus"]);
  assert.deepEqual(ids("deepseek"), ["deepseek-v4-pro"]);
  assert.match(source, /label: option\.providerName \|\| option\.provider/);
  assert.match(source, /\{group\.label\}/);
  assert.doesNotMatch(source, /textTransform: "uppercase"/);
});

test("caps upward model menu height below the topbar when composer is centered on a new session", async () => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
  const { computeModelSelectorPopupLayout, getModelSelectorTopBoundary } = await jiti.import("./ModelSelector.tsx");

  // Centered composer on an 820px viewport with a 48px app topbar:
  // anchorRect.top = 488 -> menu bottom = 482 -> maxHeight must not exceed 482 - 48 - 8 = 426,
  // so popup top is 482 - 426 = 56 >= 48 + 8 (never hidden behind the topbar).
  const layout = computeModelSelectorPopupLayout({
    anchorRect: { top: 488, bottom: 520 },
    viewportHeight: 820,
    visibleTop: 48,
    placement: "up",
  });
  assert.equal(layout.openAbove, true);
  assert.equal(layout.maxHeight, 426);
  const popupBottom = 820 - layout.verticalPosition.bottom;
  const popupTop = popupBottom - layout.maxHeight;
  assert.ok(popupTop >= 48 + 8, `popup top ${popupTop} must stay below topbar (48 + 8)`);

  // Verify DOM boundary detection against .app-topbar and overflow:hidden ancestors
  const origWindow = globalThis.window;
  const origDocument = globalThis.document;
  try {
    const parentEl = {
      parentElement: null,
      clientTop: 0,
      getBoundingClientRect: () => ({ left: 200, right: 1200, top: 48, bottom: 820 }),
    };
    const triggerEl = {
      parentElement: parentEl,
      getBoundingClientRect: () => ({ left: 400, right: 560, top: 488, bottom: 520 }),
    };
    globalThis.window = {
      visualViewport: { offsetTop: 0 },
      getComputedStyle: () => ({ overflowY: "hidden" }),
    };
    globalThis.document = {
      querySelectorAll: () => [
        {
          clientTop: 0,
          getBoundingClientRect: () => ({ left: 200, right: 1200, top: 0, bottom: 48 }),
        },
      ],
    };
    assert.equal(getModelSelectorTopBoundary(triggerEl), 48);
  } finally {
    globalThis.window = origWindow;
    globalThis.document = origDocument;
  }
});
