import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { ComposerMascot } = await jiti.import("./ComposerMascot.tsx");
const { ChatInput } = await jiti.import("./ChatInput.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

const chatInputSource = (
  await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8")
).replace(/\r\n/g, "\n");
const nativeThemeCss = (
  await readFile(new URL("../app/native-theme.css", import.meta.url), "utf8")
).replace(/\r\n/g, "\n");

function renderWithI18n(element) {
  return renderToStaticMarkup(React.createElement(I18nProvider, null, element));
}

test("ComposerMascot 渲染完整像素精灵裁剪视窗与条带, 支持内联与静态资源模式", () => {
  const inlineHtml = renderToStaticMarkup(React.createElement(ComposerMascot));
  assert.match(inlineHtml, /class="composer-mascot dsh-claude-crab"/);
  assert.match(inlineHtml, /aria-hidden="true"/);
  assert.match(inlineHtml, /data-mascot="crab"/);
  assert.match(inlineHtml, /data-animation="idle"/);
  assert.match(inlineHtml, /data-ready="true"/);
  assert.match(inlineHtml, /--dsh-claude-mascot-x:24/);
  assert.match(inlineHtml, /--dsh-claude-mascot-y:20/);
  assert.match(inlineHtml, /--dsh-claude-mascot-w:24/);
  assert.match(inlineHtml, /--dsh-claude-mascot-h:16/);
  assert.match(inlineHtml, /--dsh-claude-mascot-cell-w:26/);
  assert.match(inlineHtml, /--dsh-claude-mascot-columns:8/);
  assert.match(inlineHtml, /--dsh-claude-mascot-strip-h:54/);
  assert.match(inlineHtml, /data:image\/png;base64,/);
  assert.match(inlineHtml, /transform:translate\(-2px, -2px\)/);

  const staticHtml = renderToStaticMarkup(
    React.createElement(ComposerMascot, {
      assetMode: "static",
      staticBasePath: "/mascot/crab",
    }),
  );
  assert.match(staticHtml, /\/mascot\/crab\/idle\.png/);
  assert.match(staticHtml, /\/mascot\/crab\/idle-ink\.png/);
});

test("ChatInput 在主输入框 (.chat-composer) 挂载像素吉祥物, 在 compact 模式下不挂载", () => {
  assert.match(
    chatInputSource,
    /import \{ ComposerMascot \} from "\.\/ComposerMascot";/,
  );

  const mainHtml = renderWithI18n(
    React.createElement(ChatInput, {
      onSend() {},
      onAbort() {},
      isStreaming: false,
    }),
  );
  assert.match(mainHtml, /class="chat-composer"[^>]*><span class="composer-mascot dsh-claude-crab"/);

  const compactHtml = renderWithI18n(
    React.createElement(ChatInput, {
      compact: true,
      onSend() {},
      onAbort() {},
      isStreaming: false,
    }),
  );
  assert.doesNotMatch(compactHtml, /composer-mascot/);
});

test("native-theme.css 保证输入框上沿零偏差对齐, 点击穿透与像素级锐利缩放", () => {
  assert.match(
    nativeThemeCss,
    /\.chat-composer\s*\{[^}]*position:\s*relative;/,
  );
  assert.match(
    nativeThemeCss,
    /\.composer-mascot,\s*\.dsh-claude-crab\s*\{[^}]*position:\s*absolute;[^}]*bottom:\s*calc\(100% \+ var\(--composer-border-width, 1px\)\);[^}]*width:\s*104px;[^}]*height:\s*72px;[^}]*pointer-events:\s*none;[^}]*image-rendering:\s*pixelated;/,
  );
  assert.match(
    nativeThemeCss,
    /\.composer-mascot-sprite,\s*\.dsh-claude-crab-sprite\s*\{[^}]*pointer-events:\s*none;[^}]*image-rendering:\s*pixelated;/,
  );
  assert.match(
    nativeThemeCss,
    /\.composer-mascot-strip,\s*\.dsh-claude-crab-strip\s*\{[^}]*image-rendering:\s*pixelated;[^}]*pointer-events:\s*none;/,
  );
  assert.match(
    nativeThemeCss,
    /\.composer-mascot-strip::after,\s*\.dsh-claude-crab-strip::after\s*\{[^}]*image-rendering:\s*pixelated;[^}]*pointer-events:\s*none;/,
  );
});

test("真实浏览器布局验收: 顶边零偏差对齐, 窗口/宽度变化跟随, 点击穿透不拦截聚焦输入, 2x 整数像素无失真", async (t) => {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    t.skip("Playwright not available");
    return;
  }

  let browser;
  try {
    const candidatePaths = [
      process.env.CHROME_PATH,
      process.env.BROWSER_EXECUTABLE_PATH,
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Users/LENOVO/.local/share/browser-binaries/chromium/chrome.exe",
      "C:/Users/LENOVO/.local/share/browser-binaries/chrome/chrome.exe",
    ].filter(Boolean);
    const executablePath = candidatePaths.find((p) => existsSync(p));
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
  } catch {
    t.skip("Chromium binary not available");
    return;
  }

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const composerHtml = renderWithI18n(
      React.createElement(ChatInput, {
        onSend() {},
        onAbort() {},
        isStreaming: false,
      }),
    );

    await page.setContent(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  :root {
    --bg: #f5f3ee;
    --bg-panel: #f5f3ee;
    --surface: #f5f3ee;
    --border: #e3ddd1;
    --text: #1d1b16;
    --text-muted: #635f56;
    --text-dim: #7f7869;
    --accent: #da7756;
    --accent-contrast: #ffffff;
    --hairline: 1px;
    --control-h-lg: 32px;
    --radius-md: 8px;
  }
  body { margin: 0; padding: 120px 24px 40px; background: var(--bg); }
  #behind-target {
    position: fixed;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 0;
  }
</style>
<style>${nativeThemeCss}</style>
</head>
<body>
  <div id="behind-target" data-testid="behind"></div>
  <div id="host-wrap" style="position: relative; z-index: 1;">${composerHtml}</div>
</body>
</html>`);

    // 1. 页面加载后: 吉祥物站在输入框上沿, 底部与输入框顶边对齐无偏差 (0px).
    const initialMetrics = await page.evaluate(async () => {
      const composer = document.querySelector(".chat-composer");
      const mascot = document.querySelector(".composer-mascot");
      const sprite = document.querySelector(".composer-mascot-sprite");
      const strip = document.querySelector(".composer-mascot-strip");
      const cRect = composer.getBoundingClientRect();
      const mRect = mascot.getBoundingClientRect();
      const sRect = sprite.getBoundingClientRect();
      const stRect = strip.getBoundingClientRect();
      const mStyle = getComputedStyle(mascot);
      const stStyle = getComputedStyle(strip);
      const afterStyle = getComputedStyle(strip, "::after");

      const bgUrl = stStyle.backgroundImage.slice(
        stStyle.backgroundImage.indexOf('"') + 1,
        stStyle.backgroundImage.lastIndexOf('"'),
      );
      const img = new Image();
      img.src = bgUrl;
      await img.decode();

      // 检查吉祥物中心点下的命中元素不是吉祥物自身 (不拦截事件).
      const hitAtMascot = document.elementFromPoint(
        sRect.left + sRect.width / 2,
        sRect.top + sRect.height / 2,
      );

      return {
        bottomDelta: Math.abs(mRect.bottom - cRect.top),
        spriteBottomDelta: Math.abs(sRect.bottom - cRect.top),
        rightOffset: cRect.right - mRect.right,
        mascotWidth: mRect.width,
        mascotHeight: mRect.height,
        spriteWidth: sRect.width,
        spriteHeight: sRect.height,
        stripWidth: stRect.width,
        stripHeight: stRect.height,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        mascotPointerEvents: mStyle.pointerEvents,
        stripPointerEvents: stStyle.pointerEvents,
        stripImageRendering: stStyle.imageRendering,
        afterImageRendering: afterStyle.imageRendering,
        hitInsideMascot: mascot.contains(hitAtMascot),
      };
    });

    assert.equal(initialMetrics.bottomDelta, 0, "mascot bottom must align with composer top (0px)");
    assert.equal(initialMetrics.spriteBottomDelta, 0, "sprite bottom must align with composer top (0px)");
    assert.equal(initialMetrics.rightOffset, 17, "mascot right offset from composer border-box right edge (16px + 1px border)");
    assert.equal(initialMetrics.mascotWidth, 104);
    assert.equal(initialMetrics.mascotHeight, 72);
    assert.equal(initialMetrics.spriteWidth, 48);
    assert.equal(initialMetrics.spriteHeight, 32);
    // 2x 整数缩放无拉伸失真.
    assert.equal(initialMetrics.stripWidth, initialMetrics.naturalWidth * 2);
    assert.equal(initialMetrics.stripHeight, initialMetrics.naturalHeight * 2);
    assert.equal(initialMetrics.mascotPointerEvents, "none");
    assert.equal(initialMetrics.stripPointerEvents, "none");
    assert.equal(initialMetrics.stripImageRendering, "pixelated");
    assert.equal(initialMetrics.afterImageRendering, "pixelated");
    assert.equal(initialMetrics.hitInsideMascot, false, "mascot must never intercept pointer hit-testing");

    // 2. 改变窗口尺寸与输入框宽度/高度后, 位置仍然精确贴合输入框上沿.
    for (const vp of [
      { width: 960, height: 720 },
      { width: 640, height: 700 },
      { width: 390, height: 667 },
    ]) {
      await page.setViewportSize(vp);
      const resized = await page.evaluate(() => {
        const composer = document.querySelector(".chat-composer");
        const mascot = document.querySelector(".composer-mascot");
        const sprite = document.querySelector(".composer-mascot-sprite");
        const cRect = composer.getBoundingClientRect();
        const mRect = mascot.getBoundingClientRect();
        const sRect = sprite.getBoundingClientRect();
        return {
          bottomDelta: Math.abs(mRect.bottom - cRect.top),
          spriteBottomDelta: Math.abs(sRect.bottom - cRect.top),
          rightOffset: cRect.right - mRect.right,
        };
      });
      assert.equal(resized.bottomDelta, 0, `bottom aligned at viewport ${vp.width}x${vp.height}`);
      assert.equal(resized.spriteBottomDelta, 0, `sprite bottom aligned at viewport ${vp.width}x${vp.height}`);
      assert.equal(resized.rightOffset, 17, `right offset preserved at viewport ${vp.width}x${vp.height}`);
    }

    // 3. 输入框可正常点击聚焦与输入.
    const textarea = page.locator(".chat-input-textarea");
    await textarea.click();
    await textarea.fill("像素小伙伴验收测试");
    const focusedAndTyped = await page.evaluate(() => {
      const el = document.querySelector(".chat-input-textarea");
      return {
        isFocused: document.activeElement === el,
        value: el.value,
      };
    });
    assert.equal(focusedAndTyped.isFocused, true, "textarea must focus normally on click");
    assert.equal(focusedAndTyped.value, "像素小伙伴验收测试");
  } finally {
    await browser.close();
  }
});

