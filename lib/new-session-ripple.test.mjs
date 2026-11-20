import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRippleColorLut,
  cellBaseCharIndex,
  createRippleSource,
  DEFAULT_RIPPLE_CONFIG,
  FALLBACK_DARK_BASE_RGB,
  FALLBACK_LIGHT_BASE_RGB,
  isRippleExpired,
  parseCssRgb,
  pickRippleOrigin,
  pruneExpiredRipples,
  pushRipple,
  resolveRippleConfig,
  RIPPLE_LUT_CALM_INDEX,
  RIPPLE_LUT_SIZE,
  rippleHeightToLutIndex,
  sampleCellRipple,
} from "./new-session-ripple.ts";

test("默认字符集仅包含数字与大小写英文字母", () => {
  assert.match(DEFAULT_RIPPLE_CONFIG.charset, /^[0-9A-Za-z]+$/);
  assert.equal(DEFAULT_RIPPLE_CONFIG.charset.length, 62);
});

test("cellBaseCharIndex 对同一网格坐标返回稳定确定性的索引", () => {
  const len = DEFAULT_RIPPLE_CONFIG.charset.length;
  const first = cellBaseCharIndex(12, 7, len);
  const second = cellBaseCharIndex(12, 7, len);
  assert.equal(first, second);
  assert.ok(first >= 0 && first < len);

  const unique = new Set();
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      const idx = cellBaseCharIndex(c, r, len);
      assert.ok(idx >= 0 && idx < len);
      unique.add(idx);
    }
  }
  assert.ok(unique.size > 20, "相邻网格字符应充分分散");
});

test("水波纹随时间向外扩散, 波峰半径随 age * speed 单调递增", () => {
  const config = resolveRippleConfig();
  const originX = 400;
  const originY = 300;
  const startTime = 1000;
  const ripple = createRippleSource(originX, originY, startTime, config);

  const findPeakRadius = (now) => {
    let bestRadius = 0;
    let bestEnergy = -1;
    for (let r = 10; r <= 600; r += 5) {
      const sample = sampleCellRipple(originX + r, originY, [ripple], now, config);
      if (sample.energy > bestEnergy) {
        bestEnergy = sample.energy;
        bestRadius = r;
      }
    }
    return { bestRadius, bestEnergy };
  };

  const t1 = findPeakRadius(startTime + 400);
  const t2 = findPeakRadius(startTime + 1100);
  const t3 = findPeakRadius(startTime + 1800);

  assert.ok(t1.bestEnergy > 0.1, "初始阶段应存在明显波动");
  assert.ok(
    t1.bestRadius < t2.bestRadius && t2.bestRadius < t3.bestRadius,
    `峰值半径应向外扩散: ${t1.bestRadius} -> ${t2.bestRadius} -> ${t3.bestRadius}`,
  );
});

test("水波纹随距离和时间衰减, 超出范围后正确判定过期并清理", () => {
  const config = resolveRippleConfig();
  const ripple = createRippleSource(200, 200, 0, config);

  const crestOffset = config.wavelength * 0.25;
  const nearAtEarly = sampleCellRipple(
    200 + config.speed * 0.6 - crestOffset,
    200,
    [ripple],
    600,
    config,
  );
  const farAtLate = sampleCellRipple(
    200 + config.speed * 2.5 - crestOffset,
    200,
    [ripple],
    2500,
    config,
  );
  assert.ok(
    nearAtEarly.energy > farAtLate.energy && farAtLate.energy > 0,
    `远距离晚期能量应衰减且仍保留可见波纹 (${nearAtEarly.energy} > ${farAtLate.energy})`,
  );

  // 包络快速裁剪: 远超波前或远落后于波尾的区域能量严格为 0.
  const aheadOfFront = sampleCellRipple(200 + 500, 200, [ripple], 400, config);
  assert.equal(aheadOfFront.energy, 0);
  assert.equal(aheadOfFront.dx, 0);
  assert.equal(aheadOfFront.dy, 0);

  const behindTrail = sampleCellRipple(200, 200, [ripple], 4500, config);
  assert.equal(behindTrail.energy, 0);

  assert.equal(isRippleExpired(ripple, 500, 680), false);
  assert.equal(isRippleExpired(ripple, 12000, 680), true);

  const kept = pruneExpiredRipples(
    [ripple, createRippleSource(100, 100, 11800, config)],
    12000,
    680,
  );
  assert.equal(kept.length, 1);
  assert.equal(kept[0].startTime, 11800);
});

test("多波纹叠加可正确累计高度与径向位移, 且队列遵循容量上限", () => {
  const config = resolveRippleConfig({ maxRipples: 3 });
  const r1 = createRippleSource(100, 200, 0, config);
  const r2 = createRippleSource(100, 200, 0, config);
  const now = 600;
  const x = 100 + 185 * 0.6;
  const y = 200;

  const single = sampleCellRipple(x, y, [r1], now, config);
  const doubled = sampleCellRipple(x, y, [r1, r2], now, config);
  assert.ok(Math.abs(doubled.dx - single.dx * 2) < 1e-6);
  assert.ok(Math.abs(doubled.dy) < 1e-6);
  assert.ok(Math.abs(doubled.height) >= Math.abs(single.height));

  const queue = [];
  for (let i = 0; i < 5; i++) {
    pushRipple(queue, createRippleSource(i * 10, 0, i * 100, config), config.maxRipples);
  }
  assert.equal(queue.length, 3);
  assert.equal(queue[0].x, 20);
  assert.equal(queue[2].x, 40);
});

test("parseCssRgb 支持 rgb/rgba/color(srgb)/hex 格式并安全回退", () => {
  assert.deepEqual(parseCssRgb("rgb(110, 110, 115)", FALLBACK_LIGHT_BASE_RGB), [110, 110, 115]);
  assert.deepEqual(parseCssRgb("rgba(59, 108, 246, 0.8)", FALLBACK_LIGHT_BASE_RGB), [59, 108, 246]);
  assert.deepEqual(parseCssRgb("rgb(217 119 87 / 50%)", FALLBACK_LIGHT_BASE_RGB), [217, 119, 87]);
  assert.deepEqual(parseCssRgb("color(srgb 1 0.5 0)", FALLBACK_LIGHT_BASE_RGB), [255, 128, 0]);
  assert.deepEqual(parseCssRgb("#3b6cf6", FALLBACK_LIGHT_BASE_RGB), [59, 108, 246]);
  assert.deepEqual(parseCssRgb("#abc", FALLBACK_LIGHT_BASE_RGB), [170, 187, 204]);
  assert.deepEqual(parseCssRgb("invalid", FALLBACK_DARK_BASE_RGB), FALLBACK_DARK_BASE_RGB);
});

test("颜色查找表与波高索引映射在波谷/静止/波峰间平滑递增", () => {
  assert.equal(rippleHeightToLutIndex(0), RIPPLE_LUT_CALM_INDEX);
  assert.equal(rippleHeightToLutIndex(-1.05), 0);
  assert.equal(rippleHeightToLutIndex(1.05), RIPPLE_LUT_SIZE - 1);

  const lut = buildRippleColorLut([100, 100, 100], [59, 108, 246], 0.085, 0.30, 0.72);
  assert.equal(lut.length, RIPPLE_LUT_SIZE);

  const parseAlpha = (rgba) => Number(/rgba\(\d+, \d+, \d+, ([0-9.]+)\)/.exec(rgba)?.[1]);
  const troughAlpha = parseAlpha(lut[0]);
  const calmAlpha = parseAlpha(lut[RIPPLE_LUT_CALM_INDEX]);
  const crestAlpha = parseAlpha(lut[RIPPLE_LUT_SIZE - 1]);

  assert.ok(troughAlpha < calmAlpha, `波谷透明度应低于静止态 (${troughAlpha} < ${calmAlpha})`);
  assert.ok(calmAlpha < crestAlpha, `波峰透明度应高于静止态 (${calmAlpha} < ${crestAlpha})`);
  assert.match(lut[RIPPLE_LUT_SIZE - 1], /^rgba\(/);
});

test("resolveRippleConfig 对非法与越界配置做安全夹紧", () => {
  const resolved = resolveRippleConfig({
    charset: "   ",
    fontSize: -10,
    cellSpacing: 2,
    speed: Number.NaN,
    maxRipples: 99,
    baseOpacityLight: 5,
    originMode: "custom",
    originRatio: { x: -1, y: 2 },
  });

  assert.equal(resolved.charset, DEFAULT_RIPPLE_CONFIG.charset);
  assert.equal(resolved.fontSize, 8);
  assert.equal(resolved.cellSpacing, 12);
  assert.equal(resolved.speed, DEFAULT_RIPPLE_CONFIG.speed);
  assert.equal(resolved.maxRipples, 16);
  assert.equal(resolved.baseOpacityLight, 1);
  assert.deepEqual(resolved.originRatio, { x: 0, y: 1 });
});

test("pickRippleOrigin 正确覆盖 center, custom 与 distributed 模式", () => {
  assert.deepEqual(pickRippleOrigin(1000, 800, "center", { x: 0.2, y: 0.3 }, 0), {
    x: 500,
    y: 400,
  });
  assert.deepEqual(pickRippleOrigin(1000, 800, "custom", { x: 0.25, y: 0.75 }, 0), {
    x: 250,
    y: 600,
  });

  const p1 = pickRippleOrigin(1000, 800, "distributed", { x: 0.5, y: 0.5 }, 0, () => 0.5);
  const p2 = pickRippleOrigin(1000, 800, "distributed", { x: 0.5, y: 0.5 }, 1, () => 0.5);
  assert.ok(p1.x >= 140 && p1.x <= 860);
  assert.ok(p1.y >= 112 && p1.y <= 688);
  assert.notDeepEqual(p1, p2);
});
