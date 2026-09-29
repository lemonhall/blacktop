/**
 * 车流：同向的慢车（用来超）与对向来车（用来躲），外加一辆**大运**。
 *
 * 三条设计约束：
 *   1. **确定性**：生成只吃 (种子, 生成序号)，不看玩家在哪。同一颗种子在两个宿主上
 *      生成出一模一样的车流，客户端才能拿它做本地预测的参照。
 *   2. **无状态生存**：车流不做"记忆"，过期就删（`cull`）。一次删干净比维护一张
 *      永远对不齐的表便宜得多。
 *   3. **大运是稀客**：它不在普通车流里按概率抽，而是自己一条节拍（`dayunMs`）。
 *      要是按概率来，"今天路上没见到大运"会变成常态，那这个梗就不成立了。
 */

import { clamp } from "./constants.mjs";
import { random, randInt } from "./rng.mjs";

/** 车辆尺寸与车速（米）。`len` 是车长，碰撞判定用的就是它。 */
export const VEHICLES = {
  car: { len: 4.6, wid: 1.9, vmin: 17, vmax: 26, mass: 1.0 },
  van: { len: 5.6, wid: 2.1, vmin: 15, vmax: 23, mass: 1.2 },
  truck: { len: 9.0, wid: 2.5, vmin: 13, vmax: 20, mass: 2.0 },
  oncom: { len: 4.4, wid: 1.9, vmin: 16, vmax: 25, mass: 1.0 },
  // 对面来的大运重卡：又长又宽又快，唯一能被一脚踢飞的家伙。
  dayun: { len: 16.5, wid: 3.1, vmin: 24, vmax: 29, mass: 6.0 },
};

/** 能被踢飞的只有它。别的车撞上去就是一记摔车——这是这个梗的分量所在。 */
export const kickable = kind => kind === "dayun";

const MAX_TRAFFIC = 26;
const BEHIND_CULL = 70;
const AHEAD_CULL = 780;

/** 同向车流里抽车型：小轿车最多，货车偶尔。 */
function pickSame(w) {
  const r = random(w, 0, 1);
  return r < 0.72 ? "car" : r < 0.92 ? "van" : "truck";
}

/** 对向车流里抽车型：同样以小轿车为主，货车少一点。 */
function pickOncoming(w) {
  const r = random(w, 0, 1);
  return r < 0.80 ? "oncom" : "truck";
}

/**
 * 到点就生成一辆。生成位置挂在**领跑者**前面而不是每个玩家前面——车流是世界的
 * 一部分，不是"给我的私人障碍"。同一个房间里所有人看到的是同一批车。
 */
export function spawnTraffic(w, leadZ, force = null) {
  if (w.traffic.length >= MAX_TRAFFIC) return null;
  // 对向车流占左侧车道，同向车流占右侧——两种车的玩法完全不同（一个躲、一个超），
  // 所以方向不是随机数的一部分，而是先定方向、再定车型。
  const oncoming = force ? force === "dayun" || force === "oncom" : random(w, 0, 1) < 0.46;
  const kind = force || (oncoming ? pickOncoming(w) : pickSame(w));
  const info = VEHICLES[kind];
  const lanes = oncoming
    ? [0, w.track.sameLanes[0] - 1]
    : [w.track.sameLanes[0], w.track.lanes - 1];
  const lane = lanes[0] + randInt(w, lanes[1] - lanes[0] + 1);
  const gap = oncoming ? 330 + random(w, 0, 190) : 250 + random(w, 0, 150);
  const laneX = w.track.laneX(lane) + random(w, -0.35, 0.35);
  const vehicle = {
    id: w.nextEntity++,
    kind, x: laneX, z: leadZ + gap,
    v: random(w, info.vmin, info.vmax),
    dir: oncoming ? -1 : 1,
    state: "run", t: 0, spin: 0, vy: 0, lane,
  };
  w.traffic.push(vehicle);
  if (kind === "dayun") {
    w.events.push({ k: "dayun", i: vehicle.id, z: vehicle.z, x: vehicle.x });
  }
  return vehicle;
}

/** 推进所有车。被踢飞的那些只做抛物线，不再参与碰撞判定。 */
export function stepTraffic(w, dt) {
  for (const v of w.traffic) {
    v.t += dt;
    if (v.state === "flung") {
      v.z += v.dir * v.v * dt * 0.95;
      v.x += v.drift * dt;
      v.vy -= 22 * dt;
      v.y = (v.y || 0) + v.vy * dt;
      v.spin += dt * 3.4;
      if (v.t > 2.6) v.dead = true;
      continue;
    }
    v.z += v.dir * v.v * dt;
  }
  if (w.traffic.some(v => v.dead)) w.traffic = w.traffic.filter(v => !v.dead);
}

/** 清掉远远落在后面或者已经跑出视野的车。 */
export function cullTraffic(w, backZ, leadZ) {
  const keep = [];
  for (const v of w.traffic) {
    if (v.z < backZ - BEHIND_CULL || v.z > leadZ + AHEAD_CULL) continue;
    keep.push(v);
  }
  if (keep.length !== w.traffic.length) w.traffic = keep;
}

/** 一脚踢飞大运：它带着旋转飞出去，两秒半之后从世界里消失。 */
export function fling(w, v, dirX) {
  if (v.state === "flung") return false;
  v.state = "flung";
  v.t = 0;
  v.vy = 12;
  v.y = 0.4;
  v.drift = clamp(dirX, -1, 1) * 12 + 5;
  v.spin = 0;
  return true;
}

/** 找出"正在迎面冲过来、且已经进入出脚窗口"的那辆车。 */
export function kickTarget(w, r, reachZ = 13, reachX = 3.4) {
  let best = null, bestDz = Infinity;
  for (const v of w.traffic) {
    if (v.state !== "run" || v.dir !== -1 || !kickable(v.kind)) continue;
    const dz = v.z - r.z;
    if (dz < -2 || dz > reachZ) continue;
    if (Math.abs(v.x - r.x) > reachX) continue;
    if (dz < bestDz) { best = v; bestDz = dz; }
  }
  return best;
}
