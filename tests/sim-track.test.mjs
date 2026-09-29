/**
 * 赛道与随机源：**同一颗种子在两台机器上必须算出同一条路**。
 *
 * 这是整条"服务器权威 + 客户端预测"链路的物理基础：客户端不是把路面当成
 * 服务器发来的数据，而是拿种子**自己算一遍**。所以这里测的不是"路好不好看"，
 * 而是"两遍算出来是不是逐位相同"。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createTrack, gridSlot } from "../sim/track.mjs";
import { hash2, cosmeticRng } from "../sim/rng.mjs";
import { MODES } from "../sim/data.mjs";
import { LANE_W, SHOULDER_W } from "../sim/constants.mjs";

test("同种子同模式 → 同一条路（逐位一致）", () => {
  const a = createTrack({ seed: 2024, mode: "city" });
  const b = createTrack({ seed: 2024, mode: "city" });
  for (let z = 0; z < 3600; z += 7) {
    assert.equal(a.curveAt(z), b.curveAt(z));
    assert.equal(a.hillAt(z), b.hillAt(z));
  }
  assert.deepEqual(a.propsBetween(0, 400), b.propsBetween(0, 400));
});

test("不同种子 → 不同的弯（种子真的在用，而不是摆样子）", () => {
  const a = createTrack({ seed: 1, mode: "city" });
  const b = createTrack({ seed: 2, mode: "city" });
  let diff = 0;
  for (let z = 0; z < 900; z += 3) if (Math.abs(a.curveAt(z) - b.curveAt(z)) > 1e-9) diff++;
  assert.ok(diff > 200, `两颗种子只有 ${diff} 个采样点不同，赛道几乎一样`);
});

test("路的宽度就是车道数算出来的宽度，路肩之外没有路", () => {
  for (const mode of Object.keys(MODES)) {
    const t = createTrack({ seed: 9, mode });
    assert.equal(t.halfWidth, MODES[mode].lanes * LANE_W / 2);
    assert.equal(t.limitX, t.halfWidth + SHOULDER_W - 0.6);
    assert.equal(t.surfaceAt(0), "road");
    assert.equal(t.surfaceAt(t.halfWidth), "road");
    assert.equal(t.surfaceAt(t.halfWidth + 1.2), "shoulder");
    assert.ok(t.limitX < t.halfWidth + SHOULDER_W, "车不能压到路肩的最外沿");
  }
});

test("路边道具：无状态、可复现、密度够（这条路的'速度尺'靠它）", () => {
  const t = createTrack({ seed: 55, mode: "city" });
  const props = t.propsBetween(400, 800);
  assert.ok(props.length >= 12, `400 米里只有 ${props.length} 个道具，路边太空`);
  assert.deepEqual(props, createTrack({ seed: 55, mode: "city" }).propsBetween(400, 800));
  for (const p of props) {
    assert.ok(p.z >= 400 && p.z <= 800);
    assert.ok(Math.abs(p.x) > t.halfWidth, "道具不能长在路面上");
    assert.ok(p.kind === "lamp" || p.kind === "tree" || p.kind === "sign" || p.kind === "building");
    assert.ok(p.s > 0.7 && p.s < 1.4, "尺寸要在一个不吓人的区间里");
  }
});

test("发车格：十五台车错开成三列，不重叠、都在起点之后", () => {
  const t = createTrack({ seed: 3, mode: "city" });
  const slots = Array.from({ length: 15 }, (_, i) => gridSlot(t, i));
  assert.equal(new Set(slots.map(s => `${s.x}|${s.z}`)).size, 15, "不能有两个人在同一个格位");
  for (const s of slots) {
    assert.ok(s.z <= 0, "发车格在起点线之后");
    assert.ok(Math.abs(s.x) < t.halfWidth, "发车格在路面之内");
  }
  assert.ok(slots[0].z > slots[14].z, "序号越大越靠后");
});

test("表现层随机源与模拟随机源是两条独立的流", () => {
  const a = cosmeticRng(7), b = cosmeticRng(7);
  assert.equal(a(), b(), "同种子同序列");
  assert.notEqual(cosmeticRng(7)(), cosmeticRng(8)(), "不同种子不同序列");
  assert.equal(hash2(3, 11), hash2(3, 11));
  assert.notEqual(hash2(3, 11), hash2(3, 12));
});
