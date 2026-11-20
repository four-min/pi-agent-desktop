import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  buildSheetKeyframes,
  CRAB_CONTAINER_HEIGHT,
  CRAB_CONTAINER_WIDTH,
  CRAB_FRAME_MS,
  CRAB_GRID_HEIGHT,
  CRAB_GRID_WIDTH,
  CRAB_GUTTER,
  CRAB_IDLE_EXTRAS,
  CRAB_PIXEL_SCALE,
  CRAB_SHEET_URLS,
  CRAB_SHEETS,
  decideStage,
  EXTRA_MIN_MS,
  EXTRA_SPAN_MS,
  finishStage,
  freshStage,
  getCrabStaticSheetUrls,
  getFrameOffsetTransform,
  getSheetCellSize,
  getSheetDurationMs,
  getSheetStripDimensions,
  LEVEL_IDLE,
  LEVEL_NOTIFICATION,
  LEVEL_THINKING,
  MIN_SHOW_MS,
  MOMENTS,
  nextDecisionAt,
  REACTION_PRIORITY,
  resolveMascotLevel,
  SLEEP_AFTER_MS,
  switchSettles,
  takeMoment,
} = await jiti.import("./composer-mascot.ts");

function readPngDimensions(buffer) {
  // PNG signature (8 bytes) + IHDR length (4 bytes) + "IHDR" (4 bytes) + width (4 bytes BE) + height (4 bytes BE).
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

test("CRAB_SHEETS 几何参数完整且站立动作脚部严格贴合 36 逻辑行底边 (72px)", () => {
  assert.equal(CRAB_CONTAINER_WIDTH, 104);
  assert.equal(CRAB_CONTAINER_HEIGHT, 72);
  const keys = Object.keys(CRAB_SHEETS);
  assert.equal(keys.length, 19);

  for (const [key, sheet] of Object.entries(CRAB_SHEETS)) {
    const [x, y, w, h] = sheet.box;
    assert.ok(Number.isInteger(sheet.frames) && sheet.frames >= 1, `${key} frames`);
    assert.ok(
      Number.isInteger(sheet.still) && sheet.still >= 0 && sheet.still < sheet.frames,
      `${key} still frame`,
    );
    assert.ok(x >= 0 && y >= 0 && w >= 1 && h >= 1, `${key} box positive`);
    assert.ok(x + w <= CRAB_GRID_WIDTH && y + h <= CRAB_GRID_HEIGHT, `${key} box in 52x36 grid`);
    if (key !== "drag") {
      // 除拖拽悬空态外, 其余所有动作的裁剪框底边 y + h 必须恰好等于 36, 确保脚踩输入框顶边无悬空或下陷.
      assert.equal(y + h, CRAB_GRID_HEIGHT, `${key} feet must sit on row 36`);
    }
  }
});

test("CRAB_SHEET_URLS 内联资源与 public/mascot/crab 本地静态 PNG 尺寸严格一致", async () => {
  for (const [key, sheet] of Object.entries(CRAB_SHEETS)) {
    const urls = CRAB_SHEET_URLS[key];
    assert.ok(urls, `${key} urls exist`);
    assert.match(urls.body, /^data:image\/png;base64,/);
    assert.match(urls.ink, /^data:image\/png;base64,/);

    const dims = getSheetStripDimensions(sheet, CRAB_GUTTER);
    const staticUrls = getCrabStaticSheetUrls(key);
    assert.equal(staticUrls.body, `/mascot/crab/${key}.png`);
    assert.equal(staticUrls.ink, `/mascot/crab/${key}-ink.png`);

    for (const kind of ["body", "ink"]) {
      const fileName = kind === "body" ? `${key}.png` : `${key}-ink.png`;
      const fileUrl = new URL(`../public/mascot/crab/${fileName}`, import.meta.url);
      const diskBytes = await readFile(fileUrl);
      const inlineBytes = Buffer.from(
        urls[kind].replace(/^data:image\/png;base64,/, ""),
        "base64",
      );
      assert.deepEqual(diskBytes, inlineBytes, `${fileName} disk file matches inline data URI`);

      const pngDims = readPngDimensions(diskBytes);
      assert.equal(
        pngDims.width,
        dims.stripWidth,
        `${fileName} width matches cell layout`,
      );
      assert.equal(
        pngDims.height,
        dims.stripHeight,
        `${fileName} height matches cell layout`,
      );
    }
  }
});

test("getFrameOffsetTransform 与 buildSheetKeyframes 产出精确整数像素偏移与 steps(1) 阶跃关键帧", () => {
  assert.deepEqual(getSheetCellSize(CRAB_SHEETS.idle, CRAB_GUTTER), [26, 18]);
  assert.equal(
    getFrameOffsetTransform(CRAB_SHEETS.idle, 0, CRAB_GUTTER, CRAB_PIXEL_SCALE),
    "translate(-2px, -2px)",
  );
  // error 静态帧为第 5 帧 (index 4): cellWidth = 26 + 2 = 28, -(4 * 28 + 1) * 2 = -226px.
  assert.equal(
    getFrameOffsetTransform(
      CRAB_SHEETS.error,
      CRAB_SHEETS.error.still,
      CRAB_GUTTER,
      CRAB_PIXEL_SCALE,
    ),
    "translate(-226px, -2px)",
  );
  // 越界帧索引安全夹紧到有效范围.
  assert.equal(
    getFrameOffsetTransform(CRAB_SHEETS.typing, -5),
    getFrameOffsetTransform(CRAB_SHEETS.typing, 0),
  );
  assert.equal(
    getFrameOffsetTransform(CRAB_SHEETS.typing, 999),
    getFrameOffsetTransform(CRAB_SHEETS.typing, CRAB_SHEETS.typing.frames - 1),
  );

  const loopFrames = buildSheetKeyframes(CRAB_SHEETS.typing, "loop");
  assert.equal(loopFrames.length, CRAB_SHEETS.typing.frames + 1);
  assert.equal(loopFrames[0].easing, "steps(1)");
  assert.equal(loopFrames[0].transform, "translate(-2px, -2px)");
  assert.equal(loopFrames[loopFrames.length - 1].offset, 1);
  assert.equal(loopFrames[loopFrames.length - 1].transform, "translate(-2px, -2px)");

  const onceFrames = buildSheetKeyframes(CRAB_SHEETS.typing, "once");
  assert.equal(
    onceFrames[onceFrames.length - 1].transform,
    getFrameOffsetTransform(CRAB_SHEETS.typing, CRAB_SHEETS.typing.frames - 1),
  );
  assert.equal(getSheetDurationMs(CRAB_SHEETS.idle, CRAB_FRAME_MS), 24 * 80);
});

test("resolveMascotLevel 按优先级将输入框与会话运行状态映射为对应动画", () => {
  assert.deepEqual(resolveMascotLevel({}), LEVEL_IDLE);
  assert.deepEqual(resolveMascotLevel({ isStreaming: true }), LEVEL_THINKING);
  assert.equal(
    resolveMascotLevel({ isStreaming: true, turnPhase: "working", busySessionCount: 1 }).animation,
    "typing",
  );
  assert.equal(
    resolveMascotLevel({ isStreaming: true, turnPhase: "working", busySessionCount: 2 }).animation,
    "music",
  );
  assert.equal(
    resolveMascotLevel({ isStreaming: true, turnPhase: "working", busySessionCount: 3 }).animation,
    "building",
  );
  assert.equal(
    resolveMascotLevel({ isStreaming: true, runningSubagentCount: 1 }).animation,
    "music",
  );
  assert.equal(
    resolveMascotLevel({ isStreaming: true, runningSubagentCount: 2 }).animation,
    "conducting",
  );
  assert.equal(
    resolveMascotLevel({ isStreaming: true, isCompacting: true, runningSubagentCount: 2 }).animation,
    "compacting",
  );
  assert.deepEqual(
    resolveMascotLevel({ isCompacting: true, hasNotification: true }),
    LEVEL_NOTIFICATION,
  );
});

test("状态机覆盖瞬时反馈排队, 60s 睡眠与唤醒, 待机微动作与防抖驻留", () => {
  const around = (extrasAllowed = true) => ({
    extras: CRAB_IDLE_EXTRAS,
    extrasAllowed,
    random: () => 0,
  });

  // 1. 低优先级 attention 在高优先级 error 后排队, 待 error 结束后完整播放 happy.
  const stage = freshStage(0);
  assert.equal(takeMoment(stage, "error", 0), true);
  assert.equal(takeMoment(stage, "attention", 1000), false);
  assert.equal(decideStage(stage, 2000, LEVEL_IDLE, around()).key, "error");
  const errorEnd = MOMENTS.error.holdMs;
  assert.equal(decideStage(stage, errorEnd, LEVEL_IDLE, around()).key, "happy");
  assert.equal(stage.moment.until, errorEnd + MOMENTS.attention.holdMs);

  // 2. 安静满 60s 进入 sleeping, 工作或交互后重置 quietSince 并单次播放 waking.
  const sleepStage = freshStage(0);
  assert.equal(decideStage(sleepStage, SLEEP_AFTER_MS - 1, LEVEL_IDLE, around(false)).key, "idle");
  assert.equal(decideStage(sleepStage, SLEEP_AFTER_MS, LEVEL_IDLE, around(false)).key, "sleeping");
  sleepStage.quietSince = SLEEP_AFTER_MS + 10;
  sleepStage.asleep = false;
  sleepStage.waking = true;
  assert.deepEqual(decideStage(sleepStage, SLEEP_AFTER_MS + 10, LEVEL_IDLE, around(false)), {
    key: "waking",
    mode: "once",
    priority: 1,
  });
  finishStage(sleepStage, "waking", SLEEP_AFTER_MS + 100, () => 0);
  assert.equal(sleepStage.waking, false);

  // 3. 待机微动作按间隔触发一次并重排下次时间.
  const extraStage = freshStage(0);
  assert.equal(decideStage(extraStage, 0, LEVEL_IDLE, around(true)).key, "idle");
  assert.equal(extraStage.nextExtraAt, EXTRA_MIN_MS);
  assert.deepEqual(decideStage(extraStage, EXTRA_MIN_MS, LEVEL_IDLE, around(true)), {
    key: "idle-look",
    mode: "once",
    priority: 1,
  });
  finishStage(extraStage, "idle-look", EXTRA_MIN_MS + 500, () => 1);
  assert.equal(extraStage.extra, null);
  assert.equal(extraStage.nextExtraAt, EXTRA_MIN_MS + 500 + EXTRA_MIN_MS + EXTRA_SPAN_MS);

  // 4. 刚切换的循环状态在 MIN_SHOW_MS 内不被平级或低级状态打断, 但可被更高优先级状态抢占.
  const settleStage = freshStage(0);
  const workingLevel = resolveMascotLevel({ turnPhase: "working" });
  const pick = decideStage(settleStage, 0, workingLevel, around());
  settleStage.current = { ...pick, start: 0 };
  const thinkingPick = decideStage(settleStage, 10, LEVEL_THINKING, around());
  assert.equal(switchSettles(settleStage, thinkingPick, 10), false);
  assert.equal(switchSettles(settleStage, thinkingPick, MIN_SHOW_MS), true);
  const notifPick = decideStage(settleStage, 10, LEVEL_NOTIFICATION, around());
  assert.equal(switchSettles(settleStage, notifPick, 10), true);

  // 5. nextDecisionAt 计算最早状态翻转时刻.
  const timerStage = freshStage(0);
  timerStage.level = LEVEL_IDLE;
  assert.equal(nextDecisionAt(timerStage, 0, false, () => 400), SLEEP_AFTER_MS);
  timerStage.current = { key: "poke-left", mode: "once", priority: REACTION_PRIORITY, start: 200 };
  assert.equal(nextDecisionAt(timerStage, 200, false, () => 400), 600);
});
