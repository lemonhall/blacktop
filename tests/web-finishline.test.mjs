/**
 * 圈线与终点横幅。
 *
 * 一局跑三圈之后，"路上那条格子线"这件事分成了两件：**每一圈的尽头都有一条**
 * （它就是起跑线，赛道整圈周期，跨过去路正好卷回起点），而**只有最后一圈的尽头
 * 才挂横幅**。上一版把横幅画在 `track.length`（一圈的尽头）——那是一圈时代的等价
 * 写法，改成三圈之后它会在第一圈就朝你招手，然后你还得再骑两圈。
 *
 * 所以这里钉两层：`lapLines`（该画哪几条、"哪一条是终点"）是纯函数，直接断言；
 * 画出来的笔数用记账画布数——圈线十六格、终点那一条多两道横梁。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { MODES } from "../sim/maps.mjs";
import { createTrack } from "../sim/track.mjs";
import { drawLapLines, lapLines } from "../web/js/finishline.mjs";
import { countOps, spyCtx } from "./helpers/spy-ctx.mjs";

const CAM = {
  W: 1280, H: 720, F: 900, horizon: 300, camX: 0, camY: 3, camZ: 0,
};
/** 画一条线要多少笔：投影层由调用方给，这里给两个"不拐弯"的桩就够数了。 */
const flat = { bendAt: () => 0, hillAt: () => 0 };

function strokesAt(track, camZ) {
  const spy = spyCtx();
  drawLapLines(spy.ctx, { ...CAM, camZ }, {}, { track }, flat);
  return countOps(spy.ops, "fillRect");
}

test("每一圈的尽头都有一条圈线，只有最后一圈的那条是终点", () => {
  const t = createTrack({ seed: 3, mode: "city" });
  assert.equal(t.laps, 3);
  // 刚发车：视野四百米里还没有圈线。
  assert.deepEqual(lapLines(t, 0), []);
  assert.deepEqual(lapLines(t, t.length - 200), [{ z: t.length, lap: 1, finish: false }]);
  assert.deepEqual(lapLines(t, t.length * 2 - 200), [{ z: t.length * 2, lap: 2, finish: false }]);
  assert.deepEqual(lapLines(t, t.totalLength - 200), [{ z: t.totalLength, lap: 3, finish: true }]);
  // 冲过终点：后面没有第四条线，别凭空冒出来一条。
  assert.deepEqual(lapLines(t, t.totalLength + 10), []);
});

test("八条路都成立：圈线的位置跟着一圈长度与圈数走", () => {
  for (const mode of Object.keys(MODES)) {
    const t = createTrack({ seed: 77, mode });
    assert.equal(t.totalLength, t.length * t.laps, `${mode}：总里程不对`);
    const lines = lapLines(t, t.totalLength - 100);
    assert.equal(lines.length, 1, `${mode}：最后一圈的尽头该正好有一条线`);
    assert.equal(lines[0].finish, true, `${mode}：最后一条线不是终点`);
    for (let k = 1; k < t.laps; k++) {
      const mid = lapLines(t, t.length * k - 100);
      assert.equal(mid.length, 1, `${mode}：第 ${k} 圈尽头没有线`);
      assert.equal(mid[0].finish, false, `${mode}：第 ${k} 圈就挂上了终点横幅`);
    }
  }
});

test("单圈的局照样成立：第一条线就是终点", () => {
  const one = lapLines({ length: 1000, laps: 1 }, 900);
  assert.deepEqual(one, [{ z: 1000, lap: 1, finish: true }]);
});

test("画出来：普通圈线十六格，终点那一条多两道横梁", () => {
  const t = createTrack({ seed: 11, mode: "city" });
  assert.equal(strokesAt(t, 0), 0, "起跑线边上不该画线");
  assert.equal(strokesAt(t, t.length - 200), 16, "圈线就是十六格黑白");
  assert.equal(strokesAt(t, t.totalLength - 200), 18, "终点该多两道横梁");
});

test("贴到脚下（`relZ` 太小）的线直接跳过：不许除出无穷大", () => {
  const t = createTrack({ seed: 5, mode: "city" });
  const spy = spyCtx();
  // 相机正压在圈线上：这一条已经被甩在身后，视野里不该再有它。
  drawLapLines(spy.ctx, { ...CAM, camZ: t.length }, {}, { track: t }, flat);
  assert.equal(countOps(spy.ops, "fillRect"), 0);
  for (const [, args] of spy.ops) {
    for (const v of args) assert.ok(Number.isFinite(v), "画出了 NaN / 无穷大");
  }
});
