import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});

const {
  ReasoningEffortSlider,
  STAR_COUNT,
  buildEffortStars,
  clamp01,
  energyForIndex,
  indexFromPct,
  isMaxEffortTier,
  pctFromTrackClientX,
  pctOfIndex,
} = await jiti.import("./ReasoningEffortSlider.tsx");

const SAMPLE_LEVELS = [
  { level: "auto", displayLabel: "auto", description: "使用 pi 默认设置", active: false },
  { level: "off", displayLabel: "off", description: "关闭推理", active: false },
  { level: "low", displayLabel: "low", description: "低强度推理", active: false },
  { level: "medium", displayLabel: "medium", description: "中等强度推理", active: true },
  { level: "high", displayLabel: "high", description: "高强度推理", active: false },
  { level: "max", displayLabel: "max", description: "最高强度推理", active: false },
];

test("maps continuous drag percentages to discrete reasoning levels accurately", () => {
  assert.equal(clamp01(-0.5), 0);
  assert.equal(clamp01(1.5), 1);
  assert.equal(pctOfIndex(0, 6), 0);
  assert.equal(pctOfIndex(5, 6), 1);
  assert.equal(indexFromPct(0, 6), 0);
  assert.equal(indexFromPct(0.19, 6), 1);
  assert.equal(indexFromPct(0.61, 6), 3);
  assert.equal(indexFromPct(0.81, 6), 4);
  assert.equal(indexFromPct(0.95, 6), 5);

  const rect = { left: 100, width: 228 };
  assert.equal(pctFromTrackClientX(100, rect), 0);
  assert.equal(pctFromTrackClientX(214, rect), 0.5);
  assert.equal(pctFromTrackClientX(328, rect), 1);
});

test("activates energy layer, stardust and sweep ONLY at the highest tier", () => {
  for (let i = 0; i < SAMPLE_LEVELS.length - 1; i++) {
    assert.equal(isMaxEffortTier(i, SAMPLE_LEVELS.length), false);
    assert.equal(energyForIndex(i, SAMPLE_LEVELS.length), 0);
  }
  assert.equal(
    isMaxEffortTier(SAMPLE_LEVELS.length - 1, SAMPLE_LEVELS.length),
    true,
  );
  assert.equal(
    energyForIndex(SAMPLE_LEVELS.length - 1, SAMPLE_LEVELS.length),
    1,
  );

  const nonMaxMarkup = renderToStaticMarkup(
    React.createElement(ReasoningEffortSlider, {
      heading: "推理等级",
      levels: SAMPLE_LEVELS,
      onSelectLevel: () => {},
    }),
  );
  assert.match(nonMaxMarkup, /class="ces-row"[^>]*data-energy="0"/);
  assert.match(nonMaxMarkup, /class="ces-energy"[^>]*data-active="0"/);
  assert.match(nonMaxMarkup, /class="ces-stars"[^>]*data-active="0"/);

  const maxLevels = SAMPLE_LEVELS.map((item) => ({
    ...item,
    active: item.level === "max",
  }));
  const maxMarkup = renderToStaticMarkup(
    React.createElement(ReasoningEffortSlider, {
      heading: "推理等级",
      levels: maxLevels,
      onSelectLevel: () => {},
    }),
  );
  assert.match(maxMarkup, /class="ces-row"[^>]*data-energy="1"/);
  assert.match(maxMarkup, /class="ces-energy"[^>]*data-active="1"/);
  assert.match(maxMarkup, /class="ces-energy__sweep"/);
  assert.match(maxMarkup, /class="ces-stars"[^>]*data-active="1"/);
  assert.equal((maxMarkup.match(/class="ces-star"/g) ?? []).length, STAR_COUNT);
});

test("generates deterministic warm stardust particles and wires slider into model and reasoning menus", () => {
  const starsA = buildEffortStars();
  const starsB = buildEffortStars();
  assert.equal(starsA.length, STAR_COUNT);
  assert.deepEqual(starsA, starsB);

  const chatInputSource = readFileSync(
    new URL("./ChatInput.tsx", import.meta.url),
    "utf8",
  );
  assert.match(chatInputSource, /<ReasoningEffortSlider/);
  assert.match(chatInputSource, /footer=\{onThinkingLevelChange \? \(/);
});
