import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const chatWindowSource = (
  await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8")
).replace(/\r\n/g, "\n");
const rippleBgSource = (
  await readFile(new URL("./NewSessionRippleBackground.tsx", import.meta.url), "utf8")
).replace(/\r\n/g, "\n");
const nativeThemeCss = (
  await readFile(new URL("../app/native-theme.css", import.meta.url), "utf8")
).replace(/\r\n/g, "\n");

test("ChatWindow 仅在主新会话空状态挂载水波纹背景, 不影响历史会话与侧边分屏", () => {
  assert.match(
    chatWindowSource,
    /import \{ NewSessionRippleBackground \} from "\.\/NewSessionRippleBackground";/,
  );
  assert.match(
    chatWindowSource,
    /const showNewSessionBackground = isEmptyNew && !panel;/,
  );
  assert.match(
    chatWindowSource,
    /data-new-session=\{showNewSessionBackground \? "true" : undefined\}/,
  );
  assert.match(
    chatWindowSource,
    /\{showNewSessionBackground && <NewSessionRippleBackground \/>\}/,
  );
});

test("NewSessionRippleBackground 遵循父级遮挡检测, 被动监听与卸载清理契约", () => {
  // 容器自身携带 aria-hidden="true", 必须通过 parentElement.closest 检查外部遮挡.
  assert.match(
    rippleBgSource,
    /container\.parentElement\?\.closest\("\[inert\], \[aria-hidden='true'\]"\)/,
  );
  assert.doesNotMatch(
    rippleBgSource,
    /container\.closest\("\[inert\], \[aria-hidden='true'\]"\)/,
  );

  // 动画暂停, 减动效, 被动监听与卸载清理必须成对存在.
  assert.match(rippleBgSource, /prefers-reduced-motion: reduce/);
  assert.match(rippleBgSource, /visibilitychange/);
  assert.match(rippleBgSource, /\{ passive: true \}/);
  assert.match(rippleBgSource, /cancelAnimationFrame/);
  assert.match(rippleBgSource, /clearTimeout/);
  assert.match(rippleBgSource, /\.disconnect\(\)/);
  assert.match(rippleBgSource, /removeEventListener/);
  assert.match(rippleBgSource, /canvas\.width = 0;\s*canvas\.height = 0;/);
});

test("样式层仅在 data-new-session=true 下激活透明层叠与点击穿透", () => {
  assert.match(
    nativeThemeCss,
    /\.chat-window\[data-new-session="true"\]\s*\{[^}]*isolation:\s*isolate;/,
  );
  assert.match(
    nativeThemeCss,
    /\.new-session-ripple-bg\s*\{[^}]*z-index:\s*-1;[^}]*pointer-events:\s*none;/,
  );
  assert.match(
    nativeThemeCss,
    /\.new-session-ripple-canvas\s*\{[^}]*pointer-events:\s*none;/,
  );
  assert.match(
    nativeThemeCss,
    /\.chat-window\[data-new-session="true"\] \.chat-input-shell\s*\{[^}]*background:\s*transparent !important;/,
  );
});
