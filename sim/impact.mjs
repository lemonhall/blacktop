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
import { VEHICLES, fling, kickable } from "./traffic.mjs";
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
    // 车真的撞上来了——先问一句"你刚才是不是想踹它"。
    if (kickSave(w, r, v)) return true;
    const heavy = v.dir === -1 || info.mass >= 2;
    r.hitCd = 1.1;
    wreck(w, r, { kind: v.dir === -1 ? "headon" : "rear", heavy });
    return true;
  }
  return false;
}

/**
 * **这一脚先于撞车。**
 *
 * 线上原话：「我去踢车，经常被车撞倒，很不爽。」查下去发现判定本身没错——踹车的
 * 窗口（`kickTarget`）几何上**完整地盖住**撞车窗口，同一格先跑 `attack` 再跑
 * `collideTraffic`，所以"按得准"从来救得了人。救不了人的是另外两件事：
 *
 *   1. **`aimAt` 里畜生优先于车**。路中间一头牛、车贴着牛后面撞上来的那一格，
 *      `syncAttack` 拿着那 0.42 秒的窗口去踹牛了，窗口用掉，人照样被车撞下车。
 *   2. **车是在手挥出去之后才撞进来的**。`atkWindow` 每格重判一次，但它重判的是
 *      `aimAt` 那套目标——判定顺序一变（比如牛），救人的那一条就断了。
 *
 * 所以这里加一条**直达**的兑现：只要"最近一次前打"还在 `TUNE.atkSave` 之内，
 * 撞上来的这台车就按踹飞处理，不再按撞车处理。它不问牛、不问别人，只问一件事——
 * 你刚才是不是冲着前面出拳了。
 *
 * 边界由 `kickX` 守着（横向超过一整个车道就不算"我在踹它"，那是真的撞上了），
 * 而时长只有 `atkSave`（比 `atkWindow` 短），配合 `attackCd` 就盖不满——按住 J
 * 连打并不能让谁在车流里无敌。
 */
function kickSave(w, r, v) {
  if (r.state !== "ride" || !kickable(v.kind)) return false;
  // `atkAt` 的哨兵是 `-99`（见 `racer.newRacer`）。**不能写成 `> 0`**：发车那一刻
  // 恰好是 `w.time === 0`，按下去记的就是 0——写成 `> 0` 的话，开局那几秒的保命窗
  // 会被自己判成"没按过"。
  if (!(r.atkAt >= 0) || w.time - r.atkAt > TUNE.atkSave) return false;
  if (Math.abs(v.x - r.x) > TUNE.kickX) return false;
  const cash = (VEHICLES[v.kind] || {}).cash || 400;
  if (!fling(w, v, Math.sign(v.x - r.x) || 1, r.v)) return false;
  r.atk = null;
  r.kills++;
  r.cash += cash;
  w.events.push({ k: "fling", a: r.id, kind: v.kind, pay: cash, z: v.z, x: v.x, w: r.x, s: "save" });
  return true;
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
