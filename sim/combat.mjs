/**
 * 出拳、飞踢、以及两台车贴在一起的时候互相挤开。
 *
 * **这一层只有两个方向、没有招式**——1996 那版就是这样：正前方一拳打身前的人，
 * 回身一拳打身后追上来的那个人。手里举着哪一件由 `weapons.mjs` 的表说了算：
 * 够得多远（reach）、打得多疼（dmg）、挥得多快（cd）、把人推多开（pull）全部
 * 来自那张表，空手也走同一条路径。所以"有没有家伙"在这里不是分支，是数据。
 */

import { STAMINA_MAX, TUNE, specOf } from "./spec.mjs";
import { WEAPONS, heldWeapon, spendCharge } from "./weapons.mjs";
import { stealWeapon } from "./pickups.mjs";
import { VEHICLES, fling, kickTarget } from "./traffic.mjs";
import { CRITTERS, critterTarget, flingCritter } from "./critters.mjs";
import { wreck } from "./impact.mjs";

/**
 * 出拳 / 飞踢。判定顺序就是**优先级**：
 *   1. 迎面来的车在出脚窗口里 → 踢飞（只在前打）；
 *   2. 身旁有人 → 一拳下去，打到体力见底就把他撂下车；
 *   3. 什么都没有 → 挥空（照样掉体力，别乱按）。
 */
export function attack(w, r, dir = 1) {
  if (r.attackCd > 0 || r.state !== "ride") return false;
  const held = heldWeapon(r);
  const spec = held ? WEAPONS[held.i] || WEAPONS[0] : WEAPONS[0];
  r.attackCd = TUNE.attackCd * spec.cd;
  r.swing = TUNE.swing;
  r.stamina = Math.max(0, r.stamina - TUNE.attackCost);

  // 充能的家伙挥一次少一次。用光当场丢掉并喊一声——不喊的话，玩家只会觉得
  // "这一下怎么没伤害"，而不知道手里的油桶已经空了。
  if (held && spec.charges > 0) {
    const spent = spendCharge(r);
    if (spent) w.events.push({ k: "spent", a: r.id, w: spent.id, z: r.z, x: r.x });
  }

  // 社会车辆：只有**正前方**那一拳能踹，但踹得动的是路上的每一台——大运、公交、
  // 三轮车都算。回头踹一辆迎面而来的大运没有道理，而且那会让"什么时候回头"
  // 变成没有代价的选择。
  //
  // 赏金写在车型表里（`traffic.mjs` 的 `cash`）：踹飞一台三轮车和踹飞一台油罐车
  // 不该是一个价，而"这一脚值多少"是调平衡，不该出现在这段代码里。
  if (dir > 0) {
    const car = kickTarget(w, r);
    // 畜生优先于车流：一头牛站在路中间的时候，你那一脚本来就是冲它去的——
    // 只有"车更近"的时候才让车抢在前面。
    const beast = critterTarget(w, r);
    const useBeast = beast && (!car || beast.z < car.z);
    if (useBeast && flingCritter(w, beast, Math.sign(beast.x - r.x) || 1)) {
      const info = CRITTERS[beast.kind] || CRITTERS.cow;
      r.kills++;
      r.cash += info.cash;
      r.stamina = Math.min(STAMINA_MAX, r.stamina + 30);
      w.events.push({
        k: "beast", a: r.id, kind: beast.kind, n: info.name, pay: info.cash,
        z: beast.z, x: beast.x,
      });
      return true;
    }
    const cash = car ? (VEHICLES[car.kind] || {}).cash || 400 : 0;
    if (car && fling(w, car, Math.sign(car.x - r.x) || 1)) {
      r.kills++;
      r.cash += cash;
      r.stamina = Math.min(STAMINA_MAX, r.stamina + 22);
      w.events.push({ k: "fling", a: r.id, kind: car.kind, pay: cash, z: car.z, x: car.x, w: r.x });
      return true;
    }
  }

  const target = punchTarget(w, r, dir, spec.reach);
  if (!target) {
    w.events.push({ k: "whiff", a: r.id, z: r.z, x: r.x, dir });
    return false;
  }
  const dmg = (TUNE.punchDmg + r.v * 0.12) * (1.15 / specOf(target).mass)
    * spec.dmg * (dir > 0 ? 1 : TUNE.backDmg);
  target.stamina -= dmg;
  target.lastHit = w.time;
  target.lat += Math.sign(target.x - r.x || 1) * spec.pull;
  target.wobble = 1;
  w.events.push({
    k: "hit", a: r.id, b: target.id, z: target.z, x: target.x,
    d: Math.round(dmg), dir, w: spec.id,
  });
  // 抢家伙：判在"他倒不倒下"之前。那一下要是把他打下车了，也该是你手里多一件，
  // 而不是两个人一起丢掉。
  if (target.swing > 0 && target.belt && target.belt.length) stealWeapon(w, r, target);
  if (target.stamina <= 0) {
    if (wreck(w, target, { kind: "down", by: r.id })) r.downs++;
  }
  return true;
}

/**
 * 打谁：`dir` 是出手方向（`+1` 向前 / `-1` 回身）。
 *
 * 窗口按方向拆开——前打看身前 `0~3.8` 米，回身打看身后 `0~3.6` 米，而"正好
 * 并排"的那 `0.8` 米两边都够得着。然后在**出手的那一侧**里挑最近的：前打
 * 优先打正前方的人，回身打优先打身后的人；另一侧的人只是"够得着但不好打"，
 * 记分按 1.6 倍折算，所以它永远不会抢在前面那个人之前被选中。
 */
export function punchTarget(w, r, dir = 1, reachAdd = 0) {
  const front = dir > 0;
  // 家伙把够得着的窗口**两头都拉长**：手里多一件，就等于往前多伸出去一截。
  const lo = front ? -TUNE.reachSide : -(TUNE.reachBack + reachAdd);
  const hi = front ? TUNE.reachFront + reachAdd : TUNE.reachSide;
  let best = null, bestScore = Infinity;
  for (const o of w.racers) {
    if (o === r || o.state === "wreck") continue;
    const dz = o.z - r.z;
    const dx = o.x - r.x;
    if (dz < lo || dz > hi || Math.abs(dx) > TUNE.reachX) continue;
    if (w.time - o.lastHit < TUNE.hurtDelay) continue;
    const sameSide = front ? dz >= 0 : dz <= 0;
    const score = Math.abs(dz) * (sameSide ? 1 : 1.6) + Math.abs(dx) * 0.7;
    if (score < bestScore) { best = o; bestScore = score; }
  }
  return best;
}

/** 车与车贴在一起：互相挤开，谁也不掉速（掉速交给"撞车"和出拳）。 */
export function bump(w, r) {
  for (const o of w.racers) {
    if (o === r || o.state === "wreck" || r.state === "wreck") continue;
    const dz = o.z - r.z, dx = o.x - r.x;
    if (Math.abs(dz) > 2.0 || Math.abs(dx) > 1.05) continue;
    const push = Math.sign(dx || 1) * (1.05 - Math.abs(dx)) * 2.4;
    r.lat -= push; o.lat += push;
    // 贴在一起时快的那台会把慢的那台"带"起来一点——现实里叫尾流，游戏里叫
    // "别被队友卡住"。系数刻意小到看不出来，但足以避免两个人互相拖死。
    if (Math.abs(dx) < 0.55 && r.v > o.v) o.v += (r.v - o.v) * 0.03;
  }
}
