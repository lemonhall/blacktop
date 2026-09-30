/**
 * 出拳的**有效判定窗**：手挥出去之后，这一拳还认 `TUNE.atkWindow` 秒的目标。
 *
 * 这一份对着的是一句玩家原话——"你确实实现了攻击，但我在游戏里几乎打不上"。
 * 判定的宽度（几米）早就调过了，真正的问题在**时间**：判定原来只发生在按下的
 * 那一格，而对向来车 70 m/s，十一米的窗口合 157 毫秒，比人的反应还短。机器人
 * 命中率 91%、人 11%，差别不是手快，是机器人每一格都在重瞄。
 *
 * 四条要钉住的性质：够不着的那一拳**不作废**、撞进窗口的那一下就**兑现一次**、
 * 等太久了就**真的过期**、以及摔在地上时窗口**跟着作废**。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DT } from "../sim/constants.mjs";
import { build } from "./helpers.mjs";
import { attack, stepRacer, syncAttack, TUNE, wreck } from "../sim/racer.mjs";
import { spawnTraffic } from "../sim/traffic.mjs";

const input = patch => ({ th: 0, br: 0, st: 0, nos: 0, act: 0, ...patch });

/** 两个人：`a` 站在 1000 米，`b` 摆在它前面 `dz` 米（`reachFront` 是 5.2）。 */
function pair(dz) {
  const w = build({ seed: 100, bots: 2, humans: [] });
  const [a, b] = w.racers;
  w.countdown = 0; w.events.length = 0; w.traffic.length = 0;
  a.x = 0; a.z = 1000; a.v = 30;
  b.x = 0.5; b.z = 1000 + dz; b.v = 30;
  return { w, a, b };
}

const hitsOn = (w, id) => w.events.filter(e => e.k === "hit" && e.b === id).length;

test("够不着的那一拳不作废：它挂成一个窗口", () => {
  const { w, a } = pair(9);
  assert.equal(attack(w, a, 1), false, "九米外的人够不着");
  assert.ok(w.events.some(e => e.k === "whiff"), "当场仍然算挥空（手是真的挥出去了）");
  assert.ok(a.atk, "但这一拳被挂了起来，等着谁撞进来");
  assert.equal(a.atk.dir, 1);
});

test("窗口里的人撞进来就吃这一下，而且只吃一下", () => {
  const { w, a, b } = pair(9);
  attack(w, a, 1);
  b.z = a.z + 3.0;                       // 对手自己凑上来了
  stepRacer(w, a, DT, input({}));
  assert.equal(hitsOn(w, b.id), 1, "撞进窗口就该挨这一下");
  assert.equal(a.atk, null, "打到就消掉，不许一刀两吃");
  for (let i = 0; i < 20; i++) {
    b.lastHit = -99;
    stepRacer(w, a, DT, input({}));
  }
  assert.equal(hitsOn(w, b.id), 1, "兑现之后不再重复");
});

test("窗口会过期：等太久了就真的只是挥空", () => {
  const { w, a, b } = pair(9);
  // 先把对手挪到够不着的远处——这一份测的是**时间**，不是距离：让他自己走进来
  // 就成了上一条。
  b.z = a.z + 300;
  attack(w, a, 1);
  const ticks = Math.ceil(TUNE.atkWindow / DT) + 2;
  for (let i = 0; i < ticks; i++) stepRacer(w, a, DT, input({}));
  assert.equal(a.atk, null, "窗口到期就收手");
  b.lastHit = -99;
  b.z = a.z + 3;
  stepRacer(w, a, DT, input({}));
  assert.equal(hitsOn(w, b.id), 0, "过期之后凑上来也没用");
});

test("挥到一半人摔了：窗口跟着作废", () => {
  const { w, a } = pair(9);
  attack(w, a, 1);
  wreck(w, a, { kind: "crash" });
  assert.equal(syncAttack(w, a, DT), false);
  assert.equal(a.atk, null, "人都躺地上了，手还在挥——这一拳不能再算");
});

test("迎面大运撞进窗口：照样一脚踹飞", () => {
  const { w, a } = pair(9);
  const truck = spawnTraffic(w, a.z + 400, "dayun");
  truck.dir = -1; truck.x = a.x; truck.v = 26;
  truck.z = a.z + 40;
  assert.equal(attack(w, a, 1), false, "四十米外的大运还够不着");
  assert.ok(a.atk, "所以这一脚先挂着");
  truck.z = a.z + 10;
  stepRacer(w, a, DT, input({}));
  assert.equal(truck.state, "flung", "它自己撞进窗口，就该飞出去");
  assert.equal(a.kills, 1);
});

test("窗口只兑现一次：一脚踢飞一台，旁边的车不会被顺手带上", () => {
  const { w, a } = pair(9);
  const one = spawnTraffic(w, a.z + 400, "car");
  const two = spawnTraffic(w, a.z + 400, "car");
  // 二十米：`kickReach` 是 13，量的又是**近侧车面**（车长 4.6 减去一半），
  // 所以"够不着"的界线落在 15.3 米上——摆十四米的话，这一脚本来就已经够得着了。
  for (const v of [one, two]) { v.dir = -1; v.x = a.x; v.v = 20; v.z = a.z + 20; }
  attack(w, a, 1);
  assert.equal(one.state + two.state, "runrun", "二十米外两台都还够不着");
  one.z = a.z + 10;
  stepRacer(w, a, DT, input({}));
  assert.equal(one.state, "flung", "先撞进来的那台飞了");
  assert.equal(two.state, "run", "另一台还在路上");
  assert.equal(a.atk, null);
});
