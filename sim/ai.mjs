/**
 * 机器人车手。目标不是"打得准"，而是**看起来像个真人**：
 * 会超车、会卡位、会跟你并排互踹，也会在弯道里被离心力推出去。
 *
 * 每个机器人有一点自己的性格（`r.brain`）：偏好车道、反应距离、冒险程度。
 * 这些数由世界种子派生，所以同一颗种子跑出来的 13 个机器人脾气是一样的。
 *
 * 难度从两个地方下手，而不是改物理：**油门上限**（休闲的对手不舍得拧到底）
 * 与**犹豫时间**（该躲的时候晚半拍）。改物理会让"同样的车同样的弯"结果不同，
 * 那是作弊；收着开才是"人"。
 */

import { clamp } from "./constants.mjs";
import { VEHICLES } from "./traffic.mjs";
import { specOf, TUNE } from "./racer.mjs";
import { random } from "./rng.mjs";

export function makeBrain(w, r) {
  const spec = specOf(r);
  return {
    lane: random(w, -w.track.halfWidth * 0.75, w.track.halfWidth * 0.75),
    react: random(w, 0.85, 1.35),
    aggro: random(w, 0.35, 1),
    caution: random(w, 0.75, 1.25),
    jitter: random(w, 0, 6.28),
    think: 0,
    target: 0,
    skill: r.skill,
    // 每个机器人对"自己这台车"的油门上限略作保留，队形才会自然拉开。
    throttleCap: clamp(r.skill * random(w, 0.92, 1.0), 0.6, 1),
    spec,
  };
}

/** 一帧的机器人入力。返回的字段和人类命令完全一样。 */
export function aiInput(w, r, dt) {
  const b = r.brain || (r.brain = makeBrain(w, r));
  b.think -= dt;
  if (b.think <= 0) {
    b.think = 0.18 + random(w, 0, 0.22);
    b.jitter += 0.7;
  }

  const spec = specOf(r);
  const look = Math.max(26, r.v * 1.5 * b.react * b.caution);
  const dodge = chooseSide(w, r, look);
  // 目标横向位置 = 自己的偏好车道 + 避让；两边夹起来才算"我要去哪儿"。
  const want = clamp(b.lane + dodge + Math.sin(b.jitter) * 0.5,
    -w.track.halfWidth + 0.8, w.track.halfWidth - 0.8);
  const dx = want - r.x;
  const st = Math.abs(dx) < 0.35 ? 0 : Math.sign(dx);

  const cap = spec.vmax * b.throttleCap * (1 - 0.03 * Math.abs(st));
  let th = r.v < cap ? 1 : 0;
  let br = 0;
  // 正前方贴着一辆车（而且横向躲不掉了）才刹车——刹车是最后的体面。
  const wall = nearestBlock(w, r, 1.2, look * 0.42);
  if (wall && Math.abs(wall.x - r.x) < 1.15) {
    const gap = wall.z - r.z;
    if (gap < 9 + r.v * 0.22) { br = 1; th = 0; }
  }

  let act = 0;
  const rival = nearestRival(w, r, 3.6);
  if (r.attackCd <= 0 && r.stamina > 42 && rival) {
    const eager = 0.6 + b.aggro * 0.4;
    if (random(w, 0, 1) < eager * dt * 9) act |= 1;
  }
  // 大运当前：老兵会赌一脚，休闲的会躲。
  const truck = truckAhead(w, r, 26);
  if (truck && r.attackCd <= 0) {
    const brave = b.skill > 0.9 ? 0.5 : b.skill > 0.8 ? 0.22 : 0.06;
    if (Math.abs(truck.x - r.x) < 3.2 && random(w, 0, 1) < brave) act |= 1;
    else if (Math.abs(truck.x - r.x) < 6) b.lane = truck.x > 0 ? -w.track.halfWidth * 0.5 : w.track.halfWidth * 0.5;
  }

  const nos = r.nitroCd <= 0 && !wall && r.v > spec.vmax * 0.7 && random(w, 0, 1) < 0.35;
  return { th, br, st, act, nos, brain: b };
}

/**
 * 该往哪边躲。返回 -1/0/1，量的是"横向偏移方向"。
 *
 * 判据只有一条：**把前方 30% 的车道宽度让出来**。谁挡在正前方，就往另一边挪；
 * 两边都挡着（车流很密的时候）就挑空隙大的那一边。
 */
function chooseSide(w, r, look) {
  const front = nearestBlock(w, r, 1.1, look);
  if (!front) return 0;
  const dx = front.x - r.x;
  const room = w.track.halfWidth - Math.abs(r.x);
  if (Math.abs(dx) > 1.2) return 0;
  // 往空间大的那一边闪；贴到边上了就只能认命。
  const prefer = dx >= 0 ? -1 : 1;
  if (room < 1.2) return -prefer * 0.6;
  return prefer;
}

/** 前方最近的障碍（车流或对手）。`halfZ` 是判定深度，`look` 是看的距离。 */
function nearestBlock(w, r, halfZ, look) {
  let best = null, bestDz = look;
  for (const v of w.traffic) {
    if (v.state !== "run") continue;
    if (v.dir === -1) continue;                     // 对向车由 chooseSide 之外的逻辑躲
    const dz = v.z - r.z;
    if (dz < -1 || dz > bestDz) continue;
    if (Math.abs(v.x - r.x) > VEHICLES[v.kind].wid * 0.5 + halfZ) continue;
    best = v; bestDz = dz;
  }
  for (const o of w.racers) {
    if (o === r) continue;
    const dz = o.z - r.z;
    if (dz < -1 || dz > bestDz || Math.abs(o.x - r.x) > halfZ + 0.5) continue;
    best = o; bestDz = dz;
  }
  return best;
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

function truckAhead(w, r, range) {
  for (const v of w.traffic) {
    if (v.kind !== "dayun" || v.state !== "run") continue;
    const dz = v.z - r.z;
    if (dz > 0 && dz < range) return v;
  }
  return null;
}

/** 供测试用：把"该不该刹车"这一条单独暴露出来（它是最容易写反的一段）。 */
export const lookaheadOf = nearestBlock;
export const steerSpeed = TUNE.steerSpeed;
