/**
 * 拳头、大运、摔车——这个游戏"暴"的那一半。
 *
 * 每一条都直接对着一条设计承诺：
 *   - 打得准要能把人**撂下车**（而不是只掉点血）；
 *   - 迎面来的**大运可以被一脚踢飞**，而且这是全场唯一的处理方式；
 *   - 摔车**痛但不致命**：躺两秒、从低速爬起来接着打。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DT, KMH } from "../sim/constants.mjs";
import { build } from "./helpers.mjs";
import { attack, stepRacer, wreck, TUNE } from "../sim/racer.mjs";
import { fling, kickTarget, spawnTraffic, stepTraffic } from "../sim/traffic.mjs";

/** 把两个车手摆成并排，然后让左边那个出拳。 */
function duel(dx = 1.0, dz = 0.5) {
  const w = build({ seed: 100, bots: 2, humans: [] });
  const [a, b] = w.racers;
  a.z = 1000; b.z = 1000 + dz;
  a.x = 0; b.x = dx;
  a.v = 30; b.v = 30;
  w.countdown = 0;
  return { w, a, b };
}

test("拳头会掉血、会把对手推向一边、并且有冷却", () => {
  const { w, a, b } = duel();
  const before = b.stamina;
  assert.equal(attack(w, a), true, "并排的人应该能打到");
  assert.ok(b.stamina < before, "被打的人掉了体力");
  assert.ok(a.attackCd > 0, "出过手就要进冷却");
  assert.equal(attack(w, a), false, "冷却里再按也没有第二拳");
  assert.ok(w.events.some(e => e.k === "hit"), "打中要留下事件（表现层靠它做打击感）");
});

test("体力打空 → 人被撂下车（这是唯一的'击倒'途径）", () => {
  const { w, a, b } = duel();
  let guard = 0;
  while (b.state === "ride" && guard++ < 200) {
    a.attackCd = 0;
    b.lastHit = -99;
    attack(w, a);
  }
  assert.equal(b.state, "wreck", "打够次数就该倒");
  assert.equal(b.wreckKind, "down");
  assert.equal(a.downs, 1, "撂倒计数记在出手的人身上");
});

test("摔车是幂等的：同一帧里撞车和挨打同时发生也只摔一次", () => {
  const { w, a } = duel();
  assert.equal(wreck(w, a, { kind: "crash" }), true);
  assert.equal(wreck(w, a, { kind: "down", by: 9 }), false, "第二次不生效");
  assert.equal(a.crashes, 1);
});

test("摔车后两秒爬起来，带着一点滚动速度（否则从零起步就是死刑）", () => {
  const { w, a } = duel();
  wreck(w, a, { kind: "crash" });
  for (let i = 0; i < Math.ceil((TUNE.wreck + 0.05) / DT); i++) stepRacer(w, a, DT, {});
  assert.equal(a.state, "ride");
  assert.ok(a.v > 0, "爬起来必须带速度");
  assert.ok(a.stamina > TUNE.recover - 1, "体力回到一个能动弹的水平");
});

test("迎面来的大运可以被踢飞：加钱、回体力、大运飞出去", () => {
  const { w, a } = duel();
  a.x = 0;
  const truck = spawnTraffic(w, a.z + 100, "dayun");
  assert.equal(truck.kind, "dayun");
  truck.dir = -1; truck.x = 0; truck.z = a.z + 6; truck.v = 26;
  assert.ok(kickTarget(w, a), "六米外的对向大运应该进入出脚窗口");
  const cash = a.cash, st = a.stamina - TUNE.attackCost;
  a.attackCd = 0;
  assert.equal(attack(w, a), true);
  assert.equal(truck.state, "flung", "大运被踢飞了");
  assert.ok(a.cash > cash, "踢飞要给钱");
  assert.ok(a.stamina > st, "踢飞要回一口气——不然这一脚没人愿意踢");
  assert.equal(a.dayuns, 1);
});

test("踢飞的大运会抛物线飞出去，两秒半之后消失", () => {
  const w = build({ seed: 5, bots: 1, humans: [] });
  const truck = spawnTraffic(w, 50, "dayun");
  const z0 = truck.z;
  assert.equal(fling(w, truck, 1), true);
  assert.equal(fling(w, truck, 1), false, "已经飞起来的不再吃第二脚");
  for (let i = 0; i < 200; i++) stepTraffic(w, DT);
  assert.notEqual(truck.z, z0, "它在飞");
  assert.ok(truck.spin > 0, "它在转");
  assert.ok(!w.traffic.includes(truck), "两秒半之后从世界里消失");
});

test("撞上对向车比追尾更疼：这是速度差，不是随机数", () => {
  const rear = build({ seed: 11, bots: 1, humans: [] });
  const head = build({ seed: 11, bots: 1, humans: [] });
  const ra = rear.racers[0], rh = head.racers[0];
  ra.z = 500; rh.z = 500;
  const carA = spawnTraffic(rear, 400, "car");
  carA.dir = 1; carA.x = ra.x; carA.z = ra.z + 1; carA.v = 20;
  const carB = spawnTraffic(head, 400, "oncom");
  carB.dir = -1; carB.x = rh.x; carB.z = rh.z + 1; carB.v = 22;
  rear.countdown = 0; head.countdown = 0;
  stepRacer(rear, ra, DT, { th: 1 });
  stepRacer(head, rh, DT, { th: 1 });
  assert.equal(ra.state, "wreck");
  assert.equal(rh.state, "wreck");
  assert.equal(ra.wreckKind, "rear");
  assert.equal(rh.wreckKind, "headon");
  assert.ok(rh.wreck >= TUNE.wreckHeavy, "对撞要按重摔处理");
  assert.ok(rh.v * KMH < ra.v * KMH + 1, "对撞之后速度掉得更狠");
});
