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
import { racerPose } from "./history.mjs";

/**
 * 出拳 / 飞踢。判定顺序就是**优先级**：
 *   1. 迎面来的车在出脚窗口里 → 踢飞（只在前打）；
 *   2. 身旁有人 → 一拳下去，打到体力见底就把他撂下车；
 *   3. 什么都没有 → 挥空（照样掉体力，别乱按）。
 *
 * `pose` 是"出手那一刻世界的位姿"（`history.mjs`）。有它，判定就在**玩家按下键
 * 时屏幕上显示的那个世界**里做，而不是在"命令飘到服务端之后那个世界"里做——
 * 这 0.2 秒的差别，对向车就是十几米。没有它（机器人、本地预测）就按当下算。
 */
export function attack(w, r, dir = 1, pose = null) {
  if (r.attackCd > 0 || r.state !== "ride") return false;
  const held = heldWeapon(r);
  const spec = held ? WEAPONS[held.i] || WEAPONS[0] : WEAPONS[0];
  r.attackCd = TUNE.attackCd * spec.cd;
  r.swing = TUNE.swing;
  r.stamina = Math.max(0, r.stamina - TUNE.attackCost);
  // 出手的时刻。**只有前打记**：踹车那一脚只从前打出去（回身那一拳够不到车头），
  // 而 `atkSave` 那条保命窗只对"我本来就想踹它"的人开门。
  if (dir > 0) r.atkAt = w.time;

  // 充能的家伙挥一次少一次。用光当场丢掉并喊一声——不喊的话，玩家只会觉得
  // "这一下怎么没伤害"，而不知道手里的油桶已经空了。
  if (held && spec.charges > 0) {
    const spent = spendCharge(r);
    if (spent) w.events.push({ k: "spent", a: r.id, w: spent.id, z: r.z, x: r.x });
  }

  const aim = aimAt(w, r, dir, pose, spec.reach);
  const hit = resolve(w, r, dir, aim, spec);
  // 没打上不等于这一拳作废：手已经挥出去了，接下来 `atkWindow` 秒里谁撞进窗口
  // 就吃这一下——**每格重判一次**（`syncAttack`）。人打不着车、机器人却百发百中，
  // 差别本来就在这里：机器人每一格都在重瞄，人只有按下那一下。窗口把这条差距抹平。
  r.atk = hit ? null : { dir, spec, t: TUNE.atkWindow };
  if (!hit) w.events.push({ k: "whiff", a: r.id, z: r.z, x: r.x, dir });
  return hit;
}

/**
 * 挂起的那一拳。每格一次：先老一秒，再看这个**新世界**里有没有人撞进来。
 *
 * 这里一律用**当下**坐标，不走向历史回看。理由是它和"出手那一刻"说的不是一回事：
 * 回看回答的是"我按下去的时候屏幕上长什么样"，而这段窗口回答的是"我这一拳挥出去
 * 之后，路上有没有东西撞上来"——后者本来就发生在现在。
 */
export function syncAttack(w, r, dt) {
  const a = r.atk;
  if (!a) return false;
  if (r.state !== "ride") { r.atk = null; return false; }
  a.t -= dt;
  if (a.t <= 0) { r.atk = null; return false; }
  if (!resolve(w, r, a.dir, aimAt(w, r, a.dir, null, a.spec.reach), a.spec)) return false;
  r.atk = null;
  return true;
}

/**
 * 把一次判定**兑现**：畜生 → 车 → 人。返回"这一下到底打着了没有"。
 *
 * 抽出来是因为一次出拳有两条路径到达这里：按下那一刻（回看画面）、以及之后每格
 * 的重判（当下）。两条路径要是各写一份结算，迟早会出现"窗口里打着的伤比按下去
 * 打着的轻"这种鬼话。判定与兑现各一份，这条线就只在一个地方。
 */
function resolve(w, r, dir, aim, spec) {
  // 社会车辆：只有**正前方**那一拳能踹，但踹得动的是路上的每一台——大运、公交、
  // 三轮车都算。回头踹一辆迎面而来的大运没有道理，而且那会让"什么时候回头"
  // 变成没有代价的选择。
  //
  // 赏金写在车型表里（`traffic.mjs` 的 `cash`）：踹飞一台三轮车和踹飞一台油罐车
  // 不该是一个价，而"这一脚值多少"是调平衡，不该出现在这段代码里。
  if (aim.kind === "beast") {
    const beast = aim.target;
    const info = CRITTERS[beast.kind] || CRITTERS.cow;
    flingCritter(w, beast, Math.sign(beast.x - r.x) || 1);
    r.kills++;
    r.cash += info.cash;
    r.stamina = Math.min(STAMINA_MAX, r.stamina + 30);
    w.events.push({
      k: "beast", a: r.id, kind: beast.kind, n: info.name, pay: info.cash,
      z: beast.z, x: beast.x,
    });
    return true;
  }
  if (aim.kind === "car") {
    const car = aim.target;
    const cash = (VEHICLES[car.kind] || {}).cash || 400;
    // 把出手那一刻的速度一起递过去：飞出去的初速要**跟得上踹它的人**，否则那台车
    // 会立刻掉到画面后面去，玩家看不见自己踹飞了什么（见 `traffic.fling`）。
    fling(w, car, Math.sign(car.x - r.x) || 1, r.v);
    r.kills++;
    r.cash += cash;
    r.stamina = Math.min(STAMINA_MAX, r.stamina + 22);
    w.events.push({ k: "fling", a: r.id, kind: car.kind, pay: cash, z: car.z, x: car.x, w: r.x });
    return true;
  }

  const target = aim.target;
  if (!target) return false;
  // 高速的那一拳更疼（`kickBonus`）：人是骑着车打的，"飞踢"和"停着抡"不该一个价。
  // 门槛写在 30 m/s（108 km/h）——那是"真的在跑"的下限，低于它的人本来也追不上谁。
  const speed = r.v > 30 ? TUNE.kickBonus : 0;
  const dmg = (TUNE.punchDmg + r.v * 0.12 + speed) * (1.15 / specOf(target).mass)
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
 * "这一拳会打在什么上"——**判定与提示的唯一出处**。
 *
 * 它存在的理由不是复用，是**不许两边各写一份**：客户端要在 HUD 上告诉玩家
 * "现在按下去够得着"，而那句提示如果和服务端的判定不是同一段代码，迟早会
 * 变成"灯亮着却打空"——那比没有提示更伤。两边的差别只有一个：客户端传进来
 * 的是**画面上的位姿**（`buildView` 插值出来的），服务端传进来的是**回看到的
 * 位姿**（`history.poseAt`）——而"回看"的存在，本来就是为了让这两个世界重合。
 *
 * 优先级就是判定的优先级：畜生 → 车流 → 人 → 空气。一头牛站在路中间的时候，
 * 你那一脚本来就是冲它去的——只有"车更近"的时候才让车抢在前面。
 */
export function aimAt(w, r, dir = 1, pose = null, reachAdd = 0) {
  if (dir <= 0) return { kind: "racer", target: punchTarget(w, r, dir, reachAdd, pose) };
  const car = kickTarget(w, r, pose);
  const beast = critterTarget(w, r);
  if (beast && (!car || beast.z < car.z)) return { kind: "beast", target: beast };
  if (car) return { kind: "car", target: car };
  return { kind: "racer", target: punchTarget(w, r, dir, reachAdd, pose) };
}

/**
 * 打谁：`dir` 是出手方向（`+1` 向前 / `-1` 回身）。
 *
 * 窗口按方向拆开——前打看身前一段，回身打看身后一段，而"正好并排"的那一小段
 * 两边都够得着（长度都写在 `spec.mjs` 的 `TUNE` 里）。然后在**出手的那一侧**里
 * 挑最近的：前打优先打正前方的人，回身打优先打身后的人；另一侧的人只是"够得着
 * 但不好打"，记分按 1.6 倍折算，所以它永远不会抢在前面那个人之前被选中。
 *
 * `xPad` 是**给提示灯留的横向余量**：判定用 `0`，HUD 想知道"他是不是就在旁边、
 * 只差半个车道"时放宽一档。z 那一维两边共用——因为它描述的是同一件事，而横向
 * 那一维放宽只影响"要不要提醒你靠过去"，不影响打不打得到。
 */
function pickPunch(w, r, dir, reachAdd, pose, xPad) {
  const front = dir > 0;
  // 家伙把够得着的窗口**两头都拉长**：手里多一件，就等于往前多伸出去一截。
  const lo = front ? -TUNE.reachSide : -(TUNE.reachBack + reachAdd);
  const hi = front ? TUNE.reachFront + reachAdd : TUNE.reachSide;
  // 出手的人自己也回到那一刻：只回看目标不回看自己，"我明明在他旁边"仍然会算错
  // ——两个人都在动，相对位置是两个人都要回到过去才算得对。
  const me = racerPose(pose, r);
  let best = null, bestScore = Infinity;
  for (const o of w.racers) {
    if (o === r || o.state === "wreck") continue;
    const p = racerPose(pose, o);
    const dz = p.z - me.z;
    const dx = p.x - me.x;
    if (dz < lo || dz > hi || Math.abs(dx) > TUNE.reachX + xPad) continue;
    if (w.time - o.lastHit < TUNE.hurtDelay) continue;
    const sameSide = front ? dz >= 0 : dz <= 0;
    const score = Math.abs(dz) * (sameSide ? 1 : 1.6) + Math.abs(dx) * 0.7;
    if (score < bestScore) { best = o; bestScore = score; }
  }
  return best;
}

/** 判定用的窗口：横向就是 `TUNE.reachX`。 */
export const punchTarget = (w, r, dir = 1, reachAdd = 0, pose = null) =>
  pickPunch(w, r, dir, reachAdd, pose, 0);

/**
 * "够不着，但他就在我旁边"——同一个 z 窗口，横向再放宽**一整个 `reachX`**。
 *
 * 这条只在 HUD 上用。加它的原因是一次线上实测：人按 J 的命中率只有 11%，而
 * 机器人是 91%——差别不在手快，在人**并排跑在邻道上**（车道宽 3.6 米，判定窗口
 * 1.75 米），画面上两台车明明贴着，判定却够不着。放宽之后的答案不是"多给你
 * 两米"（那会毁掉平衡），而是"告诉你该往哪边靠一下"。
 */
export const nudgeTarget = (w, r, dir = 1, reachAdd = 0, pose = null) =>
  pickPunch(w, r, dir, reachAdd, pose, TUNE.reachX);

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
