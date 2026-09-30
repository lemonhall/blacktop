/**
 * 赛道：由种子编译出来的一串**纯函数**。
 *
 * 没有状态、没有累积误差——两个宿主（DO 与浏览器）用同一颗种子算出来的曲率、坡度
 * 和路边道具逐位一致，所以路边那棵树的位置在两边是一样的。
 *
 * 唯一一张表是**路边道具的槽位表**（`createTrack` 里扫一遍算完，见 `minGapOf`）。
 * 它是纯数据、由种子决定、两边算出来一样，只是"算一次存着"比"每帧回头猜"便宜：
 * "同一种道具不许挤在一起"这条规则要求从前往后扫，扫不了中间一段。
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
 * 一圈跑完就结束太短了——一局默认**三圈**。想在 `MODES` 里给某条赛道单独改，
 * 写一个 `laps` 就盖掉了。
 */
const DEFAULT_LAPS = 3;

/**
 * 权重表 → 前缀和。**一次算好，用几百次**：`propsBetween` 每帧要取几十个道具，
 * 每个道具都去累加一遍权重是白花的；而这张表在一局里根本不会变。
 *
 * `blocked` 是**这一槽先别来**的那几种（刚长过、还没到该再出现的时候）。剔剩下的
 * 表如果空了（整张 scenery 都给挡上了），返回 `null`，调用方就退回原表——宁可
 * 重复，也不能让路边空一片。
 */
function prefix(table, blocked) {
  const acc = [];
  let sum = 0;
  for (const k of Object.keys(table)) {
    if (blocked && blocked.has(k)) continue;
    sum += table[k];
    acc.push([sum, k]);
  }
  return acc.length ? { total: sum, acc } : null;
}

/** 按前缀和抽一个 kind：`r` 是 [0,1) 的随机数，越小越靠前。 */
function pickPrefix(p, r) {
  const target = r * p.total;
  for (const [upto, kind] of p.acc) if (target < upto) return kind;
  return p.acc[p.acc.length - 1][1];
}

/**
 * 一件道具的**最小间距**（单位：槽位），由它的稀有程度算出来。
 *
 * 每槽独立摇号有一个副作用：稀有道具会成簇出现。实测两百颗种子里有六颗会在荒野
 * 的一屏之内摆出三到四座同款井架——概率上没错，看起来像贴图复制粘贴。
 *
 * 所以拿"平均间隔"（权重越小、间隔越长）的一半当硬下限：一半这个数很讲究——它远
 * 低于均值，所以**常见的道具几乎不受影响**（树还是一棵接一棵），只削掉随机分布的
 * 长尾。稀有的更孤立、常见的照旧成排，这正是真实路边的样子：树排成行，水塔一座
 * 在几公里外。
 *
 * 上下限都是试出来的：下限 2 挡不住成对出现；上限 28 是为了彩蛋——一条路一件的
 * 那种，权重只有 0.18，算出来的间隔比整条路还长，那就等于一条路上只有一件了。
 */
function minGapOf(table, total, kind) {
  const mean = total / (table[kind] || 1);
  return Math.max(2, Math.min(28, Math.round(mean * 0.5)));
}

export function createTrack({ seed = 1, mode = "city" } = {}) {
  const cfg = MODES[mode] || MODES.city;
  // `length` 是**一圈**的长度；一场比赛跑 `laps` 圈，终点在 `totalLength`。
  const length = cfg.length;
  const laps = Math.max(1, Math.round(cfg.laps || DEFAULT_LAPS));
  // 四个相位分别给：两个曲率分量、两个坡度分量。相位由种子决定，形状就每局不同。
  const ph = [0, 1, 2, 3].map(i => hash2(seed, i + 1) * TAU);
  const halfWidth = cfg.lanes * LANE_W / 2;
  const hillL = cfg.lanes === 2 ? 260 : 340;
  const propStep = cfg.propStep || PROP_STEP;
  /*
   * **一条圈，得能接上自己。**
   *
   * 弯和坡本来是一对正弦，波长按"多少米一个周期"给（`z / 240` 那种写法）。现在把
   * 每条正弦的波长掐成一圈长度的整数分之一（N = 一圈长度 ÷ 原周期，四舍五入），
   * 于是 `curveAt(0)` 与 `curveAt(length)` 严格相等、导数也相等——车开到圈末，
   * 路正好卷回起点，既没有接缝，也不用"过了终点线就换一条路"。
   *
   * 代价是波长最多偏个一两成（3600 米的城市环路上，240 那条从 1508 米变成 1800
   * 米）。同族的形状、略微舒展一点的弯，比一条接不上的路便宜得多。
   */
  const wave = radius => Math.max(1, Math.round(length / (radius * TAU)));
  const sceneryTable = cfg.scenery || { tree: 1 };
  const scenery = prefix(sceneryTable);
  const gaps = {};
  for (const k of Object.keys(sceneryTable)) gaps[k] = minGapOf(sceneryTable, scenery.total, k);
  // "把还没到点的几种从表里摘掉"的变体表：一整局里也就建出几十张，建一次用到底。
  const sceneryLess = new Map();
  /*
   * **全路的道具槽一次算完**。第 i 槽长什么不只跟 (种子, i) 有关，还跟"前面几槽
   * 长过什么"有关——所以必须从 0 往大扫一遍，不能随手挑中间一段现算。
   *
   * 这条"扫一遍"是所有"不许连着出现"规则的前提，也正因为要扫，它只能建一次。
   * 两百多个格子（最长 4600 米 ÷ 17 米）算一遍是微秒级的，比每帧回头猜便宜得多。
   * 表只盖**一圈**：第二圈的路边就是第一圈的复制（`propsBetween` 按圈取模），
   * 所以"过了终点之后路边秃掉"这件事压根不存在——那边是下一圈的起点。
   */
  const perLap = Math.max(1, Math.ceil(length / propStep));
  const slots = new Array(perLap);
  const lastAt = new Map();
  const blocked = new Set();
  for (let i = 0; i < slots.length; i++) {
    blocked.clear();
    for (const [k, at] of lastAt) if (i - at < gaps[k]) blocked.add(k);
    let kind = pickPrefix(scenery, hash2(seed + 31, i));
    if (blocked.has(kind)) {
      const key = [...blocked].sort().join(",");
      let alt = sceneryLess.get(key);
      if (alt === undefined) { alt = prefix(sceneryTable, blocked); sceneryLess.set(key, alt); }
      // `alt` 为 null 表示这一槽所有种类都被挡上了（整条路只有一两种道具时才会
      // 发生）：那就认了，重复好过路上空一段。
      if (alt) kind = pickPrefix(alt, hash2(seed + 43, i));
    }
    lastAt.set(kind, i);
    slots[i] = kind;
  }
  // 接缝也归"不许连着出现"管：最后一槽是水塔，第一槽不该又来一座；反过来，
  // 第一槽也不该和第二槽撞上。两头都得挡住——只挡一头就只是把冲突挪了个位置。
  if (perLap > 2) {
    const near = new Set([slots[perLap - 1], slots[1]]);
    const alt = near.has(slots[0]) ? prefix(sceneryTable, near) : null;
    if (alt) slots[0] = pickPrefix(alt, hash2(seed + 47, 0));
  }
  return {
    seed, mode, lanes: cfg.lanes, length, laps, totalLength: length * laps,
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

    /** 曲率 κ(z)，单位 1/米。正数往左拐。整圈周期，`z` 可以一直往大里走。 */
    curveAt: z => cfg.curveA * Math.sin(TAU * wave(240) * z / length + ph[0])
      + cfg.curveB * Math.sin(TAU * wave(720) * z / length + ph[1]),
    /** 路面高程（米）。只影响画面起伏，不影响速度。同样整圈周期。 */
    hillAt: z => cfg.hillA * Math.sin(TAU * wave(hillL) * z / length + ph[2])
      + cfg.hillB * Math.sin(TAU * wave(hillL * 0.42) * z / length + ph[3]),
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
      const last = Math.floor(z1 / propStep);
      for (let n = first; n <= last; n++) {
        // **槽号按一圈取模，位置照世界 z 走**：第二圈的路边和第一圈一模一样。
        const i = ((n % perLap) + perLap) % perLap;
        const r = hash2(seed + 11, i);
        const z = n * propStep + hash2(seed + 17, i) * propStep * 0.7;
        if (z < z0 || z > z1) continue;
        const side = hash2(seed + 23, i) < 0.5 ? -1 : 1;
        const gap = 2.2 + hash2(seed + 29, i) * 9;
        out.push({
          i: n, z, side,
          x: side * (halfWidth + SHOULDER_W + gap),
          kind: slots[i] || slots[slots.length - 1],
          s: 0.78 + hash2(seed + 37, i) * 0.5,
        });
      }
      return out;
    },
  };
}

/** 起点/终点线所在的 z。起点是 0，终点在**跑完所有圈**的地方。 */
export const FINISH_Z = track => track.totalLength;

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
