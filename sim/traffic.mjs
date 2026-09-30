/**
 * 车流：同向的慢车（用来超、顺便踹）、对向来车（用来躲、也用来踹），外加一辆**大运**。
 *
 * 三条设计约束：
 *   1. **确定性**：生成只吃 (种子, 生成序号)，不看玩家在哪。同一颗种子在两个宿主上
 *      生成出一模一样的车流，客户端才能拿它做本地预测的参照。
 *   2. **无状态生存**：车流不做"记忆"，过期就删（`cull`）。一次删干净比维护一张
 *      永远对不齐的表便宜得多。
 *   3. **大运是稀客**：它不在普通车流里按概率抽，而是自己一条节拍（`dayunMs`）。
 *      要是按概率来，"今天路上没见到大运"会变成常态，那这个梗就不成立了。
 *
 * 车型表里除了碰撞用的长宽质量，还多了三个"踹起来什么样"的数：`cash` 赏金、
 * `fly` 起飞系数（轻车飞得远、半挂只抬个头）、`boom` 爆炸的大小。**这些东西
 * 写在数据里而不是写在代码里**，因为"这台车踹上去爽不爽"是调平衡，不是逻辑。
 */

import { clamp } from "./constants.mjs";
import { random, randInt } from "./rng.mjs";
import { TUNE } from "./spec.mjs";
import { carPose, racerPose } from "./history.mjs";

/**
 * 车辆尺寸与车速（米）。`len` 是车长，碰撞判定用的就是它。
 *
 * `side` 决定它走哪边：`"same"` 同向（看到车尾），`"oncom"` 对向（迎面看到车头）。
 * 这个字段同时喂三处：生成的占比、渲染的朝向、以及"迎面撞上更疼"的判定——
 * 一份关于方向的事实写在三个地方，迟早会写成互相矛盾。
 */
export const VEHICLES = {
  // ---------------------------------------------------------------- 同向
  car: { len: 4.6, wid: 1.9, vmin: 17, vmax: 26, mass: 1.0, side: "same", cash: 400, fly: 1.15, boom: 0.8 },
  van: { len: 5.6, wid: 2.1, vmin: 15, vmax: 23, mass: 1.2, side: "same", cash: 500, fly: 0.95, boom: 0.9 },
  pickup: { len: 5.4, wid: 2.0, vmin: 15, vmax: 24, mass: 1.3, side: "same", cash: 500, fly: 1.0, boom: 0.9 },
  truck: { len: 9.0, wid: 2.5, vmin: 13, vmax: 20, mass: 2.0, side: "same", cash: 900, fly: 0.72, boom: 1.2 },
  bus: { len: 11.5, wid: 2.6, vmin: 12, vmax: 19, mass: 2.6, side: "same", cash: 1100, fly: 0.6, boom: 1.3 },
  tanker: { len: 9.6, wid: 2.5, vmin: 13, vmax: 20, mass: 2.4, side: "same", cash: 1200, fly: 0.66, boom: 1.7 },
  mixer: { len: 8.4, wid: 2.6, vmin: 12, vmax: 18, mass: 2.6, side: "same", cash: 1000, fly: 0.62, boom: 1.3 },
  container: { len: 13.5, wid: 2.9, vmin: 13, vmax: 21, mass: 3.2, side: "same", cash: 1000, fly: 0.55, boom: 1.2 },
  tractor: { len: 4.4, wid: 2.4, vmin: 6, vmax: 11, mass: 1.8, side: "same", cash: 600, fly: 0.85, boom: 0.9 },
  trike: { len: 3.0, wid: 1.3, vmin: 10, vmax: 16, mass: 0.5, side: "same", cash: 250, fly: 1.35, boom: 0.6 },
  // ---------------------------------------------------------------- 对向
  oncom: { len: 4.4, wid: 1.9, vmin: 16, vmax: 25, mass: 1.0, side: "oncom", cash: 450, fly: 1.15, boom: 0.8 },
  police: { len: 4.8, wid: 2.0, vmin: 24, vmax: 34, mass: 1.1, side: "oncom", cash: 700, fly: 1.0, boom: 1.0 },
  // 对面来的大运重卡：这条路的主角，唯一一台"踹飞了值得截图"的东西。
  dayun: { len: 16.5, wid: 3.1, vmin: 24, vmax: 29, mass: 6.0, side: "oncom", cash: 1500, fly: 0.5, boom: 1.9 },
};

/** 碰撞表里的每一个 kind 都是可以被一脚踹飞的社会车辆。**车手不算**（见 `racer.mjs`）。 */
export const kickable = kind => Object.hasOwn(VEHICLES, kind);

/** 重力（米/秒²）。比现实大一点，落地快、看着脆。 */
const GRAVITY = 22;

/**
 * 同屏车流上限。默认值是被**撞车率**反推出来的：一台车在视野里活多久，约等于
 * "窗口长度 ÷ 相对速度"。对向车相对速度是 70 m/s 量级，850 米的窗口只留得住
 * 十几秒，所以上限给 8~9 台就足够让路上一直有东西，又不会让 15 台摩托挤成碰碰车。
 * 每条赛道可以在 `maps.mjs` 里盖掉它（工业支线和夜市更挤）。
 */
const MAX_TRAFFIC = 9;
const BEHIND_CULL = 70;
const AHEAD_CULL = 780;

/**
 * 按权重抽一个 kind。权重表来自赛道（`track.same` / `track.oncom`），
 * 抽签只用 `random(w, 0, 1)` 这一颗数——**顺序即优先级**，所以两张表的键序
 * 在两个宿主上必须一致（同一个字面量对象，天然一致）。
 */
export function pickKind(table, r) {
  const kinds = Object.keys(table || {});
  if (!kinds.length) return "car";
  let total = 0;
  for (const k of kinds) total += table[k];
  let acc = 0;
  const target = r * total;
  for (const k of kinds) {
    acc += table[k];
    if (target < acc) return k;
  }
  return kinds[kinds.length - 1];
}

/**
 * 到点就生成一辆。生成位置挂在**领跑者**前面而不是每个玩家前面——车流是世界的
 * 一部分，不是"给我的私人障碍"。同一个房间里所有人看到的是同一批车。
 */
export function spawnTraffic(w, leadZ, force = null) {
  const cap = w.track.maxTraffic || MAX_TRAFFIC;
  if (w.traffic.length >= cap) return null;
  // 先定方向、再定车型：两种车的玩法完全不同（一个躲、一个超），方向不该是
  // 随机数的一部分。对向来车占比写在赛道表里——密了路上就只剩"躲"，没有超车。
  const share = w.track.oncomingShare === undefined ? 0.34 : w.track.oncomingShare;
  const forced = force ? VEHICLES[force] : null;
  const oncoming = forced ? forced.side === "oncom" : random(w, 0, 1) < share;
  const table = oncoming ? w.track.oncom : w.track.same;
  const kind = force || pickKind(table, random(w, 0, 1));
  const info = VEHICLES[kind] || VEHICLES.car;
  const lanes = oncoming
    ? [0, Math.max(0, w.track.sameLanes[0] - 1)]
    : [w.track.sameLanes[0], w.track.lanes - 1];
  const lane = lanes[0] + randInt(w, Math.max(1, lanes[1] - lanes[0] + 1));
  // 大车留的距离也长：一台 13 米的半挂出现在 100 米外，等于没有反应时间。
  const room = 1 + info.len / 8;
  const gap = oncoming
    ? (300 + random(w, 0, 160)) * room
    : (180 + random(w, 0, 110)) * room;
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

/**
 * 推进所有车。被踹飞的走一条抛物线 + 落地后的滑行，不再参与碰撞判定。
 *
 * 两个阶段写成一个 `t`：**起飞**（y > 0）→ **落地**（推一条 `boom` 事件，表现层
 * 在这一点炸开）→ **烧着滑行**（几秒后从世界里消失）。用时间分阶段而不是用三个
 * 状态变量，是因为"它现在在哪一段"完全由 `t` 与 `y` 决定，多存一份就多一份能对不上的。
 */
export function stepTraffic(w, dt) {
  for (const v of w.traffic) {
    v.t += dt;
    if (v.state === "flung") {
      const f = v.fly || 1;
      // 被踹瘪的进度：起飞那一刻就有一道口子（0.15），飞的过程里一路长到 1。
      // 它跟着快照发出去，所以两台机器上这台车瘪得一模一样。
      v.dmg = Math.min(1, (v.dmg || 0.15) + dt * 1.5);
      v.z += v.dir * v.v * dt * 0.95;
      v.x += v.drift * dt;
      if (v.y > 0 || v.vy > 0) {
        v.vy -= GRAVITY * dt;
        v.y = (v.y || 0) + v.vy * dt;
        v.spin += dt * 3.4 * (1.5 - f * 0.5);
        if (v.y <= 0) {
          v.y = 0;
          v.vy = 0;
          v.landedAt = v.t;
          w.events.push({ k: "boom", z: v.z, x: v.x, kind: v.kind, b: v.boom || 1 });
        }
      } else {
        // 落地之后：摩擦把速度啃掉，车身还在慢慢转，火还在烧。
        v.v *= 1 - Math.min(0.9, dt * 1.6);
        v.drift *= 1 - Math.min(0.9, dt * 1.4);
        v.spin += dt * 1.2 * (v.spin > 0 ? 1 : -1);
      }
      const burned = (v.landedAt || 0) > 0 && v.t - v.landedAt > 1.4 + f * 1.2;
      if (burned || v.t > 6) v.dead = true;
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
    // 飞出去的车不受"视野窗口"管——它可能被踹出几百米，那一整段抛物线要看得见。
    if (v.state !== "flung" && (v.z < backZ - BEHIND_CULL || v.z > leadZ + AHEAD_CULL)) continue;
    keep.push(v);
  }
  if (keep.length !== w.traffic.length) w.traffic = keep;
}

/**
 * 一脚踹飞一台社会车辆。**所有社会车辆都能踹**——重卡只是飞得矮一点。
 *
 * 起飞系数来自车型表：三轮车能被踹到天上去，半挂只抬个头；油罐车的爆炸最大。
 * 横向推力来自踹的人在哪一侧，所以"从左边踹"和"从右边踹"飞出去的方向不一样。
 */
export function fling(w, v, dirX) {
  if (v.state === "flung") return false;
  const info = VEHICLES[v.kind] || VEHICLES.car;
  const f = info.fly;
  v.state = "flung";
  v.t = 0;
  v.dmg = 0.15;
  v.fly = f;
  v.boom = info.boom;
  v.cash = info.cash;
  v.vy = 12 * f;
  v.y = 0.4;
  v.drift = clamp(dirX, -1, 1) * 11 * f + 5 * f;
  v.spin = 0;
  return true;
}

/**
 * 找出"正前方够得着、可以踹"的那辆车。
 *
 * 对向来车和同向慢车**都算**：迎面来的踹起来最爽，而追上一个慢慢晃的公交车、
 * 从旁边一脚把它蹬出去，是这个游戏另一半的乐趣。
 *
 * **判据量的是"到车面的距离"，不是"到车中心的距离"。** 这一条是线上手感换来的：
 * 原来按车的**原点**（车身中心）算 13 米，于是一台 16.5 米的半挂，玩家真正能按的
 * 机会只有 65 毫秒——车身越长、越踢不着，与"一脚踹飞大运"的卖点正好相反。改成
 * 量到近侧车面之后，每台车的窗口宽度只由"相对速度"决定，不再由车长决定。
 *
 * `pose` 是玩家出手那一刻的世界位姿（见 `history.mjs`）。有它就用它——"我看见它
 * 就在眼前"和"服务端算的时候它已经贴脸了"之间差着十几米，对向车尤其明显。
 */
export function kickTarget(w, r, pose = null) {
  const me = racerPose(pose, r);
  let best = null, bestGap = Infinity;
  for (const v of w.traffic) {
    if (v.state !== "run" || !kickable(v.kind)) continue;
    const p = carPose(pose, v);
    // 近侧车面：对向车迎着你的是车头，同向车对着你的是车尾——两种都是 `z - len/2`，
    // 因为你永远从 z 更大的一侧靠近它。
    const gap = p.z - VEHICLES[v.kind].len / 2 - me.z;
    const reach = v.dir === -1 ? TUNE.kickReach : TUNE.kickReach * TUNE.kickSame;
    // 下界允许一点重叠：两台东西都在动，车面"刚好擦过"的那一格不该被判成够不着。
    if (gap > reach || gap < -TUNE.kickOverlap) continue;
    if (Math.abs(p.x - me.x) > TUNE.kickX) continue;
    if (gap < bestGap) { best = v; bestGap = gap; }
  }
  return best;
}
