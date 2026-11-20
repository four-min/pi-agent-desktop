"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  buildRippleColorLut,
  cellBaseCharIndex,
  createRippleSource,
  FALLBACK_DARK_BASE_RGB,
  FALLBACK_LIGHT_BASE_RGB,
  isRippleExpired,
  parseCssRgb,
  pickRippleOrigin,
  pushRipple,
  resolveRippleConfig,
  RIPPLE_LUT_CALM_INDEX,
  RIPPLE_LUT_SIZE,
  rippleHeightToLutIndex,
  sampleCellRipple,
  type CellRippleSample,
  type NewSessionRippleConfig,
  type RippleSource,
} from "@/lib/new-session-ripple";

export interface NewSessionRippleBackgroundProps {
  /** 可选的水波纹与字符矩阵覆写参数. */
  config?: Partial<NewSessionRippleConfig>;
  /** 附加到背景容器的额外类名. */
  className?: string;
}

interface RippleGridBuffers {
  cols: number;
  rows: number;
  total: number;
  xs: Float32Array;
  ys: Float32Array;
  baseIndices: Uint16Array;
  drawX: Float32Array;
  drawY: Float32Array;
  drawCharIdx: Uint16Array;
  drawScale: Float32Array;
  bucketIndices: Int32Array[];
  bucketCounts: Int32Array;
}

const INTERACTIVE_TARGET_SELECTOR =
  ".chat-composer, button, input, textarea, select, a, [role='menu'], [role='dialog'], [role='listbox']";

const DEFAULT_MONO_FONT_STACK =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

function allocateGridBuffers(
  width: number,
  height: number,
  spacing: number,
  charsetLength: number,
): RippleGridBuffers {
  const cols = Math.max(1, Math.ceil(width / spacing) + 1);
  const rows = Math.max(1, Math.ceil(height / spacing) + 1);
  const total = cols * rows;
  const offsetX = (width - (cols - 1) * spacing) * 0.5;
  const offsetY = (height - (rows - 1) * spacing) * 0.5;

  const xs = new Float32Array(total);
  const ys = new Float32Array(total);
  const baseIndices = new Uint16Array(total);

  let idx = 0;
  for (let row = 0; row < rows; row++) {
    const y = offsetY + row * spacing;
    for (let col = 0; col < cols; col++) {
      xs[idx] = offsetX + col * spacing;
      ys[idx] = y;
      baseIndices[idx] = cellBaseCharIndex(col, row, charsetLength);
      idx++;
    }
  }

  return {
    cols,
    rows,
    total,
    xs,
    ys,
    baseIndices,
    drawX: new Float32Array(total),
    drawY: new Float32Array(total),
    drawCharIdx: new Uint16Array(total),
    drawScale: new Float32Array(total),
    bucketIndices: Array.from({ length: RIPPLE_LUT_SIZE }, () => new Int32Array(total)),
    bucketCounts: new Int32Array(RIPPLE_LUT_SIZE),
  };
}

/**
 * 新会话页底层的 Canvas 2D 水波纹字符阵列背景.
 * 位于前景之下 (pointer-events: none), 随主题切换配色并在页面隐藏/卸载时完整释放资源.
 */
export function NewSessionRippleBackground({
  config,
  className,
}: NewSessionRippleBackgroundProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const configKey = config ? JSON.stringify(config) : "";
  const resolvedConfig = useMemo(
    () => resolveRippleConfig(config),
    // 仅在配置内容实质变化时重建引擎参数, 避免父组件重渲染打断正在扩散的波纹.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [configKey],
  );

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const chars = Array.from(resolvedConfig.charset);
    const charCount = Math.max(1, chars.length);

    let disposed = false;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let fontStack = DEFAULT_MONO_FONT_STACK;
    let lut = buildRippleColorLut(
      FALLBACK_LIGHT_BASE_RGB,
      FALLBACK_LIGHT_BASE_RGB,
      resolvedConfig.baseOpacityLight,
      resolvedConfig.peakOpacityLight,
      resolvedConfig.accentTintStrength,
    );
    let grid: RippleGridBuffers | null = null;
    const ripples: RippleSource[] = [];
    const sample: CellRippleSample = { height: 0, dx: 0, dy: 0, energy: 0 };

    let rafId: number | null = null;
    let spawnTimer: number | null = null;
    let pausedAt: number | null = null;
    let autoSeed = 0;
    let hasInitializedInitialRipple = false;
    let lastPointerMoveAt = 0;
    let lastPointerX = -1;
    let lastPointerY = -1;

    const motionQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    let reducedMotion = Boolean(motionQuery?.matches);

    const isPaused = (): boolean => {
      if (disposed || document.hidden || reducedMotion || width <= 0 || height <= 0) {
        return true;
      }
      // 容器自身带 aria-hidden="true", 需从 parentElement 向上检测模态/页面覆盖遮挡.
      return Boolean(container.parentElement?.closest("[inert], [aria-hidden='true']"));
    };

    const applyCanvasState = () => {
      if (width <= 0 || height <= 0) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `500 ${resolvedConfig.fontSize}px ${fontStack}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
    };

    const refreshThemeAndFont = () => {
      const rootEl = document.documentElement;
      const isDark =
        rootEl.classList.contains("dark") || rootEl.dataset.theme === "dark";
      const containerStyle = getComputedStyle(container);
      const canvasStyle = getComputedStyle(canvas);

      const fallbackBase = isDark ? FALLBACK_DARK_BASE_RGB : FALLBACK_LIGHT_BASE_RGB;
      const baseRgb =
        resolvedConfig.colorOverride?.baseRgb ??
        parseCssRgb(containerStyle.color, fallbackBase);
      const accentRgb =
        resolvedConfig.colorOverride?.accentRgb ??
        parseCssRgb(canvasStyle.color, baseRgb);

      const baseOpacity = isDark
        ? resolvedConfig.baseOpacityDark
        : resolvedConfig.baseOpacityLight;
      const peakOpacity = isDark
        ? resolvedConfig.peakOpacityDark
        : resolvedConfig.peakOpacityLight;

      lut = buildRippleColorLut(
        baseRgb,
        accentRgb,
        baseOpacity,
        peakOpacity,
        resolvedConfig.accentTintStrength,
      );

      const mono = containerStyle.getPropertyValue("--font-mono").trim();
      fontStack = mono || DEFAULT_MONO_FONT_STACK;
      applyCanvasState();
    };

    const stopLoop = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const clearSpawnTimer = () => {
      if (spawnTimer !== null) {
        window.clearTimeout(spawnTimer);
        spawnTimer = null;
      }
    };

    const paintFrame = (now: number) => {
      if (!grid || width <= 0 || height <= 0) return;

      const effectiveMaxRadius = Math.min(
        resolvedConfig.maxRadius,
        Math.hypot(width, height) + resolvedConfig.ringWidth * 2,
      );

      for (let i = ripples.length - 1; i >= 0; i--) {
        if (isRippleExpired(ripples[i], now, effectiveMaxRadius)) {
          ripples.splice(i, 1);
        }
      }

      ctx.clearRect(0, 0, width, height);

      const {
        total,
        xs,
        ys,
        baseIndices,
        drawX,
        drawY,
        drawCharIdx,
        drawScale,
        bucketIndices,
        bucketCounts,
      } = grid;

      bucketCounts.fill(0);
      const hasActiveRipples = ripples.length > 0 && !reducedMotion;

      for (let i = 0; i < total; i++) {
        const x = xs[i];
        const y = ys[i];

        if (!hasActiveRipples) {
          drawX[i] = x;
          drawY[i] = y;
          drawCharIdx[i] = baseIndices[i];
          drawScale[i] = 1;
          const bucketCount = bucketCounts[RIPPLE_LUT_CALM_INDEX];
          bucketIndices[RIPPLE_LUT_CALM_INDEX][bucketCount] = i;
          bucketCounts[RIPPLE_LUT_CALM_INDEX] = bucketCount + 1;
          continue;
        }

        sampleCellRipple(x, y, ripples, now, resolvedConfig, sample);
        if (sample.energy < 0.025) {
          drawX[i] = x;
          drawY[i] = y;
          drawCharIdx[i] = baseIndices[i];
          drawScale[i] = 1;
          const bucketCount = bucketCounts[RIPPLE_LUT_CALM_INDEX];
          bucketIndices[RIPPLE_LUT_CALM_INDEX][bucketCount] = i;
          bucketCounts[RIPPLE_LUT_CALM_INDEX] = bucketCount + 1;
          continue;
        }

        const bucket = rippleHeightToLutIndex(sample.height);
        drawX[i] = x + sample.dx;
        drawY[i] = y + sample.dy;
        drawScale[i] =
          sample.height > 0
            ? 1 + Math.min(1, sample.height) * resolvedConfig.scaleBoost
            : 1;

        const shift =
          resolvedConfig.glyphShiftSteps > 0 && sample.height > 0.14
            ? Math.round(Math.min(1, sample.height) * resolvedConfig.glyphShiftSteps)
            : 0;
        drawCharIdx[i] =
          shift > 0 ? (baseIndices[i] + shift) % charCount : baseIndices[i];

        const bucketCount = bucketCounts[bucket];
        bucketIndices[bucket][bucketCount] = i;
        bucketCounts[bucket] = bucketCount + 1;
      }

      for (let b = 0; b < RIPPLE_LUT_SIZE; b++) {
        const count = bucketCounts[b];
        if (count === 0) continue;

        ctx.fillStyle = lut[b];
        const indices = bucketIndices[b];

        for (let k = 0; k < count; k++) {
          const idx = indices[k];
          const ch = chars[drawCharIdx[idx]];
          const sc = drawScale[idx];
          if (sc > 1.01) {
            ctx.save();
            ctx.translate(drawX[idx], drawY[idx]);
            ctx.scale(sc, sc);
            ctx.fillText(ch, 0, 0);
            ctx.restore();
          } else {
            ctx.fillText(ch, drawX[idx], drawY[idx]);
          }
        }
      }
    };

    const nextAutoDelayMs = (): number => {
      const jitter = (Math.random() * 2 - 1) * resolvedConfig.autoJitterMs;
      return Math.max(300, resolvedConfig.autoIntervalMs + jitter);
    };

    const tick = (now: number) => {
      rafId = null;
      if (disposed || isPaused()) return;

      paintFrame(now);
      if (ripples.length > 0) {
        rafId = window.requestAnimationFrame(tick);
      } else if (resolvedConfig.autoRipple && spawnTimer === null) {
        scheduleAutoRipple(nextAutoDelayMs());
      }
    };

    const ensureRunning = () => {
      if (disposed || isPaused()) return;
      if (rafId === null) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const emitRipple = (
      x: number,
      y: number,
      now: number,
      amplitudeScale = 1,
    ) => {
      if (disposed || isPaused()) return;
      pushRipple(
        ripples,
        createRippleSource(x, y, now, resolvedConfig, amplitudeScale),
        resolvedConfig.maxRipples,
      );
      ensureRunning();
    };

    function scheduleAutoRipple(delayMs: number) {
      clearSpawnTimer();
      if (disposed || !resolvedConfig.autoRipple || isPaused()) return;
      spawnTimer = window.setTimeout(() => {
        spawnTimer = null;
        if (disposed || !resolvedConfig.autoRipple || isPaused()) return;
        const now = performance.now();
        const origin = pickRippleOrigin(
          width,
          height,
          resolvedConfig.originMode,
          resolvedConfig.originRatio,
          autoSeed++,
        );
        emitRipple(origin.x, origin.y, now, 1);
        scheduleAutoRipple(nextAutoDelayMs());
      }, delayMs);
    }

    const syncLifecycleState = () => {
      if (disposed) return;
      const now = performance.now();

      if (isPaused()) {
        stopLoop();
        clearSpawnTimer();
        if (pausedAt === null) pausedAt = now;
        if (reducedMotion && width > 0 && height > 0) {
          ripples.length = 0;
          paintFrame(now);
        }
        return;
      }

      if (pausedAt !== null) {
        const delta = now - pausedAt;
        pausedAt = null;
        for (let i = 0; i < ripples.length; i++) {
          ripples[i].startTime += delta;
        }
      }

      if (!hasInitializedInitialRipple) {
        hasInitializedInitialRipple = true;
        const origin = pickRippleOrigin(
          width,
          height,
          resolvedConfig.originMode,
          resolvedConfig.originRatio,
          autoSeed++,
        );
        pushRipple(
          ripples,
          createRippleSource(origin.x, origin.y, now, resolvedConfig, 1),
          resolvedConfig.maxRipples,
        );
      }

      if (resolvedConfig.autoRipple && spawnTimer === null) {
        scheduleAutoRipple(nextAutoDelayMs());
      }

      paintFrame(now);
      if (ripples.length > 0) {
        ensureRunning();
      }
    };

    const updateCanvasSize = () => {
      if (disposed) return;
      const rect = container.getBoundingClientRect();
      const nextWidth = Math.max(0, Math.round(rect.width));
      const nextHeight = Math.max(0, Math.round(rect.height));
      const nextDpr = Math.min(resolvedConfig.maxDpr, window.devicePixelRatio || 1);

      if (nextWidth === width && nextHeight === height && nextDpr === dpr && grid) {
        return;
      }

      width = nextWidth;
      height = nextHeight;
      dpr = nextDpr;

      if (width === 0 || height === 0) {
        canvas.width = 0;
        canvas.height = 0;
        grid = null;
        syncLifecycleState();
        return;
      }

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      grid = allocateGridBuffers(width, height, resolvedConfig.cellSpacing, charCount);
      refreshThemeAndFont();
      syncLifecycleState();
    };

    const handleVisibilityOrAncestorChange = () => {
      syncLifecycleState();
    };

    const handleMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      syncLifecycleState();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!resolvedConfig.pointerRipple || isPaused()) return;
      if (
        event.target instanceof Element &&
        event.target.closest(INTERACTIVE_TARGET_SELECTOR)
      ) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
      emitRipple(x, y, performance.now(), 1.1);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!resolvedConfig.pointerRipple || isPaused()) return;
      if (
        event.target instanceof Element &&
        event.target.closest(INTERACTIVE_TARGET_SELECTOR)
      ) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

      const now = performance.now();
      if (now - lastPointerMoveAt < resolvedConfig.pointerThrottleMs) return;
      if (
        lastPointerX >= 0 &&
        Math.hypot(x - lastPointerX, y - lastPointerY) <
          resolvedConfig.pointerMinDistancePx
      ) {
        return;
      }
      lastPointerMoveAt = now;
      lastPointerX = x;
      lastPointerY = y;
      emitRipple(x, y, now, 0.5);
    };

    updateCanvasSize();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateCanvasSize);
    resizeObserver?.observe(container);

    const themeObserver = new MutationObserver(() => {
      if (disposed) return;
      refreshThemeAndFont();
      if (width > 0 && height > 0) paintFrame(performance.now());
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-palette", "style"],
    });

    const ancestorObserver = new MutationObserver(handleVisibilityOrAncestorChange);
    let ancestor: HTMLElement | null = container.parentElement;
    while (ancestor && ancestor !== document.documentElement) {
      ancestorObserver.observe(ancestor, {
        attributes: true,
        attributeFilter: ["inert", "aria-hidden"],
      });
      ancestor = ancestor.parentElement;
    }

    document.addEventListener("visibilitychange", handleVisibilityOrAncestorChange);
    motionQuery?.addEventListener("change", handleMotionChange);

    const host = container.parentElement;
    if (host) {
      host.addEventListener("pointerdown", handlePointerDown, { passive: true });
      host.addEventListener("pointermove", handlePointerMove, { passive: true });
    }

    void document.fonts?.ready.then(() => {
      if (disposed) return;
      refreshThemeAndFont();
      if (width > 0 && height > 0) paintFrame(performance.now());
    });

    return () => {
      disposed = true;
      stopLoop();
      clearSpawnTimer();
      resizeObserver?.disconnect();
      themeObserver.disconnect();
      ancestorObserver.disconnect();
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityOrAncestorChange,
      );
      motionQuery?.removeEventListener("change", handleMotionChange);
      if (host) {
        host.removeEventListener("pointerdown", handlePointerDown);
        host.removeEventListener("pointermove", handlePointerMove);
      }
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [resolvedConfig]);

  return (
    <div
      ref={containerRef}
      className={
        className ? `new-session-ripple-bg ${className}` : "new-session-ripple-bg"
      }
      aria-hidden="true"
      data-testid="new-session-ripple-bg"
    >
      <canvas ref={canvasRef} className="new-session-ripple-canvas" />
    </div>
  );
}
