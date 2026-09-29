/**
 * 路上的畜生：牛、羊、鹿、野猪、狗、鹅。
 *
 * 这是照着 1991～1993 那三代《暴力摩托》里最出名的一个彩蛋做的：**一头牛就那么
 * 站在路上**，你一头撞上去，人车两空。当年没有补丁，玩家只能记住"哪个弯有牛"。
 *
 * 三条设计约束，和车流几乎一样但有一条关键区别：
 *   1. **确定性**：生成只吃 (种子, 槽位号)，**不碰世界那颗随机源**。这条是刻意的：
 *      车流的序列已经被测试钉住了，动物要是也从同一颗流里抽签，加一批牛就会把
 *      每一辆车的生成顺序推后一格，"我今天怎么老撞车"变成没法复现的玄学。
 *   2. **单向横穿**：从路的一侧走到另一侧，走到头就别等了（`gone`），一头牛
 *      不该永动机一样来回过马路。
 *   3. **可以踹**：踹飞一头牛给的钱不如踹飞一台油罐车，但那一脚比什么都好笑。
 *      它和车流走**同一套**起飞物理（抛物线 + 落地 + 消失），表现层也就不必分家。
 */

import { clamp } from "./constants.mjs";
import { hash2 } from "./rng.mjs";

/**
 * 动物表：尺寸（米）、横穿速度、赏金。
 * `h` 只是给表现层的参考高度，碰撞只认 `len`/`wid`——和车流同一套规矩。
 */
export const CRITTERS = {
  cow: { len: 2.5, wid: 1.15, h: 1.45, speed: 1.5, cash: 250, name: "牛" },
  sheep: { len: 1.3, wid: 0.75, h: 0.95, speed: 1.8, cash: 150, name: "羊" },
  deer: { len: 1.9, wid: 0.8, h: 1.5, speed: 3.2, cash: 220, name: "鹿" },
  boar: { len: 1.6, wid: 0.95, h: 1.05, speed: 2.6, cash: 200, name: "野猪" },
  dog: { len: 1.1, wid: 0.45, h: 0.75, speed: 3.4, cash: 120, name: "狗" },
  goose: { len: 0.75, wid: 0.4, h: 0.8, speed: 1.2, cash: 100, name: "鹅" },
};

/** 每条路上的畜生种类。和赛道一样是数据：城市里没有牛，荒野里有。 */
export const CRITTERS_BY_MODE = {
  city: ["dog", "goose", "dog"],
  coast: ["goose", "sheep", "dog"],
  wild: ["cow", "sheep", "deer", "goose"],
  desert: ["cow", "goose", "sheep"],
  forest: ["deer", "boar", "dog"],
  snow: ["deer", "sheep", "boar"],
  works: ["dog", "goose", "dog"],
  neon: ["dog", "goose", "dog"],
};

/** 每多少米一个"动物槽"。**密度刻意低**：一局碰上两三次，才叫彩蛋。 */
const SLOT = 260;
/** 一个槽里出动物的概率。 */
const CHANCE = 0.34;
const BEHIND_CULL = 60;
const AHEAD_CULL = 460;
/** 走到对岸就闪人：`x` 越过这条路两侧各 3 米就算过去了。 */
const OFF_ROAD = 3;

const kindsOf = mode => CRITTERS_BY_MODE[mode] || CRITTERS_BY_MODE.wild;

/**
 * 生成。用 `hash2(matchSeed, slot)` 而不是世界那颗 LCG——**这就是"不碰车流序列"**。
 * 一只动物由 (匹配种子, 槽位号) 完全决定：从哪边来、什么品种、哪条车道、什么时候
 * 动身。所以两台机器上会有同一头牛，而车流的抽签序列一位都没动。
 */
export function spawnCritters(w, leadZ) {
  const seed = w.matchSeed || w.seed || 1;
  const from = Math.max(0, Math.floor((w.critterCursor || 0) / SLOT));
  const upto = Math.floor((leadZ + AHEAD_CULL) / SLOT);
  for (let i = from; i <= upto; i++) {
    if (hash2(seed + 9001, i) > CHANCE) continue;
    const list = kindsOf(w.mode);
    const kind = list[Math.floor(hash2(seed + 9002, i) * list.length) % list.length];
    const info = CRITTERS[kind];
    const side = hash2(seed + 9003, i) < 0.5 ? -1 : 1;
    const z = i * SLOT + 40 + hash2(seed + 9004, i) * (SLOT - 80);
    w.critters.push({
      id: w.nextEntity++,
      kind, z, side,
      x: side * (w.track.halfWidth + 2.4),
      dir: -side,
      v: info.speed * (0.7 + hash2(seed + 9005, i) * 0.6),
      t: 0, state: "walk",
    });
  }
  // 光标推到**下一个还没处理的槽**：写回 `upto * SLOT` 会让同一头牛反复投胎。
  w.critterCursor = Math.max(w.critterCursor || 0, (upto + 1) * SLOT);
}

/** 一步一步挪。被踹飞的走和车流一样的抛物线（表现层共用同一套画法）。 */
export function stepCritters(w, dt) {
  for (const c of w.critters) {
    c.t += dt;
    if (c.state === "flung") {
      c.z += c.dir * c.v * dt * 0.4;
      c.x += c.drift * dt;
      if (c.y > 0 || c.vy > 0) {
        c.vy -= 22 * dt;
        c.y = (c.y || 0) + c.vy * dt;
        c.spin += dt * 7;
        if (c.y <= 0) { c.y = 0; c.vy = 0; c.landedAt = c.t; }
      } else {
        c.v *= 1 - Math.min(0.9, dt * 2.2);
        c.drift *= 1 - Math.min(0.9, dt * 2.2);
      }
      if ((c.landedAt || 0) > 0 && c.t - c.landedAt > 1.2) c.dead = true;
      if (c.t > 5) c.dead = true;
      continue;
    }
    c.x += c.dir * c.v * dt;
    // 走到对岸之外就该收工：它已经进了草丛/沙地，再站下去就是穿帮。
    if (Math.abs(c.x) > w.track.halfWidth + OFF_ROAD) c.dead = true;
  }
  if (w.critters.some(c => c.dead)) w.critters = w.critters.filter(c => !c.dead);
}

/** 看不见的、走过的，都收掉。和车流同一套"无状态生存"的规矩。 */
export function cullCritters(w, backZ, leadZ) {
  const keep = [];
  for (const c of w.critters) {
    if (c.state !== "flung" && (c.z < backZ - BEHIND_CULL || c.z > leadZ + AHEAD_CULL)) continue;
    keep.push(c);
  }
  if (keep.length !== w.critters.length) w.critters = keep;
}

/** 撞上动物：低速只是晃一下，上了速度就是一次摔车——当年就是这么不讲理。 */
export function hitCritter(w, r) {
  if (r.hitCd > 0) return null;
  for (const c of w.critters) {
    if (c.state !== "walk") continue;
    const info = CRITTERS[c.kind];
    if (Math.abs(c.z - r.z) > (info.len + 2.0) * 0.5) continue;
    if (Math.abs(c.x - r.x) > info.wid * 0.5 + 0.5) continue;
    return c;
  }
  return null;
}

/** 正前方够得着的那头畜生。窗口比车小：它是个活物，不给你隔着十米起飞。 */
export function critterTarget(w, r, reachZ = 7.5, reachX = 3.0) {
  let best = null, bestDz = Infinity;
  for (const c of w.critters) {
    if (c.state !== "walk") continue;
    const dz = c.z - r.z;
    if (dz < -2 || dz > reachZ) continue;
    if (Math.abs(c.x - r.x) > reachX) continue;
    if (dz < bestDz) { best = c; bestDz = dz; }
  }
  return best;
}

/** 一脚踹飞一头牛。和 `traffic.fling` 同一套物理，只有起飞系数是现算的。 */
export function flingCritter(w, c, dirX) {
  if (c.state === "flung") return false;
  c.state = "flung";
  c.t = 0;
  c.vy = 13;
  c.y = 0.35;
  c.drift = clamp(dirX, -1, 1) * 13 + 5;
  c.spin = 0;
  return true;
}
