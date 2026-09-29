/**
 * 一局比赛的整体行为：确定性、物理不变式、以及**这局能不能跑完**。
 *
 * 这里刻意用"跑满一整场"的方式测试，而不是只跑几百格：速度上限、离心力把车
 * 推到路外、两个机器人卡在一起互相顶住、结算时名次算错——这些都要跑到中后段
 * 才暴露得出来。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { build, digest, run, seconds } from "./helpers.mjs";
import { MAX_RACERS } from "../sim/data.mjs";
import { DT, KMH } from "../sim/constants.mjs";
import { specOf } from "../sim/racer.mjs";
import { TIME_LIMIT } from "../sim/world.mjs";
import { stepWorld } from "../sim/step.mjs";

test("同一颗种子跑两遍 → 逐位一致（这是可复现性的地基）", () => {
  const a = run(build({ seed: 12345 }), seconds(30));
  const b = run(build({ seed: 12345 }), seconds(30));
  assert.equal(digest(a), digest(b));
});

test("不同种子跑出来的是两场比赛", () => {
  const a = run(build({ seed: 1 }), seconds(20));
  const b = run(build({ seed: 999 }), seconds(20));
  assert.notEqual(digest(a), digest(b));
});

test("十五台车都在路上，而且都在往前跑", () => {
  const w = run(build({ seed: 7, bots: 14, humans: [{ ownerId: "g1", name: "柠檬叔" }] }), seconds(25));
  assert.equal(w.racers.length, MAX_RACERS);
  const moving = w.racers.filter(r => r.z > 20);
  // 真人这一局没有输入（测试里没人按键），所以他不动是对的；机器人必须全都在跑。
  assert.ok(moving.length >= MAX_RACERS - 1, `只有 ${moving.length} 台车真的跑起来了`);
  assert.ok(w.racers.every(r => Number.isFinite(r.x) && Number.isFinite(r.z)), "坐标不能变成 NaN");
});

test("物理不变式：速度不超上限、横向不出路面、体力在区间内", () => {
  const w = build({ seed: 31, mode: "wild" });
  run(w, seconds(60), world => {
    for (const r of world.racers) {
      const spec = specOf(r);
      // 氮气给 18% 的额外极速，所以上限是 vmax * 1.18；留一点浮点余量。
      assert.ok(r.v <= spec.vmax * 1.18 + 1e-6, `${r.name} 的速度 ${r.v} 超了上限`);
      assert.ok(Math.abs(r.x) <= world.track.limitX + 1e-6, `${r.name} 骑出了路面`);
      assert.ok(r.stamina >= 0 && r.stamina <= 100.0001, `${r.name} 的体力 ${r.stamina} 越界`);
      assert.ok(r.state === "ride" || r.state === "wreck");
    }
  });
});

test("一场比赛能跑完：所有人冲线，名次按冲线时刻排", () => {
  const w = run(build({ seed: 4211, mode: "city" }), seconds(TIME_LIMIT));
  assert.ok(w.results, "这一场没有结算");
  assert.equal(w.results.reason, "all_finished");
  // 结算必须**同时把世界停表**：房间的节拍器就是靠这个判断"该广播结算了"。
  // 只写 `results` 不写 `phase` 的话，名次算得再对，玩家也永远看不到结算页。
  assert.equal(w.phase, "over");
  const frozen = w.time;
  stepWorld(w, DT);
  assert.equal(w.time, frozen, "结算之后世界不该再往前走");
  const times = w.results.players.map(p => p.time);
  assert.ok(times.every(t => t !== null), "应该所有人都跑完了");
  for (let i = 1; i < times.length; i++) {
    assert.ok(times[i] >= times[i - 1], `第 ${i + 1} 名的成绩比前面还好`);
  }
  assert.equal(w.results.players[0].rank, 1);
  assert.equal(w.results.winner, w.results.players[0].name);
});

test("撞车与被撂倒都要发生，但不能多到变成碰碰车", () => {
  const w = build({ seed: 4211 });
  run(w, seconds(150));
  const crashes = w.racers.map(r => r.crashes);
  const avg = crashes.reduce((a, b) => a + b, 0) / crashes.length;
  assert.ok(avg > 0.4, "一场比赛一次都不摔，说明车流和拳头都没生效");
  assert.ok(avg < 9, `平均每台车摔 ${avg.toFixed(1)} 次，太多了`);
  const downs = w.racers.reduce((a, r) => a + r.downs, 0);
  assert.ok(downs > 0, "没有一个人被撂倒，说明拳头没打到过人");
});

test("换算：仪表盘上的 km/h 就是 m/s 乘 3.6", () => {
  const w = run(build({ seed: 5 }), seconds(20));
  const r = w.racers[0];
  assert.ok(Math.abs(r.kmh - r.v * KMH) < 1e-9);
  assert.ok(r.kmh > 0);
});
