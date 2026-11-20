/**
 * 新会话页水波纹字符阵列的纯物理与渲染辅助模块.
 * 不依赖 DOM, 便于单元测试与确定性行为验证.
 */

export type RgbColor = readonly [number, number, number];

export type RippleOriginMode = "distributed" | "center" | "custom";

export interface NewSessionRippleConfig {
  /** 用于平铺背景的字符集 (默认数字 + 大小写字母). */
  charset: string;
  /** 字符字号 (px). */
  fontSize: number;
  /** 字符网格间距 (px). */
  cellSpacing: number;
  /** 波前向外扩散速度 (px/s). */
  speed: number;
  /** 波纹空间波长 (px). */
  wavelength: number;
  /** 波包拖尾宽度 (px), 控制同心波环衰减带厚度. */
  ringWidth: number;
  /** 波纹基准振幅倍率. */
  amplitude: number;
  /** 波峰/波谷引起的径向视觉位移上限 (px). */
  displacementPx: number;
  /** 波峰处的字号微放大比例. */
  scaleBoost: number;
  /** 波峰触发字符索引偏移的步数 (0 表示禁用字符跳变). */
  glyphShiftSteps: number;
  /** 空间距离衰减系数 (1/px). */
  distanceDecay: number;
  /** 时间衰减系数 (1/s). */
  timeDecay: number;
  /** 单条波纹的最大扩散半径 (px). */
  maxRadius: number;
  /** 同时存在的波纹数量上限. */
  maxRipples: number;
  /** 是否周期性自动产生波纹. */
  autoRipple: boolean;
  /** 自动产生波纹的基准间隔 (ms). */
  autoIntervalMs: number;
  /** 自动产生波纹的随机抖动范围 (+/- ms). */
  autoJitterMs: number;
  /** 自动波纹的波源分布模式. */
  originMode: RippleOriginMode;
  /** 当 originMode 为 "custom" 时的归一化波源坐标 (0..1). */
  originRatio: { x: number; y: number };
  /** 是否允许指针点击/移动触发轻量交互波纹. */
  pointerRipple: boolean;
  /** 指针移动触发波纹的节流时间 (ms). */
  pointerThrottleMs: number;
  /** 指针移动触发下一次波纹的最小移动距离 (px). */
  pointerMinDistancePx: number;
  /** 浅色模式下静止字符的基础透明度. */
  baseOpacityLight: number;
  /** 浅色模式下波峰字符的峰值透明度. */
  peakOpacityLight: number;
  /** 深色模式下静止字符的基础透明度. */
  baseOpacityDark: number;
  /** 深色模式下波峰字符的峰值透明度. */
  peakOpacityDark: number;
  /** 波峰向主题强调色染色的强度 (0..1). */
  accentTintStrength: number;
  /** 显式覆盖的基础色与强调色 (null 时跟随当前主题 CSS token). */
  colorOverride: { baseRgb: RgbColor; accentRgb: RgbColor } | null;
  /** 画布渲染的最大设备像素比 (DPR). */
  maxDpr: number;
}

export interface RippleSource {
  x: number;
  y: number;
  startTime: number;
  speed: number;
  wavelength: number;
  ringWidth: number;
  amplitude: number;
  distanceDecay: number;
  timeDecay: number;
  maxRadius: number;
}

export interface CellRippleSample {
  height: number;
  dx: number;
  dy: number;
  energy: number;
}

export const FALLBACK_LIGHT_BASE_RGB: RgbColor = [110, 110, 115];
export const FALLBACK_DARK_BASE_RGB: RgbColor = [138, 138, 142];

export const RIPPLE_LUT_SIZE = 32;
export const RIPPLE_LUT_CALM_INDEX = 8;

export const DEFAULT_RIPPLE_CONFIG: Readonly<NewSessionRippleConfig> = Object.freeze({
  charset: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  fontSize: 13,
  cellSpacing: 26,
  speed: 185,
  wavelength: 92,
  ringWidth: 115,
  amplitude: 1.0,
  displacementPx: 4.5,
  scaleBoost: 0.18,
  glyphShiftSteps: 6,
  distanceDecay: 0.0022,
  timeDecay: 0.48,
  maxRadius: 680,
  maxRipples: 6,
  autoRipple: true,
  autoIntervalMs: 2600,
  autoJitterMs: 450,
  originMode: "distributed",
  originRatio: { x: 0.5, y: 0.5 },
  pointerRipple: true,
  pointerThrottleMs: 150,
  pointerMinDistancePx: 42,
  baseOpacityLight: 0.085,
  peakOpacityLight: 0.30,
  baseOpacityDark: 0.105,
  peakOpacityDark: 0.34,
  accentTintStrength: 0.72,
  colorOverride: null,
  maxDpr: 2,
});

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function clampChannel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizeRgbTuple(rgb: RgbColor): RgbColor {
  return [clampChannel(rgb[0]), clampChannel(rgb[1]), clampChannel(rgb[2])];
}

/**
 * 合并并校验水波纹配置项, 确保异常数值不会破坏网格或动画循环.
 */
export function resolveRippleConfig(
  overrides?: Partial<NewSessionRippleConfig>,
): NewSessionRippleConfig {
  const base = DEFAULT_RIPPLE_CONFIG;
  if (!overrides) {
    return {
      ...base,
      originRatio: { ...base.originRatio },
      colorOverride: null,
    };
  }

  const charset =
    typeof overrides.charset === "string" && overrides.charset.trim().length > 0
      ? overrides.charset
      : base.charset;

  const originMode: RippleOriginMode =
    overrides.originMode === "distributed" ||
    overrides.originMode === "center" ||
    overrides.originMode === "custom"
      ? overrides.originMode
      : base.originMode;

  const originRatio = {
    x: clampNumber(overrides.originRatio?.x, base.originRatio.x, 0, 1),
    y: clampNumber(overrides.originRatio?.y, base.originRatio.y, 0, 1),
  };

  const colorOverride =
    overrides.colorOverride &&
    Array.isArray(overrides.colorOverride.baseRgb) &&
    Array.isArray(overrides.colorOverride.accentRgb)
      ? {
          baseRgb: normalizeRgbTuple(overrides.colorOverride.baseRgb),
          accentRgb: normalizeRgbTuple(overrides.colorOverride.accentRgb),
        }
      : null;

  return {
    charset,
    fontSize: clampNumber(overrides.fontSize, base.fontSize, 8, 48),
    cellSpacing: clampNumber(overrides.cellSpacing, base.cellSpacing, 12, 96),
    speed: clampNumber(overrides.speed, base.speed, 20, 1200),
    wavelength: clampNumber(overrides.wavelength, base.wavelength, 16, 480),
    ringWidth: clampNumber(overrides.ringWidth, base.ringWidth, 16, 480),
    amplitude: clampNumber(overrides.amplitude, base.amplitude, 0, 3),
    displacementPx: clampNumber(overrides.displacementPx, base.displacementPx, 0, 32),
    scaleBoost: clampNumber(overrides.scaleBoost, base.scaleBoost, 0, 1),
    glyphShiftSteps: Math.round(clampNumber(overrides.glyphShiftSteps, base.glyphShiftSteps, 0, 32)),
    distanceDecay: clampNumber(overrides.distanceDecay, base.distanceDecay, 0, 0.05),
    timeDecay: clampNumber(overrides.timeDecay, base.timeDecay, 0.02, 5),
    maxRadius: clampNumber(overrides.maxRadius, base.maxRadius, 80, 3000),
    maxRipples: Math.round(clampNumber(overrides.maxRipples, base.maxRipples, 1, 16)),
    autoRipple: typeof overrides.autoRipple === "boolean" ? overrides.autoRipple : base.autoRipple,
    autoIntervalMs: clampNumber(overrides.autoIntervalMs, base.autoIntervalMs, 300, 30000),
    autoJitterMs: clampNumber(overrides.autoJitterMs, base.autoJitterMs, 0, 10000),
    originMode,
    originRatio,
    pointerRipple:
      typeof overrides.pointerRipple === "boolean" ? overrides.pointerRipple : base.pointerRipple,
    pointerThrottleMs: clampNumber(overrides.pointerThrottleMs, base.pointerThrottleMs, 16, 2000),
    pointerMinDistancePx: clampNumber(
      overrides.pointerMinDistancePx,
      base.pointerMinDistancePx,
      0,
      400,
    ),
    baseOpacityLight: clampNumber(overrides.baseOpacityLight, base.baseOpacityLight, 0, 1),
    peakOpacityLight: clampNumber(overrides.peakOpacityLight, base.peakOpacityLight, 0, 1),
    baseOpacityDark: clampNumber(overrides.baseOpacityDark, base.baseOpacityDark, 0, 1),
    peakOpacityDark: clampNumber(overrides.peakOpacityDark, base.peakOpacityDark, 0, 1),
    accentTintStrength: clampNumber(overrides.accentTintStrength, base.accentTintStrength, 0, 1),
    colorOverride,
    maxDpr: clampNumber(overrides.maxDpr, base.maxDpr, 1, 3),
  };
}

/**
 * 为网格单元计算确定性的基础字符索引, 保证窗口缩放时已有位置字符稳定不闪烁.
 */
export function cellBaseCharIndex(col: number, row: number, charsetLength: number): number {
  if (charsetLength <= 1) return 0;
  let hash = (Math.imul(col | 0, 374761393) + Math.imul(row | 0, 668265263)) | 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 1274126177);
  hash ^= hash >>> 16;
  return (hash >>> 0) % charsetLength;
}

/**
 * 根据分布模式选取下一次波纹的起始坐标.
 * distributed 模式使用低差异序列加轻微扰动, 使相邻波纹自然分散并交叠.
 */
export function pickRippleOrigin(
  width: number,
  height: number,
  mode: RippleOriginMode,
  originRatio: { x: number; y: number },
  seedIndex: number,
  random: () => number = Math.random,
): { x: number; y: number } {
  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);

  if (mode === "center") {
    return { x: safeW * 0.5, y: safeH * 0.5 };
  }

  if (mode === "custom") {
    const rx = clampNumber(originRatio.x, 0.5, 0, 1);
    const ry = clampNumber(originRatio.y, 0.5, 0, 1);
    return { x: safeW * rx, y: safeH * ry };
  }

  const idx = Math.abs(Math.floor(seedIndex)) + 1;
  const u = (idx * 0.61803398875 + 0.13) % 1;
  const v = (idx * 0.38196601125 + 0.29) % 1;
  const jitterX = (random() - 0.5) * 0.12;
  const jitterY = (random() - 0.5) * 0.12;
  const normX = Math.max(0.14, Math.min(0.86, 0.14 + u * 0.72 + jitterX));
  const normY = Math.max(0.14, Math.min(0.86, 0.14 + v * 0.72 + jitterY));

  return {
    x: safeW * normX,
    y: safeH * normY,
  };
}

/**
 * 创建一个新的波纹源实例.
 */
export function createRippleSource(
  x: number,
  y: number,
  startTime: number,
  config: NewSessionRippleConfig,
  amplitudeScale = 1,
): RippleSource {
  return {
    x,
    y,
    startTime,
    speed: config.speed,
    wavelength: config.wavelength,
    ringWidth: config.ringWidth,
    amplitude: config.amplitude * amplitudeScale,
    distanceDecay: config.distanceDecay,
    timeDecay: config.timeDecay,
    maxRadius: config.maxRadius,
  };
}

/**
 * 判断一条波纹是否已经扩散出有效范围或能量衰减殆尽.
 */
export function isRippleExpired(
  ripple: RippleSource,
  now: number,
  effectiveMaxRadius: number,
): boolean {
  const age = (now - ripple.startTime) / 1000;
  if (age < 0) return false;
  const front = age * ripple.speed;
  const trailingEdge = front - ripple.ringWidth * 3.2;
  const radiusCap = Math.min(ripple.maxRadius, effectiveMaxRadius);
  if (trailingEdge > radiusCap) return true;
  const temporalStrength = Math.exp(-age * ripple.timeDecay) * Math.abs(ripple.amplitude);
  return temporalStrength < 0.012;
}

/**
 * 过滤并移除已经平息的波纹.
 */
export function pruneExpiredRipples(
  ripples: readonly RippleSource[],
  now: number,
  effectiveMaxRadius: number,
): RippleSource[] {
  return ripples.filter((ripple) => !isRippleExpired(ripple, now, effectiveMaxRadius));
}

/**
 * 向波纹队列追加新波纹, 超出上限时淘汰最早产生的波纹.
 */
export function pushRipple(
  ripples: RippleSource[],
  next: RippleSource,
  maxRipples: number,
): void {
  if (maxRipples <= 0) return;
  while (ripples.length >= maxRipples) {
    ripples.shift();
  }
  ripples.push(next);
}

/**
 * 在给定坐标 (x, y) 和时刻 now 采样所有活跃波纹叠加后的水波高度与径向位移.
 * 可传入复用的 out 对象以避免热循环中的临时对象分配.
 */
export function sampleCellRipple(
  x: number,
  y: number,
  ripples: readonly RippleSource[],
  now: number,
  config: NewSessionRippleConfig,
  out?: CellRippleSample,
): CellRippleSample {
  const sample: CellRippleSample = out ?? { height: 0, dx: 0, dy: 0, energy: 0 };
  let totalHeight = 0;
  let totalDx = 0;
  let totalDy = 0;

  for (let i = 0; i < ripples.length; i++) {
    const r = ripples[i];
    const age = (now - r.startTime) / 1000;
    if (age < 0) continue;

    const front = age * r.speed;
    const leadWidth = r.ringWidth * 0.42;
    const trailWidth = r.ringWidth;
    const outerBound = Math.min(r.maxRadius, front + leadWidth * 3.0);
    const innerBound = Math.max(0, front - trailWidth * 3.2);

    const rx = x - r.x;
    const ry = y - r.y;
    const distSq = rx * rx + ry * ry;
    if (distSq > outerBound * outerBound || distSq < innerBound * innerBound) {
      continue;
    }

    const dist = Math.sqrt(distSq);
    const delta = dist - front;
    const sigma = delta > 0 ? leadWidth : trailWidth;
    const envelope = Math.exp(-(delta * delta) / (2 * sigma * sigma));

    // 前 0.14s 采用平滑进入曲线, 避免波源刚出现时产生突兀闪变.
    const entryRatio = Math.min(1, age / 0.14);
    const entry = entryRatio * entryRatio * (3 - 2 * entryRatio);
    const decay = Math.exp(-dist * r.distanceDecay - age * r.timeDecay);

    const fadeStart = r.maxRadius * 0.78;
    let radiusFade = 1;
    if (dist > fadeStart) {
      const span = Math.max(1, r.maxRadius - fadeStart);
      const u = Math.min(1, (dist - fadeStart) / span);
      radiusFade = 1 - u * u * (3 - 2 * u);
    }

    const phase = ((2 * Math.PI) / r.wavelength) * (front - dist);
    const h = r.amplitude * entry * decay * radiusFade * envelope * Math.sin(phase);
    totalHeight += h;

    if (dist > 0.001 && config.displacementPx > 0) {
      const radialFactor = (h * config.displacementPx) / dist;
      totalDx += rx * radialFactor;
      totalDy += ry * radialFactor;
    }
  }

  if (totalHeight > 1.25) totalHeight = 1.25;
  else if (totalHeight < -1.25) totalHeight = -1.25;

  sample.height = totalHeight;
  sample.dx = totalDx;
  sample.dy = totalDy;
  sample.energy = Math.abs(totalHeight);
  return sample;
}

/**
 * 解析 CSS 颜色字符串 (支持 rgb/rgba/hex/color(srgb ...)) 为 RGB 元组.
 */
export function parseCssRgb(
  value: string | null | undefined,
  fallback: RgbColor,
): RgbColor {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;

  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        return [r, g, b];
      }
      return fallback;
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        return [r, g, b];
      }
      return fallback;
    }
    return fallback;
  }

  const srgbMatch = /^color\(\s*srgb\s+([0-9.+-eE]+)\s+([0-9.+-eE]+)\s+([0-9.+-eE]+)(?:\s*\/\s*[0-9.+-eE%]+)?\s*\)$/i.exec(
    trimmed,
  );
  if (srgbMatch) {
    return [
      clampChannel(Number(srgbMatch[1]) * 255),
      clampChannel(Number(srgbMatch[2]) * 255),
      clampChannel(Number(srgbMatch[3]) * 255),
    ];
  }

  const rgbMatch = /^rgba?\(\s*([0-9.+-]+%?)\s*[,\s]\s*([0-9.+-]+%?)\s*[,\s]\s*([0-9.+-]+%?)(?:\s*[,/]\s*[0-9.+-]+%?)?\s*\)$/i.exec(
    trimmed,
  );
  if (rgbMatch) {
    const parsePart = (part: string): number =>
      part.endsWith("%") ? (parseFloat(part) / 100) * 255 : parseFloat(part);
    const r = parsePart(rgbMatch[1]);
    const g = parsePart(rgbMatch[2]);
    const b = parsePart(rgbMatch[3]);
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      return [clampChannel(r), clampChannel(g), clampChannel(b)];
    }
  }

  return fallback;
}

/**
 * 将波高 [-1.05, 1.05] 映射到 32 级颜色查找表索引, 其中 0 固定映射到 calm 索引 (8).
 */
export function rippleHeightToLutIndex(height: number): number {
  if (!Number.isFinite(height) || height === 0) return RIPPLE_LUT_CALM_INDEX;
  if (height < 0) {
    const clamped = Math.max(-1.05, height);
    const ratio = clamped / -1.05;
    return Math.max(0, Math.round(RIPPLE_LUT_CALM_INDEX - ratio * RIPPLE_LUT_CALM_INDEX));
  }
  const clamped = Math.min(1.05, height);
  const ratio = clamped / 1.05;
  return Math.min(
    RIPPLE_LUT_SIZE - 1,
    Math.round(RIPPLE_LUT_CALM_INDEX + ratio * (RIPPLE_LUT_SIZE - 1 - RIPPLE_LUT_CALM_INDEX)),
  );
}

/**
 * 预生成 32 级 rgba() 颜色查找表, 消除渲染热循环中的字符串拼接开销.
 * 0..7 对应波谷 (透明度下沉), 8 对应静止基准, 9..31 对应波峰 (亮度与强调色提升).
 */
export function buildRippleColorLut(
  baseRgb: RgbColor,
  accentRgb: RgbColor,
  baseOpacity: number,
  peakOpacity: number,
  accentTintStrength: number,
): string[] {
  const base = normalizeRgbTuple(baseRgb);
  const accent = normalizeRgbTuple(accentRgb);
  const safeBaseOpacity = clampNumber(baseOpacity, 0.085, 0, 1);
  const safePeakOpacity = clampNumber(peakOpacity, 0.3, safeBaseOpacity, 1);
  const safeTint = clampNumber(accentTintStrength, 0.72, 0, 1);

  const lut: string[] = new Array(RIPPLE_LUT_SIZE);
  const crestSpan = RIPPLE_LUT_SIZE - 1 - RIPPLE_LUT_CALM_INDEX;

  for (let i = 0; i < RIPPLE_LUT_SIZE; i++) {
    if (i < RIPPLE_LUT_CALM_INDEX) {
      const depth = (RIPPLE_LUT_CALM_INDEX - i) / RIPPLE_LUT_CALM_INDEX;
      const alpha = safeBaseOpacity * (1 - 0.42 * depth);
      lut[i] = `rgba(${base[0]}, ${base[1]}, ${base[2]}, ${alpha.toFixed(4)})`;
    } else if (i === RIPPLE_LUT_CALM_INDEX) {
      lut[i] = `rgba(${base[0]}, ${base[1]}, ${base[2]}, ${safeBaseOpacity.toFixed(4)})`;
    } else {
      const ratio = (i - RIPPLE_LUT_CALM_INDEX) / crestSpan;
      const alpha = safeBaseOpacity + (safePeakOpacity - safeBaseOpacity) * ratio;
      const blend = Math.pow(ratio, 0.85) * safeTint;
      const r = Math.round(base[0] + (accent[0] - base[0]) * blend);
      const g = Math.round(base[1] + (accent[1] - base[1]) * blend);
      const b = Math.round(base[2] + (accent[2] - base[2]) * blend);
      lut[i] = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(4)})`;
    }
  }

  return lut;
}
