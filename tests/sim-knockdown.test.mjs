/**
 * **把人从车上打下来要几拳？**
 *
 * 这条是从线上的一句抱怨里长出来的：「踢/打摩托车，几乎无法踢翻对方，且就算踢到了，
 * 也没有视觉提醒。」上一版的账是这样的：`punchDmg` 是 17，配上 `r.v * 0.12`，120 km/h
 * 下一拳大约 22 点——**满体力一百要五拳**。而两个人的相对速度决定了你根本凑不满那
 * 五拳：并排跑上两秒就已经是奇迹了。所以判定没错、动作也在，**这一拳就是不疼**。
 *
 * 现在是一张两档的表：低速三拳、高速（≥ 30 m/s）两拳，重家伙再快一档。这一份把它
 * 钉住，顺带钉住下界——**一拳就倒**不行，那不是"打斗"，那是抽奖。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { build } from "./helpers.mjs";
import { attack, TUNE } from "../sim/racer.mjs";
import { WEAPONS, weaponIndex } from "../sim/weapons.mjs";

/** 并排的一对，速度给定。`belt` 给了就往腰里塞一件。 */
function duel(v, weapon = 0) {
  const w = build({ seed: 77, bots: 2, humans: [] });
  const [a, b] = w.racers;
  w.countdown = 0; w.events.length = 0; w.traffic.length = 0;
  a.z = 1000; b.z = 1000.6; a.x = 0; b.x = 0.8;
  a.v = v; b.v = v;
  // **腰里必须是干净的**：`fillRoster` 会给机器人随机发家伙，手里多一件就多一层
  // 伤害倍率（棍棒 1.45、撬棍 1.75），不排空的话这里量到的就不是"一拳"。
  a.belt = weapon ? [{ i: weapon, charges: 0 }] : [];
  a.wi = 0;
  return { w, a, b };
}

/** 一直打，直到对手掉下车；返回用了几拳。 */
function hitsToDown(v, weapon = 0, cap = 20) {
  const { w, a, b } = duel(v, weapon);
  let n = 0;
  while (b.state === "ride" && n < cap) {
    a.attackCd = 0;
    b.lastHit = -99;
    assert.equal(attack(w, a, 1), true, "并排的人应该打得着");
    n++;
  }
  return { n, w, a, b };
}

test("低速：三拳把人撂下车（上一版是五拳，等于打不下来）", () => {
  assert.equal(hitsToDown(25).n, 3);
});

test("高速：两拳——跑起来的那一脚比停着抡重得多", () => {
  assert.equal(hitsToDown(40).n, 2);
});

test("手里拿着撬棍：低速也只要两拳", () => {
  const club = weaponIndex("crowbar");
  assert.ok(WEAPONS[club].dmg > 1.5, "撬棍本来就是这张表里最疼的那一档");
  assert.equal(hitsToDown(25, club).n, 2);
});

test("空手也要两拳，而且空手是伤害的**地板**", () => {
  const { w, a, b } = duel(52);      // 街霸 400 的极速
  a.attackCd = 0;
  attack(w, a, 1);
  assert.equal(b.state, "ride", `空手一拳就打掉了 ${100 - b.stamina} 点体力——太过了`);
  assert.ok(b.stamina > 0);
  // 手里那件家伙是**乘上去**的：这是"捡到东西真的有用"的全部来源。
  assert.equal(hitsToDown(40).n, 2, "空手高速两拳");
});

test("撂倒要留下'是谁干的'：表现层靠它播那句'击倒!'", () => {
  const { w, a, b } = hitsToDown(40);
  const down = w.events.filter(e => e.k === "wreck").at(-1);
  assert.ok(down, "摔车必须有事件");
  assert.equal(down.a, b.id, "摔的是被打的那个");
  assert.equal(down.by, a.id, "`by` 不填，客户端就不知道该给谁鼓掌");
  assert.equal(down.s, "down", "得能从'撞车'里分出来——两种摔法配两种表现");
  assert.equal(a.downs, 1);
});

test("高速那一档有门槛：低于 30 m/s 的加成是零", () => {
  const slow = duel(29), fast = duel(30);
  for (const d of [slow, fast]) { d.a.attackCd = 0; attack(d.w, d.a, 1); }
  const dmg = d => d.b.stamina;
  // 两者的区别只该来自 `r.v * 0.12` 那一点点，`kickBonus` 一分不给。
  assert.ok(dmg(slow) > dmg(fast), "29 m/s 挨的应该比 30 m/s 重（没拿到加成）");
  assert.equal(TUNE.kickBonus, 12, "门槛就在 30 m/s 上，加成写在表里");
});
