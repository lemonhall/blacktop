/**
 * 赛道：由种子编译出来的一串**纯函数**。
 *
 * 没有数组、没有状态、没有累积误差——两个宿主（DO 与浏览器）用同一颗种子算出来的
 * 曲率、坡度和路边道具逐位一致，所以路边那棵树的位置在两边是一样的。
 *
 * 这就是伪 3D 赛道的全部秘密：路本身永远是直的，**弯的是视线**。`curveAt(z)` 给的是
 * 曲率 κ（1/米），渲染层把 κ 沿视线积两次得到"这条路看起来往哪儿拐"，物理层则直接用
 * `v²κ` 算出"车被离心力推向哪边"——同一份数据，两种用法。
 */

import { LANE_W, SHOULDER_W, TAU } from "./constants.mjs";
import { hash2 } from "./rng.mjs";
import { MODES } from "./data.mjs";

/** 路边道具的默认间距（米）。同一个槽位长什么东西由 (种子, 槽位号) 决定。 */
const PROP_STEP = 26;

/**
 * 权重表 → 前缀和。**一次算好，用几百次**：`propsBetween` 每帧要取几十个道具，
 * 每个道具都去累加一遍权重是白花的；而这张表在一局里根本不会变。
 */
function prefix(table) {
  const kinds = Object.keys(table);
  const acc = [];
  let sum = 0;
  for (const k of kinds) { sum += table[k]; acc.push([sum, k]); }
  return { total: sum, acc };
}

/** 按前缀和抽一个 kind：`r` 是 [0,1) 的随机数，越小越靠前。 */
function pickPrefix(p, r) {
  const target = r * p.total;
  for (const [upto, kind] of p.acc) if (target < upto) return kind;
  return p.acc[p.acc.length - 1][1];
}

export function createTrack({ seed = 1, mode = "city" } = {}) {
  const cfg = MODES[mode] || MODES.city;
  // 四个相位分别给：两个曲率分量、两个坡度分量。相位由种子决定，形状就每局不同。
  const ph = [0, 1, 2, 3].map(i => hash2(seed, i + 1) * TAU);
  const halfWidth = cfg.lanes * LANE_W / 2;
  const hillL = cfg.lanes === 2 ? 260 : 340;
  const propStep = cfg.propStep || PROP_STEP;
  const scenery = prefix(cfg.scenery || { tree: 1 });
  return {
    seed, mode, lanes: cfg.lanes, length: cfg.length,
    halfWidth, shoulder: SHOULDER_W,
    /** 整条路（含两侧路肩）的横向半宽——车的 |x| 不会超过它。 */
    limitX: halfWidth + SHOULDER_W - 0.6,
    sky: cfg.sky, ground: cfg.ground, trafficMs: cfg.trafficMs, dayunMs: cfg.dayunMs,
    // 车流：两张权重表 + "对向来车占多少" + 同屏上限。`traffic.mjs` 直接读它们，
    // 所以"这条路上跑什么车"和"这条路上有几台车"都是这张表的事。
    same: cfg.same || { car: 1 }, oncom: cfg.oncom || { oncom: 1 },
    oncomingShare: cfg.oncomingShare === undefined ? 0.34 : cfg.oncomingShare,
    maxTraffic: cfg.maxTraffic || 9,
    /** 路边道具的权重表（原样带出来，测试要按它验"这条路上长得出什么"）。 */
    sceneryKinds: Object.keys(cfg.scenery || { tree: 1 }),
    propStep,

    /** 曲率 κ(z)，单位 1/米。正数往左拐。 */
    curveAt: z => cfg.curveA * Math.sin(z / 240 + ph[0]) + cfg.curveB * Math.sin(z / 720 + ph[1]),
    /** 路面高程（米）。只影响画面起伏，不影响速度。 */
    hillAt: z => cfg.hillA * Math.sin(z / hillL + ph[2]) + cfg.hillB * Math.sin(z / (hillL * 0.42) + ph[3]),
    /** 第 i 条车道的中心线（从最左算起，0 是最左那条）。 */
    laneX: i => (i - (cfg.lanes - 1) / 2) * LANE_W,
    /** 右侧车道（和我们同向）的索引区间；左侧的就是对向。靠右行驶。 */
    sameLanes: [Math.ceil(cfg.lanes / 2), cfg.lanes - 1],

    /**
     * 这一横向位置算什么路面。速度惩罚由调用方决定：路肩是"还能跑但不划算"，
     * 路外（土/草）压根不让去——`limitX` 已经把它夹住了。
     */
    surfaceAt: x => (Math.abs(x) <= halfWidth + 0.35 ? "road" : "shoulder"),

    /**
     * 视野里 [z0, z1] 这一段的路边道具。**无状态**：随时算随时丢，
     * 所以不需要"谁先加载谁后加载"的同步，也不用为它存一份世界状态。
     */
    propsBetween(z0, z1) {
      const out = [];
      const first = Math.max(0, Math.floor(z0 / propStep));
      const last = Math.max(0, Math.floor(z1 / propStep));
      for (let i = first; i <= last; i++) {
        const r = hash2(seed + 11, i);
        const z = i * propStep + hash2(seed + 17, i) * propStep * 0.7;
        if (z < z0 || z > z1) continue;
        const side = hash2(seed + 23, i) < 0.5 ? -1 : 1;
        const gap = 2.2 + hash2(seed + 29, i) * 9;
        out.push({
          i, z, side,
          x: side * (halfWidth + SHOULDER_W + gap),
          kind: pickPrefix(scenery, hash2(seed + 31, i)),
          s: 0.78 + hash2(seed + 37, i) * 0.5,
        });
      }
      return out;
    },
  };
}

/** 起点/终点线所在的 z。起点是 0，终点是赛道长度。 */
export const FINISH_Z = track => track.length;

/**
 * 发车格：15 台车不要挤成一坨，三列一排、一排一排往后错。
 * 前两排给真人（谁先举手谁靠前，房主拿最前排中间），机器人排在后面。
 */
export function gridSlot(track, index) {
  const col = index % 3;
  const row = Math.floor(index / 3);
  const spread = track.halfWidth - 1.1;
  return { x: col === 0 ? -spread : col === 1 ? 0 : spread, z: -(row * 2.7) - 0.5 };
}

export const laneCenter = (track, i) => track.laneX(i % track.lanes);
