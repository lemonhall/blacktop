/**
 * 机器人车手。目标不是"打得准"，而是**看起来像个真人**：
 * 会超车、会卡位、会跟你并排互踹，也会在弯道里被离心力推出去。
 *
 * 每个机器人有一点自己的性格（`r.brain`）：偏好横向位置、反应快慢、冒险程度、
 * 油门保留。这些数由世界种子派生，所以同一颗种子跑出来的 13 个机器人脾气一样。
 *
 * 难度从两个地方下手，而不是改物理：**油门上限**（休闲的对手不舍得拧到底）与
 * **犹豫时间**（该躲的时候晚半拍）。改物理会让"同样的车同样的弯"结果不同，
 * 那是作弊；收着开才是"人"。
 *
 * 唯一的硬要求：**必须看得见对向来车**。第一版把对向车排除在避让之外，
 * 结果一场 80 秒的比赛里每台车平均摔 20 次——那不是"暴力摩托"，那是"碰碰车"。
 */

import { clamp } from "./constants.mjs";
import { specOf } from "./racer.mjs";
import { VEHICLES } from "./traffic.mjs";
import { random } from "./rng.mjs";

/** 看一眼的时长（秒）。"车距够不够"比"前方多少米"更接近人的直觉。 */
const HORIZON_S = 1.9;

/** 找空隙时扫的横向步长（米）。半米一格、四车道共 14.4 米 → 30 来个候选位。 */
const SCAN_STEP = 0.45;

export function makeBrain(w, r) {
  const spec = specOf(r);
  return {
    // 偏好位置：不是"某一条车道"，而是一个它觉得舒服的横向坐标。这样四车道和
    // 双车道能共用同一段代码，机器人在窄路上自然就挤在一起了。
    lane: random(w, -w.track.halfWidth * 0.7, w.track.halfWidth * 0.7),
    react: random(w, 0.8, 1.4),
    aggro: random(w, 0.3, 1),
    caution: random(w, 0.8, 1.2),
    jitter: random(w, 0, 6.28),
    think: 0,
    skill: r.skill,
    throttleCap: clamp(r.skill * random(w, 0.9, 1.0), 0.55, 1),
    spec,
  };
}

/** 一帧的机器人入力。返回的字段和人类命令完全一样。 */
export function aiInput(w, r, dt) {
  const b = r.brain || (r.brain = makeBrain(w, r));
  b.think -= dt;
  if (b.think <= 0) {
    b.think = 0.16 + random(w, 0, 0.2);
    b.jitter += 0.7;
  }
  const spec = specOf(r);
  const threat = threatAhead(w, r, HORIZON_S * b.react);
  const want = pickGap(w, r, HORIZON_S * b.react, b);
  const dx = want - r.x;
  const st = Math.abs(dx) < 0.35 ? 0 : Math.sign(dx);

  // 油门：直线拉满，压车时收一点（真的在过弯的人会收油，这既好看又公平）。
  const cap = spec.vmax * b.throttleCap * (1 - 0.04 * Math.abs(st));
  let th = r.v < cap ? 1 : 0;
  let br = 0;
  // 躲不掉才刹车。刹车是最后的体面：踩了刹车还撞上，说明这一下本来就躲不开。
  if (threat && threat.tti < 0.75 * b.caution) { br = 1; th = 0; }

  let act = 0;
  if (r.attackCd <= 0 && r.stamina > 42) {
    const rival = nearestRival(w, r, 3.6);
    // 每秒大约一次挥拳的念头；真正出不出手还要看旁边有没有人（`attack` 里判定）。
    // 原来这里是每秒九次，机器人于是变成了一台永动的打桩机。
    if (rival && random(w, 0, 1) < (0.6 + b.aggro * 0.4) * dt * 1.5) act |= 1;
  }
  // 大运当前：老兵会赌一脚，休闲的会躲。
  const truck = dayunAhead(w, r, 34);
  if (truck) {
    const brave = b.skill > 0.9 ? 0.55 : b.skill > 0.8 ? 0.26 : 0.07;
    const aligned = Math.abs(truck.x - r.x) < 3.2;
    if (aligned && r.attackCd <= 0 && random(w, 0, 1) < brave * dt * 20) act |= 1;
    else if (Math.abs(truck.x - r.x) < 6) {
      b.lane = truck.x > 0 ? -w.track.halfWidth * 0.45 : w.track.halfWidth * 0.45;
    }
  }

  const nos = r.nitroCd <= 0 && !threat && r.v > spec.vmax * 0.72 && random(w, 0, 1) < 2.4 * dt;
  return { th, br, st, act, nos };
}

/**
 * 前方最紧迫的威胁：返回它、以及"还有几秒撞上"（`tti`）。
 *
 * 用**时间**而不是距离来排序，是因为对向来车的相对速度是同向车的三倍——同样
 * 30 米，同向车给你一秒多，对向车只给半秒。第一版用距离排序，机器人于是永远
 * 先躲慢车、再挨对向车。
 */
function threatAhead(w, r, horizon) {
  let best = null;
  const consider = (x, closing, dz, half) => {
    if (closing <= 1 || dz < -1) return;
    const tti = dz / closing;
    if (tti > horizon) return;
    const dx = x - r.x;
    if (Math.abs(dx) > half + 1.1) return;
    if (!best || tti < best.tti) best = { tti, x, dx, dz };
  };
  for (const v of w.traffic) {
    if (v.state !== "run") continue;
    consider(v.x, v.dir === 1 ? r.v - v.v : r.v + v.v, v.z - r.z, VEHICLES[v.kind].wid * 0.5);
  }
  for (const o of w.racers) {
    if (o === r || o.state === "wreck") continue;
    consider(o.x, r.v - o.v, o.z - r.z, 0.9);
  }
  return best;
}

/**
 * 挑一个横向位置：**把接下来的两秒内会撞上的东西全标成禁区，然后找最大的缝**。
 *
 * 这是机器人"看起来会骑车"的关键，也是它和第一版最大的差别。第一版的写法是
 * "谁挡在正前方就往旁边挪一点"——它只在**已经对准**的时候才反应，而路上的车
 * 会随着弯道、离心力和自己的车道偏好不断改变相对位置，于是 13 个机器人一场
 * 比赛平均追尾 17 次。
 *
 * 现在改成"先把危险区画出来，再挑落点"：候选点从路左扫到路右，每个点算
 * 它离最近禁区的距离，再减去"离我当前位置有多远"的代价（能不折腾就不折腾）。
 * 于是超车变成**提前并线**，而不是贴身闪避——这正是真人在这条路上干的事。
 */
function pickGap(w, r, horizon, b) {
  const blocks = [];
  const add = (x, half, dz, closing) => {
    if (closing <= 1 || dz < -1) return;
    if (dz / closing > horizon) return;
    blocks.push([x - half - 0.55, x + half + 0.55]);
  };
  for (const v of w.traffic) {
    if (v.state !== "run") continue;
    const info = VEHICLES[v.kind];
    add(v.x, info.wid * 0.5, v.z - r.z, v.dir === 1 ? r.v - v.v : r.v + v.v);
  }
  for (const o of w.racers) {
    if (o === r || o.state === "wreck") continue;
    add(o.x, 0.85, o.z - r.z, r.v - o.v);
  }
  return bestOf(w, r, blocks, b);
}

function bestOf(w, r, blocks, b) {
  const lim = w.track.halfWidth - 0.7;
  const home = clamp(b.lane + Math.sin(b.jitter) * 0.4, -lim, lim);
  let best = home, bestScore = -Infinity;
  for (let x = -lim; x <= lim + 1e-6; x += SCAN_STEP) {
    let room = 99;
    for (const [lo, hi] of blocks) {
      if (x > lo && x < hi) { room = -1; break; }
      room = Math.min(room, x < lo ? lo - x : x - hi);
    }
    if (room < 0) continue;
    // 加分项：离禁区远、离自己近、离偏好位置近。权重是调出来的，别乱动：
    // "离自己近"的权重最高，否则机器人会为了三米的安全距离横着穿两条车道，
    // 看起来像个疯子。
    const score = Math.min(room, 2.6) * 1.6
      - Math.abs(x - r.x) * 0.55
      - Math.abs(x - home) * 0.22;
    if (score > bestScore) { bestScore = score; best = x; }
  }
  return best;
}

/** 该往哪边躲：-1/0/1。留作测试与"没有空隙时"的兜底。 */
function chooseSide(w, r, threat) {
  if (!threat) return 0;
  if (Math.abs(threat.dx) > 1.2) return 0;
  const prefer = threat.dx >= 0 ? -1 : 1;
  const room = w.track.halfWidth - Math.abs(r.x);
  if (room < 1.4 && Math.sign(r.x) === prefer) return -prefer * 0.6;
  return prefer;
}

function nearestRival(w, r, range) {
  for (const o of w.racers) {
    if (o === r || o.state === "wreck") continue;
    const dz = o.z - r.z;
    if (dz < -2.4 || dz > range) continue;
    if (Math.abs(o.x - r.x) > 1.75) continue;
    return o;
  }
  return null;
}

function dayunAhead(w, r, range) {
  for (const v of w.traffic) {
    if (v.kind !== "dayun" || v.state !== "run") continue;
    const dz = v.z - r.z;
    if (dz > 0 && dz < range) return v;
  }
  return null;
}

/** 供测试用：把"前方有什么"和"躲哪边"单独暴露出来（它们是最容易写反的一段）。 */
export const lookaheadOf = threatAhead;
export const sideOf = chooseSide;
