"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  buildSheetKeyframes,
  CRAB_FRAME_MS,
  CRAB_GUTTER,
  CRAB_IDLE_EXTRAS,
  CRAB_PIXEL_SCALE,
  CRAB_SHEET_URLS,
  CRAB_SHEETS,
  decideStage,
  finishStage,
  freshStage,
  getCrabStaticSheetUrls,
  getFrameOffsetTransform,
  getSheetDurationMs,
  getSheetStripDimensions,
  nextDecisionAt,
  resolveMascotLevel,
  switchSettles,
  takeMoment,
  type CrabAnimationKey,
  type MascotPick,
  type MascotStage,
  type MascotTurnPhase,
} from "@/lib/composer-mascot";

export interface ComposerMascotProps {
  /** 会话是否正在流式生成回复. */
  isStreaming?: boolean;
  /** 会话是否正在执行上下文压缩. */
  isCompacting?: boolean;
  /** 分支摘要是否正在生成. */
  branchSummaryPending?: boolean;
  /** 是否处于等待用户交互/通知状态. */
  hasNotification?: boolean;
  /** 当前回合阶段: 思考或输出/工具执行. */
  turnPhase?: MascotTurnPhase | null;
  /** A file-writing tool (write / edit / apply_patch) is running: plays the "building" animation. */
  isEditingFile?: boolean;
  /** 错误信息 (出现新错误时触发 error 瞬时反馈动画). */
  errorMessage?: string | null;
  /** 完成标识 (变化时触发 happy 庆祝瞬时动画). */
  completionKey?: string | number | null;
  /** 用户输入活跃信号 (如输入框草稿变化, 触发唤醒与安静计时重置). */
  activityToken?: string | number | null;
  /** 素材加载方式: "inline" 使用内联 Data URI (默认), "static" 使用 public/mascot/crab 下的静态 PNG. */
  assetMode?: "inline" | "static";
  /** 静态素材基础路径 (assetMode="static" 时生效, 默认 "/mascot/crab"). */
  staticBasePath?: string;
  /** 附加类名. */
  className?: string;
}

const ACTIVITY_THROTTLE_MS = 1000;

/**
 * 站在输入框上沿的"像素小伙伴"吉祥物组件 (Clawd 像素蟹).
 *
 * - 定位在 `.chat-composer` 顶边外沿 (`bottom: calc(100% + var(--composer-border-width, 1px))`), 脚踩输入框上沿.
 * - 全树 `pointer-events: none`, 不遮挡输入区域, 不拦截点击、聚焦、输入与提交事件.
 * - 使用 `image-rendering: pixelated` 与 2x 整数像素网格缩放 (52x36 逻辑格 -> 104x72px), 保持锐利像素质感.
 */
export function ComposerMascot({
  isStreaming = false,
  isCompacting = false,
  branchSummaryPending = false,
  hasNotification = false,
  turnPhase = null,
  isEditingFile = false,
  errorMessage = null,
  completionKey = null,
  activityToken = null,
  assetMode = "inline",
  staticBasePath = "/mascot/crab",
  className,
}: ComposerMascotProps) {
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const stripRef = useRef<HTMLSpanElement | null>(null);
  const stageRef = useRef<MascotStage>(freshStage(0));
  const animationRef = useRef<Animation | null>(null);
  const timerRef = useRef<number | null>(null);
  const reducedMotionRef = useRef<boolean>(false);
  const pageHiddenRef = useRef<boolean>(false);

  const prevStreamingRef = useRef<boolean>(isStreaming);
  const prevCompactingRef = useRef<boolean>(isCompacting);
  const prevErrorRef = useRef<string | null>(errorMessage ?? null);
  const prevCompletionRef = useRef<string | number | null>(completionKey ?? null);

  const [activeKey, setActiveKey] = useState<CrabAnimationKey>("idle");

  const resolveUrls = useCallback(
    (key: CrabAnimationKey) =>
      assetMode === "static"
        ? getCrabStaticSheetUrls(key, staticBasePath)
        : CRAB_SHEET_URLS[key],
    [assetMode, staticBasePath],
  );

  const cancelAnimation = useCallback(() => {
    if (animationRef.current !== null) {
      try {
        animationRef.current.cancel();
      } catch {
        // Ignore WAAPI cancel errors in non-browser test environments.
      }
      animationRef.current = null;
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const isStill = useCallback(() => {
    return reducedMotionRef.current || pageHiddenRef.current;
  }, []);

  const playMs = useCallback((key: CrabAnimationKey) => {
    return getSheetDurationMs(CRAB_SHEETS[key], CRAB_FRAME_MS);
  }, []);

  const applySheetToDom = useCallback(
    (key: CrabAnimationKey) => {
      const root = rootRef.current;
      if (!root) return;
      const sheet = CRAB_SHEETS[key];
      const dims = getSheetStripDimensions(sheet, CRAB_GUTTER);
      const urls = resolveUrls(key);
      const style = root.style;
      style.setProperty("--dsh-claude-mascot-x", String(sheet.box[0]));
      style.setProperty("--dsh-claude-mascot-y", String(sheet.box[1]));
      style.setProperty("--dsh-claude-mascot-w", String(sheet.box[2]));
      style.setProperty("--dsh-claude-mascot-h", String(sheet.box[3]));
      style.setProperty("--dsh-claude-mascot-cell-w", String(dims.cellWidth));
      style.setProperty("--dsh-claude-mascot-columns", String(dims.columns));
      style.setProperty("--dsh-claude-mascot-strip-h", String(dims.stripHeight));
      style.setProperty("--dsh-claude-mascot-sheet", `url("${urls.body}")`);
      style.setProperty("--dsh-claude-crab-ink", `url("${urls.ink}")`);
      if (root.getAttribute("data-animation") !== key) {
        root.setAttribute("data-animation", key);
      }
      if (!root.hasAttribute("data-ready")) {
        root.setAttribute("data-ready", "true");
      }
    },
    [resolveUrls],
  );

  const stepRef = useRef<() => void>(() => {});

  const playStrip = useCallback(
    (key: CrabAnimationKey, mode: "loop" | "once") => {
      const strip = stripRef.current;
      if (!strip) return;
      cancelAnimation();
      const sheet = CRAB_SHEETS[key];
      if (isStill() || typeof strip.animate !== "function") {
        strip.style.transform = getFrameOffsetTransform(
          sheet,
          sheet.still,
          CRAB_GUTTER,
          CRAB_PIXEL_SCALE,
        );
        return;
      }
      strip.style.transform = getFrameOffsetTransform(
        sheet,
        0,
        CRAB_GUTTER,
        CRAB_PIXEL_SCALE,
      );
      const keyframes = buildSheetKeyframes(
        sheet,
        mode,
        CRAB_GUTTER,
        CRAB_PIXEL_SCALE,
        CRAB_FRAME_MS,
      );
      const duration = getSheetDurationMs(sheet, CRAB_FRAME_MS);
      const playing = strip.animate(keyframes, {
        duration,
        iterations: mode === "loop" ? Infinity : 1,
        fill: "forwards",
      });
      animationRef.current = playing;
      if (mode !== "once") return;
      playing.finished?.then(
        () => {
          const stage = stageRef.current;
          if (
            !stage ||
            animationRef.current !== playing ||
            stage.current === null ||
            stage.current.key !== key ||
            stage.current.done === true
          ) {
            return;
          }
          stage.current.done = true;
          finishStage(stage, key, Date.now(), Math.random);
          stepRef.current();
        },
        () => {
          // 动画被新状态取消时忽略 reject.
        },
      );
    },
    [cancelAnimation, isStill],
  );

  const scheduleNext = useCallback(
    (now: number, waitSettle: boolean) => {
      clearTimer();
      const stage = stageRef.current;
      if (!stage) return;
      const at = nextDecisionAt(stage, now, waitSettle, playMs);
      if (!Number.isFinite(at)) return;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        stepRef.current();
      }, Math.max(0, at - now));
    },
    [clearTimer, playMs],
  );

  const step = useCallback(() => {
    const stage = stageRef.current;
    const strip = stripRef.current;
    if (!stage || !strip || stage.level === null) return;
    const now = Date.now();
    if (
      stage.current !== null &&
      stage.current.mode === "once" &&
      stage.current.done !== true &&
      now - stage.current.start >= playMs(stage.current.key)
    ) {
      stage.current.done = true;
      finishStage(stage, stage.current.key, now, Math.random);
    }

    const next: MascotPick = decideStage(stage, now, stage.level, {
      extras: CRAB_IDLE_EXTRAS,
      extrasAllowed: !isStill(),
      random: Math.random,
    });
    const switching =
      stage.current === null ||
      next.key !== stage.current.key ||
      (stage.reaction !== null && stage.reaction.fresh);
    const settled = switchSettles(stage, next, now);

    if (switching && settled) {
      stage.current = {
        key: next.key,
        mode: next.mode,
        priority: next.priority,
        start: now,
      };
      if (stage.reaction !== null && stage.reaction.key === next.key) {
        stage.reaction.fresh = false;
      }
      applySheetToDom(next.key);
      setActiveKey((prev) => (prev === next.key ? prev : next.key));
      playStrip(next.key, next.mode);
    } else if (!switching && stage.current !== null) {
      const sheet = CRAB_SHEETS[stage.current.key];
      if (isStill() && animationRef.current !== null) {
        cancelAnimation();
        strip.style.transform = getFrameOffsetTransform(
          sheet,
          sheet.still,
          CRAB_GUTTER,
          CRAB_PIXEL_SCALE,
        );
      } else if (!isStill() && animationRef.current === null) {
        playStrip(stage.current.key, stage.current.mode);
      }
    }

    scheduleNext(now, switching && !settled);
  }, [applySheetToDom, cancelAnimation, isStill, playMs, playStrip, scheduleNext]);

  stepRef.current = step;

  // 同步外部运行状态与瞬时事件 (错误反馈 / 完成庆祝).
  useEffect(() => {
    const stage = stageRef.current;
    const now = Date.now();
    if (stage.quietSince === 0) {
      stage.quietSince = now;
    }

    const hasNewError =
      Boolean(errorMessage) && errorMessage !== prevErrorRef.current;
    prevErrorRef.current = errorMessage ?? null;

    const finishedStreaming =
      prevStreamingRef.current && !isStreaming && !hasNewError;
    prevStreamingRef.current = isStreaming;

    const finishedCompacting =
      prevCompactingRef.current && !isCompacting && !hasNewError;
    prevCompactingRef.current = isCompacting;

    const hasNewCompletion =
      completionKey !== null &&
      completionKey !== undefined &&
      completionKey !== prevCompletionRef.current;
    prevCompletionRef.current = completionKey ?? null;

    if (hasNewError) {
      takeMoment(stage, "error", now);
    } else if (finishedStreaming || finishedCompacting || hasNewCompletion) {
      takeMoment(stage, "attention", now);
    }

    stage.level = resolveMascotLevel({
      isStreaming,
      isCompacting,
      branchSummaryPending,
      hasNotification,
      turnPhase,
      isEditingFile,
    });
    step();
  }, [
    branchSummaryPending,
    completionKey,
    errorMessage,
    hasNotification,
    isCompacting,
    isEditingFile,
    isStreaming,
    step,
    turnPhase,
  ]);

  // 响应输入框输入活跃信号 (重置睡眠计时器并在睡眠时唤醒).
  useEffect(() => {
    if (activityToken === null || activityToken === undefined) return;
    const stage = stageRef.current;
    if (!stage) return;
    stage.quietSince = Date.now();
    if (stage.asleep) {
      stage.asleep = false;
      stage.waking = !isStill();
      step();
    }
  }, [activityToken, isStill, step]);

  // 监听 prefers-reduced-motion, 页面可见性与全局轻量活跃唤醒.
  useEffect(() => {
    const mediaQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    reducedMotionRef.current = mediaQuery?.matches === true;
    pageHiddenRef.current = document.hidden === true;

    const handleMotionChange = () => {
      reducedMotionRef.current = mediaQuery?.matches === true;
      stepRef.current();
    };

    const handleVisibilityChange = () => {
      pageHiddenRef.current = document.hidden === true;
      stepRef.current();
    };

    let lastActivityAt = 0;
    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastActivityAt < ACTIVITY_THROTTLE_MS) return;
      lastActivityAt = now;
      const stage = stageRef.current;
      if (!stage) return;
      stage.quietSince = now;
      if (!stage.asleep) return;
      stage.asleep = false;
      stage.waking = !reducedMotionRef.current && !pageHiddenRef.current;
      stepRef.current();
    };

    mediaQuery?.addEventListener?.("change", handleMotionChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pointermove", handleUserActivity, { passive: true });
    window.addEventListener("keydown", handleUserActivity, { passive: true });

    stepRef.current();

    return () => {
      mediaQuery?.removeEventListener?.("change", handleMotionChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pointermove", handleUserActivity);
      window.removeEventListener("keydown", handleUserActivity);
      clearTimer();
      cancelAnimation();
    };
  }, [cancelAnimation, clearTimer]);

  const activeSheet = CRAB_SHEETS[activeKey];
  const stripDims = getSheetStripDimensions(activeSheet, CRAB_GUTTER);
  const sheetUrls = resolveUrls(activeKey);
  const initialTransform = getFrameOffsetTransform(
    activeSheet,
    activeSheet.still,
    CRAB_GUTTER,
    CRAB_PIXEL_SCALE,
  );

  return (
    <span
      ref={rootRef}
      className={`composer-mascot dsh-claude-crab${className ? ` ${className}` : ""}`}
      aria-hidden="true"
      data-mascot="crab"
      data-animation={activeKey}
      data-ready="true"
      style={
        {
          "--dsh-claude-mascot-x": String(activeSheet.box[0]),
          "--dsh-claude-mascot-y": String(activeSheet.box[1]),
          "--dsh-claude-mascot-w": String(activeSheet.box[2]),
          "--dsh-claude-mascot-h": String(activeSheet.box[3]),
          "--dsh-claude-mascot-cell-w": String(stripDims.cellWidth),
          "--dsh-claude-mascot-columns": String(stripDims.columns),
          "--dsh-claude-mascot-strip-h": String(stripDims.stripHeight),
          "--dsh-claude-mascot-sheet": `url("${sheetUrls.body}")`,
          "--dsh-claude-crab-ink": `url("${sheetUrls.ink}")`,
        } as React.CSSProperties
      }
    >
      <span className="composer-mascot-sprite dsh-claude-crab-sprite">
        <span
          ref={stripRef}
          className="composer-mascot-strip dsh-claude-crab-strip"
          style={{ transform: initialTransform }}
        />
      </span>
    </span>
  );
}
