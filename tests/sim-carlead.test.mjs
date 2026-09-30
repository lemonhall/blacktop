/**
 * **人和车，各回各的那一刻。**
 *
 * 攻击判定拿 `vt`（我看见车手的时刻）和 `cvt`（我看见车流的时刻）回看，这两个
 * 时刻**不一样**：车流在画面上被补到了最新一帧（见 `web/js/view.mjs` 和
 * `tests/web-traffic-lead.test.mjs`），而人停在插值那一刻。既然画得不一样，判的时候
 * 就得各回各的那一刻——否则"灯亮着却打空"只是从人身上搬到了车上。
 *
 * 这一份钉三件事：两个时刻真的分开算、两个字段同一条生命期、以及老客户端只发
 * `vt` 的时候车流老老实实退回"用当下"（回看是加分项，不是必需品）。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { build } from "./helpers.mjs";
import { poseFor, recordHistory, resetHistory, REWIND_MAX } from "../sim/history.mjs";
import { kickTarget, spawnTraffic, VEHICLES } from "../sim/traffic.mjs";
import { punchTarget } from "../sim/combat.mjs";
import { pushCmd, resetQueue, takeCmd } from "../sim/netcode.mjs";

/**
 * 一局摆好的戏：`A` 那一刻人在眼前、车在远处；`B` 那一刻人跑远了、车贴上来。
 * 两个时刻各自记一帧历史，之后就能让"回看哪一刻"变成一次**可分辨**的选择。
 */
function scene() {
  const w = build({ seed: 100, bots: 2, humans: [] });
  const [a, b] = w.racers;
  w.countdown = 0;
  w.events.length = 0;
  w.traffic.length = 0;
  a.x = 0; a.z = 1000; a.v = 30;
  b.x = 0; b.z = 1000; b.v = 30;
  const car = spawnTraffic(w, 400, "dayun");
  car.x = a.x; car.dir = -1; car.v = 20;

  // A：b 就在眼前两米四；大运还在六十米外。
  w.time = 10; b.z = a.z + 2.4; car.z = a.z + 60;
  resetHistory(w);
  recordHistory(w);
  // B：b 已经跑到九十米外；大运的车头离我六米（车面已经进了踹车窗口）。
  w.time = 10.2; b.z = a.z + 90; car.z = a.z + VEHICLES.dayun.len / 2 + 6;
  recordHistory(w);
  return { w, a, b, car };
}

test("人按我看见他们的那一刻判，车按我看见它们的那一刻判", () => {
  const { w, a, b, car } = scene();
  const pose = poseFor(w, { vt: 10, cvt: 10.2 });
  assert.ok(pose, "两个时刻都回看得到");
  assert.equal(punchTarget(w, a, 1, 0, pose), b, "人：回到 A，正前方那两米四里的人就是 b");
  assert.equal(kickTarget(w, a, pose), car, "车：回到 B，大运的车面已经在窗口里");
});

test("只回看其中一刻就够不着了——证明这确实是两个时刻", () => {
  const { w, a } = scene();
  assert.equal(kickTarget(w, a, poseFor(w, { vt: 10, cvt: 10 })), null,
    "拿人那一刻去踹车：大运还在六十米外，够不着");
  assert.equal(punchTarget(w, a, 1, 0, poseFor(w, { vt: 10.2, cvt: 10.2 })), null,
    "拿车那一刻去打人：b 已经九十米外，够不着");
});

test("`cvt` 和 `vt`／动作位共用同一条生命期：第一格带出去，后面的格不带", () => {
  const a = { x: 0, z: 0 };
  resetQueue(a);
  pushCmd(a, { sq: 1, th: 1, br: 0, st: 0, act: 1, nos: 0, n: 2, vt: 42.5, cvt: 42.64 }, 0);
  const first = takeCmd(a);
  assert.equal(first.vt, 42.5, "第一格带上'我看见的人'");
  assert.equal(first.cvt, 42.64, "第一格带上'我看见的车'");
  const second = takeCmd(a);
  assert.equal(second.vt, undefined, "第二格不该再带一次");
  assert.equal(second.cvt, undefined, "第二格不该再带一次");
});

test("只发一半（人或车缺一个）：整块作废，两边一起退回当下", () => {
  const { w, a, car } = scene();
  // 只发 `vt` 的老客户端：**不许**只回看人、车留在这个当下——那样相对位置会凭空
  // 差出十几米，"看着贴上了却打不着"就是这么来的。两个都缺就两个都不回看。
  assert.equal(poseFor(w, { vt: 10 }), null, "只有 vt：不做半份回看");
  assert.equal(poseFor(w, { cvt: 10 }), null, "只有 cvt：一样不做半份回看");
  assert.equal(kickTarget(w, a, null), car, "退回当下：车头六米，照常够得着");
  assert.ok(poseFor(w, { vt: 10, cvt: 10 }), "两个都在才回看");
  assert.equal(poseFor(w, { vt: undefined, cvt: undefined }), null, "两个都没有 = 用当下");
  assert.equal(poseFor(w, null), null, "连命令都没有也给 null");
});

test("回看有上限：报一个很早的时刻，宁可退回当下也不翻旧账", () => {
  const { w } = scene();
  // 10 秒那一刻的历史比"上限"早得多（这里 `w.time` 已经是 10.2）。
  const pose = poseFor(w, { vt: 5, cvt: 5 });
  assert.equal(pose, null, `五秒前的那一帧不该被翻出来（回看上限 ${REWIND_MAX} 秒）`);
});
