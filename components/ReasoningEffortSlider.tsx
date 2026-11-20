"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

export interface ReasoningEffortStarOption {
  isDefault: boolean;
  saveLabel: string;
  defaultLabel: string;
  onSave: () => void;
}

export interface ReasoningEffortLevelOption {
  level: string;
  displayLabel: string;
  showOriginal?: boolean;
  description: string;
  active: boolean;
  star?: ReasoningEffortStarOption;
}

export interface ReasoningEffortSliderProps {
  heading: string;
  levels: ReasoningEffortLevelOption[];
  onSelectLevel: (level: string) => void;
  star?: ReasoningEffortStarOption;
}

export interface EffortStarSpec {
  index: number;
  tx: string;
  ty: string;
  size: string;
  opacity: string;
  duration: string;
  delay: string;
  twinkleDuration: string;
}

export const STAR_COUNT = 22;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function pctOfIndex(index: number, count: number): number {
  if (count <= 1) return 1;
  const clamped = Math.max(0, Math.min(count - 1, index));
  return clamped / (count - 1);
}

export function indexFromPct(pct: number, count: number): number {
  if (count <= 1) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(clamp01(pct) * (count - 1))));
}

/**
 * 仅在最高档位点亮奶油色 / 陶土橙能量层、暖色星尘与扫光效果.
 */
export function isMaxEffortTier(index: number, count: number): boolean {
  if (count <= 0) return false;
  if (count === 1) return true;
  return index === count - 1;
}

export function energyForIndex(index: number, count: number): number {
  return isMaxEffortTier(index, count) ? 1 : 0;
}

/**
 * 生成确定性的暖色星尘粒子参数 (黄金分割相位 + 哈希高度槽).
 */
export function buildEffortStars(count: number = STAR_COUNT): EffortStarSpec[] {
  const stars: EffortStarSpec[] = [];
  for (let i = 0; i < count; i++) {
    const phase = (i * 0.618033988749895) % 1;
    const hSlot = ((i * 7 + 3) % 13) / 12;
    const sizeSlot = (i * 5 + 1) % 3;
    const size = sizeSlot === 0 ? 1.5 : sizeSlot === 1 ? 2 : 2.5;
    const ty = 4 + hSlot * 20;
    const tx = -(140 + ((i * 29) % 120));
    const dur = 2.0 + ((i * 3) % 7) * 0.25;
    const delay = -phase * dur;
    const twinkleDur = 0.9 + ((i * 4) % 6) * 0.2;
    const op = (0.55 + ((i * 3) % 5) * 0.1).toFixed(2);
    stars.push({
      index: i,
      tx: `${tx}px`,
      ty: `${ty.toFixed(1)}px`,
      size: `${size}px`,
      opacity: op,
      duration: `${dur.toFixed(2)}s`,
      delay: `${delay.toFixed(2)}s`,
      twinkleDuration: `${twinkleDur.toFixed(2)}s`,
    });
  }
  return stars;
}

export function pctFromTrackClientX(
  clientX: number,
  rect: { left: number; width: number },
): number {
  const width = rect.width > 0 ? rect.width : 200;
  const pad = Math.min(14, width * 0.15);
  const usable = Math.max(1, width - pad * 2);
  return clamp01((clientX - rect.left - pad) / usable);
}

const DEFAULT_STARS = buildEffortStars(STAR_COUNT);

function StarGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2.5 14.9 8.4 21.4 9.3 16.7 13.9 17.8 20.4 12 17.3 6.2 20.4 7.3 13.9 2.6 9.3 9.1 8.4 12 2.5" />
    </svg>
  );
}

export function ReasoningEffortSlider({
  heading,
  levels,
  onSelectLevel,
}: ReasoningEffortSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragPct, setDragPct] = useState<number | null>(null);
  const draggingRef = useRef(false);
  const lastEmittedLevelRef = useRef<string | null>(null);
  const levelsRef = useRef(levels);
  const onSelectLevelRef = useRef(onSelectLevel);

  useEffect(() => {
    levelsRef.current = levels;
    onSelectLevelRef.current = onSelectLevel;
  }, [levels, onSelectLevel]);

  const levelCount = levels.length;
  const activeIndex = useMemo(() => {
    const found = levels.findIndex((item) => item.active);
    return found >= 0 ? found : 0;
  }, [levels]);

  const shownIndex = dragPct !== null ? indexFromPct(dragPct, levelCount) : activeIndex;
  const shownPct = dragPct !== null ? dragPct : pctOfIndex(activeIndex, levelCount);
  const current = levels[shownIndex] ?? levels[0];
  const isMax = isMaxEffortTier(shownIndex, levelCount);
  const energy = energyForIndex(shownIndex, levelCount);

  const applyClientX = useCallback((clientX: number, commit: boolean) => {
    const track = trackRef.current;
    const currentLevels = levelsRef.current;
    if (!track || currentLevels.length === 0) return;
    const rect = track.getBoundingClientRect();
    const pct = pctFromTrackClientX(clientX, rect);
    const idx = indexFromPct(pct, currentLevels.length);
    const target = currentLevels[idx];
    if (commit) {
      setDragPct(null);
    } else {
      setDragPct(pct);
    }
    if (target && (commit || lastEmittedLevelRef.current !== target.level)) {
      lastEmittedLevelRef.current = target.level;
      onSelectLevelRef.current(target.level);
    }
  }, []);

  useEffect(() => {
    const handleWindowMove = (event: PointerEvent | MouseEvent) => {
      if (!draggingRef.current) return;
      applyClientX(event.clientX, false);
    };
    const handleWindowUp = (event: PointerEvent | MouseEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      lastEmittedLevelRef.current = null;
      applyClientX(event.clientX, true);
    };
    window.addEventListener("pointermove", handleWindowMove);
    window.addEventListener("pointerup", handleWindowUp);
    window.addEventListener("pointercancel", handleWindowUp);
    window.addEventListener("mousemove", handleWindowMove);
    window.addEventListener("mouseup", handleWindowUp);
    return () => {
      window.removeEventListener("pointermove", handleWindowMove);
      window.removeEventListener("pointerup", handleWindowUp);
      window.removeEventListener("pointercancel", handleWindowUp);
      window.removeEventListener("mousemove", handleWindowMove);
      window.removeEventListener("mouseup", handleWindowUp);
    };
  }, [applyClientX]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.preventDefault();
    event.stopPropagation();
    draggingRef.current = true;
    lastEmittedLevelRef.current = null;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic events without an active pointer id still work via window listeners.
    }
    applyClientX(event.clientX, false);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    event.preventDefault();
    applyClientX(event.clientX, false);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    event.preventDefault();
    draggingRef.current = false;
    lastEmittedLevelRef.current = null;
    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore synthetic pointer capture release errors.
    }
    applyClientX(event.clientX, true);
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || draggingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    draggingRef.current = true;
    lastEmittedLevelRef.current = null;
    applyClientX(event.clientX, false);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (levelCount === 0) return;
    let nextIdx = shownIndex;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      nextIdx = Math.max(0, shownIndex - 1);
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      nextIdx = Math.min(levelCount - 1, shownIndex + 1);
    } else if (event.key === "Home") {
      nextIdx = 0;
    } else if (event.key === "End") {
      nextIdx = levelCount - 1;
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const target = levels[nextIdx];
    if (target) {
      onSelectLevel(target.level);
    }
  };

  if (!current) return null;

  const rowStyle = {
    "--ces-pct": shownPct.toFixed(4),
    "--ces-energy": energy.toFixed(3),
  } as CSSProperties;

  return (
    <div
      className="ces-row"
      data-energy={isMax ? "1" : "0"}
      data-max={isMax ? "true" : "false"}
      data-dragging={dragPct !== null ? "1" : "0"}
      data-level={current.level}
      style={rowStyle}
    >
      <div className="ces-head">
        <span className="ces-label">{heading}</span>
        <div className="ces-value-wrap">
          <span className="ces-value" data-max={isMax ? "1" : "0"} data-level={current.level}>
            {current.displayLabel}
            {current.showOriginal && <span className="ces-value-orig">({current.level})</span>}
          </span>
          {current.star && (
            current.star.isDefault ? (
              <span
                role="img"
                aria-label={current.star.defaultLabel}
                title={current.star.defaultLabel}
                className="app-default-star is-default ces-default-star"
              >
                <StarGlyph filled />
              </span>
            ) : (
              <button
                type="button"
                aria-label={current.star.saveLabel}
                title={current.star.saveLabel}
                className="app-default-star ces-default-star"
                onClick={(event) => {
                  event.stopPropagation();
                  trackRef.current?.focus({ preventScroll: true });
                  current.star?.onSave();
                }}
              >
                <StarGlyph filled={false} />
              </button>
            )
          )}
        </div>
      </div>

      <div
        ref={trackRef}
        className="ces-track"
        role="slider"
        tabIndex={0}
        aria-label={heading}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, levelCount - 1)}
        aria-valuenow={shownIndex}
        aria-valuetext={current.displayLabel}
        data-energy={isMax ? "1" : "0"}
        data-max={isMax ? "true" : "false"}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
      >
        <div className="ces-fill" />
        <div className="ces-energy" data-active={isMax ? "1" : "0"} aria-hidden="true">
          <div className="ces-energy__sweep" />
        </div>
        <div className="ces-stars" data-active={isMax ? "1" : "0"} aria-hidden="true">
          {DEFAULT_STARS.map((star) => {
            const starStyle = {
              "--tx": star.tx,
              "--ty": star.ty,
              "--s": star.size,
              "--o": star.opacity,
              "--d": star.duration,
              "--delay": star.delay,
              "--td": star.twinkleDuration,
            } as CSSProperties;
            return (
              <span key={star.index} className="ces-star" style={starStyle}>
                <span className="ces-star__dot" />
              </span>
            );
          })}
        </div>
        {levels.map((item, idx) => {
          const tickPct = pctOfIndex(idx, levelCount);
          const tickStyle: CSSProperties = {
            left: `calc(14px + ${tickPct.toFixed(4)} * (100% - 28px))`,
          };
          return (
            <span
              key={item.level}
              className="ces-tick"
              data-index={idx}
              data-level={item.level}
              data-passed={idx <= shownIndex ? "1" : "0"}
              data-active={idx === shownIndex ? "1" : "0"}
              style={tickStyle}
            />
          );
        })}
        <div className="ces-knob" data-max={isMax ? "1" : "0"} />
      </div>

      {current.description && (
        <div className="ces-desc">{current.description}</div>
      )}
    </div>
  );
}
