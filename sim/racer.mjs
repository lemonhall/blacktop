/**
 * 车手：物理、体力、出拳、摔车。人类和机器人走的是**同一段代码**，区别只在
 * "input 从哪来"——人类从命令队列（`netcode.mjs`），机器人从 `ai.mjs`。
 *
 * 摔车是整个手感的重心。撞车、被打到体力见底，结果都是"人车分离"：车速掉光、
 * 躺两秒、再从低速爬起来。它必须**痛**（否则躲车流没有意义），但不能**致命**
 * （否则一局里摔两次就不用玩了）——所以时长固定、体力固定回一点点。
 */

import { clamp, KMH } from "./constants.mjs";
import { BIKES } from "./data.mjs";
import { resetQueue } from "./netcode.mjs";
import { VEHICLES, fling, kickTarget } from "./traffic.mjs";

export const STAMINA_MAX = 100;
export const NITRO_TIME = 2.4;
export const NITRO_CD = 9;

export const TUNE = {
  // 体力回得快、掉得慢，是**刻意**的：一局里被撂倒三五次是刺激，被撂倒二十次
  // 是折磨。所有"打架很凶"的观感都该来自拳头挥出去的那一下，而不是来自掉血速度。
  regen: 11, regenDelay: 3.0,
  attackCost: 5, attackCd: 0.5, swing: 0.3,
  /**
   * 够得着的范围（米，沿路方向）。**原版的攻击不分招式、分方向**：正前方一拳
   * 打身前的人，回身一拳打身后追上来的那个人。回身那一拳够得着的人少一点、
   * 伤害低一点——回头出手本来就别扭，这是手感，不是平衡。
   * `reachSide` 是"正好并排"的那半米：两边都够得着，否则两台车贴在一起就成了
   * "脸对脸谁也打不着谁"。
   */
  reachFront: 3.8, reachBack: 3.6, reachSide: 0.8, reachX: 1.75, backDmg: 0.85,
  /** 被打的人有 0.4 秒的"缓一下"：没有这道闸门，三台车并排时能在一秒内把人打下车。 */
  hurtDelay: 0.4,
  punchDmg: 17, kickBonus: 7,
  wreck: 2.0, wreckHeavy: 2.8,
  recover: 62, recoverSpeed: 0.34,
  shoulderCap: 0.64, offroadDrag: 1.6,
  driftPull: 0.44, steerSpeed: 11.5,
};

export function newRacer(w, { id, kind, ownerId, name, bike = 0, palette = 0, skill = 1, grid = { x: 0, z: 0 } }) {
  const r = {
    id, kind, ownerId, name,
    bike: clamp(Math.floor(bike), 0, BIKES.length - 1),
    palette: palette % 8, skill,
    x: grid.x, z: grid.z, v: 0, lat: 0, lean: 0, wobble: 0,
    stamina: STAMINA_MAX, state: "ride", wreck: 0, wreckKind: "",
    attackCd: 0, hitCd: 0, swing: 0, nitroT: 0, nitroCd: 0,
    lastHit: -99, downs: 0, dayuns: 0, crashes: 0, topV: 0, cash: 0,
    finished: false, finishTime: 0, rank: 0, kmh: 0,
  };
  resetQueue(r);
  return r;
}

export const specOf = r => BIKES[r.bike];

/** 一帧的推进。`input` 是 { th, br, st, act, nos }，取值都是 -1/0/1 或布尔。 */
export function stepRacer(w, r, dt, input = {}) {
  const spec = specOf(r);
  r.attackCd = Math.max(0, r.attackCd - dt);
  r.hitCd = Math.max(0, r.hitCd - dt);
  r.swing = Math.max(0, r.swing - dt);
  r.nitroT = Math.max(0, r.nitroT - dt);
  r.nitroCd = Math.max(0, r.nitroCd - dt);

  if (r.state === "wreck") return stepWreck(w, r, dt);

  const road = w.track.surfaceAt(r.x) === "road";
  const nitro = r.nitroT > 0;
  const cap = spec.vmax * (nitro ? 1.18 : 1) * (road ? 1 : TUNE.shoulderCap);
  // 阻力常数取 accel / vmax²：于是"油门到底"的稳态速度正好落在 vmax，不用手调。
  const drag = spec.accel / (spec.vmax * spec.vmax);
  let a = (input.th ? spec.accel : 0) - (input.br ? spec.accel * 2.1 : 0);
  if (nitro) a += spec.accel * 0.85;
  a -= drag * r.v * r.v * (road ? 1 : TUNE.offroadDrag);
  r.v = clamp(r.v + a * dt, 0, cap);
  if (r.v > r.topV) r.topV = r.v;
  // 前进。这一步**必须**在算完 v 之后、压车之前：压车的难度与离心力都跟速度
  // 挂钩，而"这一格走多远"用的就是刚刚更新过的那个速度。
  r.z += r.v * dt;
  // 冲线之后还能往前滑一段（进缓冲区），但不能无限跑下去——那会让"世界的长度"
  // 变成一个没有上界的数，车流回收的判据跟着一起失效。
  if (r.z > w.track.length + 90) r.z = w.track.length + 90;

  // 压车：速度越高越难压（这是"极速车弯道吃亏"的来源），弯道里还有一股离心力。
  const turn = spec.turn * (1.28 - 0.6 * (r.v / spec.vmax));
  const drift = -w.track.curveAt(r.z) * r.v * r.v / spec.grip * TUNE.driftPull;
  r.x += (input.st * turn * TUNE.steerSpeed + drift) * dt + r.lat * dt;
  r.lat *= 1 - 2.3 * dt;
  r.x = clamp(r.x, -w.track.limitX, w.track.limitX);
  r.lean += ((input.st || 0) * 0.9 - r.lean) * Math.min(1, dt * 6);
  r.wobble = road ? 0 : Math.min(1, r.wobble + dt * 3);
  if (road) r.wobble = Math.max(0, r.wobble - dt * 3);

  if (input.nos && r.nitroCd <= 0 && r.nitroT <= 0) {
    r.nitroT = NITRO_TIME; r.nitroCd = NITRO_CD;
    w.events.push({ k: "nitro", a: r.id });
  }
  if (w.time - r.lastHit > TUNE.regenDelay) {
    r.stamina = Math.min(STAMINA_MAX, r.stamina + TUNE.regen * dt);
  }
  // 攻击位：bit1 = 正前方一拳，bit2 = 回身一拳。两个都按着也只出一拳——原版
  // 一挥手就只挥一次，共用同一个冷却。
  if (input.act & 1) attack(w, r, 1);
  else if (input.act & 2) attack(w, r, -1);

  collideTraffic(w, r) || bump(w, r);
  r.kmh = r.v * KMH;
  return r;
}

function stepWreck(w, r, dt) {
  r.wreck -= dt;
  r.v = Math.max(0, r.v - 30 * dt);
  r.z += r.v * dt;
  r.x = clamp(r.x + r.lat * dt, -w.track.limitX, w.track.limitX);
  r.lat *= 1 - 2.2 * dt;
  r.kmh = r.v * KMH;
  r.lean *= 1 - 3 * dt;
  if (r.wreck <= 0) {
    // 爬起来：给一点滚动速度，否则从静止重新起步在一局里就是死刑。
    r.state = "ride";
    r.stamina = TUNE.recover;
    r.hitCd = 1.2;
    r.v = Math.max(r.v, specOf(r).vmax * TUNE.recoverSpeed);
    resetQueue(r);
  }
  return r;
}

/**
 * 出拳 / 飞踢。判定顺序就是**优先级**：
 *   1. 迎面来的大运在出脚窗口里 → 踢飞（全场唯一能把大运送上天的方式，只在前打）；
 *   2. 身旁有人 → 一拳下去，打到体力见底就把他撂下车；
 *   3. 什么都没有 → 挥空（照样掉体力，别乱按）。
 *
 * `dir` 是出手方向：`+1` 正前方、`-1` 回身。这一层**只有两个方向、没有招式**，
 * 因为原版就是这样的：空手是拳，捡到家伙是武器，区别在够多远，不在按哪几个键。
 */
export function attack(w, r, dir = 1) {
  if (r.attackCd > 0 || r.state !== "ride") return false;
  r.attackCd = TUNE.attackCd;
  r.swing = TUNE.swing;
  r.stamina = Math.max(0, r.stamina - TUNE.attackCost);

  // 大运当前：只有**正前方**那一拳能踢。回头踢飞一辆迎面而来的大运没有道理，
  // 而且那会让"什么时候回头"变成没有代价的选择。
  if (dir > 0) {
    const truck = kickTarget(w, r);
    if (truck && fling(w, truck, Math.sign(truck.x - r.x) || 1)) {
      r.dayuns++;
      r.cash += 1500;
      r.stamina = Math.min(STAMINA_MAX, r.stamina + 22);
      w.events.push({ k: "fling", a: r.id, z: truck.z, x: truck.x, w: r.x });
      return true;
    }
  }

  const target = punchTarget(w, r, dir);
  if (!target) {
    w.events.push({ k: "whiff", a: r.id, z: r.z, x: r.x, dir });
    return false;
  }
  const dmg = (TUNE.punchDmg + r.v * 0.12) * (1.15 / specOf(target).mass) * (dir > 0 ? 1 : TUNE.backDmg);
  target.stamina -= dmg;
  target.lastHit = w.time;
  target.lat += Math.sign(target.x - r.x || 1) * 4.4;
  target.wobble = 1;
  w.events.push({ k: "hit", a: r.id, b: target.id, z: target.z, x: target.x, d: Math.round(dmg), dir });
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
function punchTarget(w, r, dir = 1) {
  const front = dir > 0;
  const lo = front ? -TUNE.reachSide : -TUNE.reachBack;
  const hi = front ? TUNE.reachFront : TUNE.reachSide;
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

/** 撞车：撞上就跑不掉。对向 / 重卡额外加时——速度差是伤害的一部分。 */
function collideTraffic(w, r) {
  if (r.hitCd > 0) return false;
  for (const v of w.traffic) {
    if (v.state !== "run") continue;
    const info = VEHICLES[v.kind];
    if (Math.abs(v.z - r.z) > (info.len + 2.2) * 0.5) continue;
    if (Math.abs(v.x - r.x) > info.wid * 0.5 + 0.55) continue;
    // 伤害来自**速度差**：迎面撞上的（对面车、大运、重卡）比追尾狠得多。
    // 这条不是为了惩罚，而是为了让"贴着对向车道超车"这件事真的需要胆量。
    const heavy = v.dir === -1 || v.kind === "dayun" || v.kind === "truck";
    r.hitCd = 1.1;
    wreck(w, r, { kind: v.dir === -1 ? "headon" : "rear", heavy });
    return true;
  }
  return false;
}

/** 车与车贴在一起：互相挤开，谁也不掉速（掉速交给"撞车"和出拳）。 */
function bump(w, r) {
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
  // 躺得久的人也应该掉得更狠：否则"重摔"就只是画面上多躺一秒。
  r.v *= heavy ? 0.2 : 0.42;
  r.lean = 0;
  resetQueue(r);
  w.events.push({ k: "wreck", a: r.id, s: kind, by, z: r.z, x: r.x, v: Math.round(r.v * KMH) });
  return true;
}

/** 越线：名次由"第几个冲过终点"决定，所以这里只记时刻，排序在世界层做。 */
export function crossFinish(w, r) {
  if (r.finished || r.z < w.track.length) return false;
  r.finished = true;
  r.finishTime = w.time;
  r.rank = ++w.finishers;
  w.events.push({ k: "finish", a: r.id, r: r.rank, z: r.z, x: r.x, n: r.name, h: r.kind === "human" });
  return true;
}
