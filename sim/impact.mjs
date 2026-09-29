/**
 * 撞上去了：**车流、畜生、以及"躺下"这件事本身**。
 *
 * 判据只有一句：**伤害来自速度差**。迎面撞上的、和对上重车（半挂、公交、油罐）比
 * 追尾一台小轿车狠得多。这条不是为了惩罚玩家，而是为了让"贴着对向车道超车"真的
 * 需要一点胆量。判据取**质量**而不是车型白名单——将来加一种大车，不用回来改这里。
 *
 * 低速撞一头牛只是晃一下：如果 30 km/h 蹭到一只鸡也要躺两秒，玩家会觉得这游戏在
 * 耍他。所以这里分了两档，门槛写在 `r.v * 3.6 < 30` 那一行上。
 */

import { KMH } from "./constants.mjs";
import { resetQueue } from "./netcode.mjs";
import { spillBelt } from "./pickups.mjs";
import { CRITTERS, hitCritter } from "./critters.mjs";
import { VEHICLES } from "./traffic.mjs";
import { TUNE } from "./spec.mjs";

/** 撞车：撞上就跑不掉。对向 / 重卡额外加时——速度差是伤害的一部分。 */
export function collideTraffic(w, r) {
  if (r.hitCd > 0) return false;
  // 先看畜生：一头牛比一台轿车小得多，但在路上它是**必须**被看见的东西。
  // 低速（30 km/h 以下）只是晃一下、掉点速；上了速度就是当年那个结局：人车两空。
  const beast = hitCritter(w, r);
  if (beast) {
    const info = CRITTERS[beast.kind] || CRITTERS.cow;
    if (r.v * 3.6 < 30) {
      r.hitCd = 0.9;
      r.v *= 0.55;
      r.lat += Math.sign(r.x - beast.x || 1) * 2.4;
      r.wobble = 1;
      w.events.push({ k: "moo", a: r.id, n: info.name, z: beast.z, x: beast.x, soft: 1 });
    } else {
      r.hitCd = 1.1;
      w.events.push({ k: "moo", a: r.id, n: info.name, z: beast.z, x: beast.x });
      wreck(w, r, { kind: "critter", heavy: info.len > 1.8 });
    }
    return true;
  }
  for (const v of w.traffic) {
    if (v.state !== "run") continue;
    const info = VEHICLES[v.kind];
    if (Math.abs(v.z - r.z) > (info.len + 2.2) * 0.5) continue;
    if (Math.abs(v.x - r.x) > info.wid * 0.5 + 0.55) continue;
    const heavy = v.dir === -1 || info.mass >= 2;
    r.hitCd = 1.1;
    wreck(w, r, { kind: v.dir === -1 ? "headon" : "rear", heavy });
    return true;
  }
  return false;
}

/**
 * 摔车。**幂等**：同一帧里"撞车"和"被打下车"可能同时发生，先到的那个说了算。
 * 顺带把输入队列清空——那是"我本来还要往哪走"的债，人在地上就不该继续兑现。
 */
export function wreck(w, r, { kind = "crash", by = 0, heavy = false } = {}) {
  if (r.state === "wreck") return false;
  r.state = "wreck";
  r.wreck = heavy ? TUNE.wreckHeavy : TUNE.wreck;
  r.wreckKind = kind;
  r.crashes++;
  r.stamina = 0;
  r.lat += Math.sign(r.x || 1) * 5.2;
  // 手里的家伙全甩到路上。痛，但从这一刻起这条路多了一份补给——谁先扶起车
  // 谁就能捡回去，所以"摔了"和"白摔"之间还有一层取舍。
  spillBelt(w, r);
  // 躺得久的人也应该掉得更狠：否则"重摔"就只是画面上多躺一秒。
  r.v *= heavy ? 0.2 : 0.42;
  r.lean = 0;
  resetQueue(r);
  w.events.push({ k: "wreck", a: r.id, s: kind, by, z: r.z, x: r.x, v: Math.round(r.v * KMH) });
  return true;
}
