/**
 * 本地预测：只预测**我自己**那台车。
 *
 * 为什么可以这么小：`stepRacer` 是纯函数——它只吃赛道、自己的车和一组入力，
 * 不碰随机源，所以浏览器与服务端算出的是同一条路径。车流、撞车、被人挤开、
 * 出拳打到谁，一概不预测：那些必须听权威端的，否则就会出现"我这边把他踹翻了、
 * 别人那边他还骑得好好的"。
 *
 * 对账（reconcile）是这个文件里唯一需要小心的地方，它的做法是**时间线对齐**：
 * 服务端在快照里回一个"第几条命令已经走完、那时你在哪、跑多快、侧滑多少"，
 * 我从那个状态出发，把还没被确认的命令重放一遍。正常情况下这次算出来的位置与
 * 本机预测**逐米相同**，于是画面上什么都不会发生——不再有"往前骑一段又被拽回一小段"。
 *
 * 速度与侧滑这两个自由度是赛车特有的：只要坐标的话，重放出来的是一条从那个点
 * 直线往前跑的假路径，一进弯就整条路都错了。
 */

import { DT, KMH } from "/sim/constants.mjs";
import { stepRacer } from "/sim/racer.mjs";
import { resetCmds } from "./cmd.mjs";

/**
 * 小于这个量级的差异**不是分歧，是浮点**。两端跑的是同一段代码，但入力被量化成
 * 1/16、每格位移又乘 dt，最后一位小数的舍入差会让"重放"比"本机预测"差出几毫米。
 * 这点误差如果也走平滑，就会被乘成反方向的抖动，眼睛看到的是"画面在往回走"。
 */
const EPS = 0.35;
/** 差距大到这个量级说明是"被撞飞/传送"这种整体挪动，直接认账，不平滑。 */
const RUNAWAY = 140;
const BLEND = 0.25;

export function initPredict(S, mine) {
  resetCmds();
  // 迷你世界：只要"够 stepRacer 跑起来"的那几样。车流与对手都是空数组，
  // 于是 `collideTraffic` 与 `bump` 自然成了空操作。
  S.predictW = { track: S.track, traffic: [], racers: [], events: [], time: 0, tick: 0, phase: "live" };
  S.predictMe = {
    id: -1, kind: "human", ownerId: "", name: "",
    bike: mine.bike, palette: mine.palette, skill: 1,
    x: mine.x, z: mine.z, v: mine.v, lat: mine.ackLat || 0, lean: 0, wobble: 0,
    stamina: mine.stamina, state: mine.state, wreck: mine.wreck, wreckKind: "",
    attackCd: 0, hitCd: 0, swing: 0, nitroT: 0, nitroCd: 0,
    lastHit: -99, downs: 0, dayuns: 0, crashes: 0, topV: mine.v, cash: 0,
    finished: false, finishTime: 0, rank: 0, kmh: mine.kmh,
  };
  S.predictW.racers = [S.predictMe];
}

/** 走一格。`punch` 只是让画面上的拳头立刻出去，判定仍然在服务端。 */
export function stepPredict(S, dt, controls, punch) {
  const me = S.predictMe, w = S.predictW;
  if (!me || !w) return null;
  stepRacer(w, me, dt, {
    th: controls.th, br: controls.br, st: controls.st, nos: controls.nos,
    act: punch ? 1 : 0,
  });
  return me;
}

/**
 * 权威快照回来了：把"服务端确认过的那个状态"接上"还没被确认的命令"，重放一遍。
 *
 * 只做三件事：
 *   1. 同步那些会影响位移的状态（车型、生死、氮气、侧滑）——预测必须和权威端
 *      用同一套参数，否则重放出来的路径天生就对不上；
 *   2. 丢掉已经被 ack 覆盖的命令，然后从确认点重放剩下的；
 *   3. 正常情况（误差≈0）什么都不改；真出现分歧时平滑收敛，不对玩家"啪"一下。
 */
export function reconcile(S, mine) {
  const me = S.predictMe, w = S.predictW;
  if (!me || !w || !mine) return;
  w.time = S.serverTime;

  me.bike = mine.bike;
  me.state = mine.state;
  me.wreck = mine.wreck;
  me.stamina = mine.stamina;
  me.nitroT = mine.nitro ? Math.max(me.nitroT, 0) : 0;
  me.nitroCd = mine.nitroCd === undefined ? me.nitroCd : mine.nitroCd;
  // 摔在地上的人不能自己爬起来接着骑：位置跟着权威端走，等它把车扶正。
  if (mine.state === "wreck") {
    S.cmds.length = 0;
    me.x = mine.x; me.z = mine.z; me.v = mine.v;
    me.lat = 0; me.lean = 0;
    return;
  }
  if (!Number.isFinite(mine.ackV)) return legacy(mine, me);

  const ack = mine.ack | 0;
  const pending = S.cmds.filter(cmd => cmd.sq > ack);
  if (pending.length !== S.cmds.length) S.cmds = pending;

  const fromX = me.x, fromZ = me.z;
  me.x = mine.ackX; me.z = mine.ackZ;
  me.v = mine.ackV; me.lat = mine.ackLat || 0;
  for (const cmd of S.cmds) replay(w, me, cmd);

  const error = Math.hypot(me.x - fromX, me.z - fromZ);
  if (error > EPS && error <= RUNAWAY) {
    me.x = fromX + (me.x - fromX) * BLEND;
    me.z = fromZ + (me.z - fromZ) * BLEND;
  }
}

/**
 * 重放一条命令。
 *
 * `act` 一律按 0 传：服务端在命令的第一格就把这一票消费掉了，出拳本身不影响
 * 位移，重放里再打一次只会把体力扣两遍。
 */
function replay(w, me, cmd) {
  const input = { th: cmd.th, br: cmd.br, st: cmd.st, nos: cmd.nos ? 1 : 0, act: 0 };
  for (let i = 0; i < cmd.n; i++) stepRacer(w, me, DT, input);
}

/**
 * 老服务端（快照里没有确认速度）的退路：只能拿"现在的权威坐标"和本机预测比，
 * 差距大就硬吸附、小就慢慢拉。留着它只为前后端版本错开的那个窗口。
 */
function legacy(mine, me) {
  const dx = mine.x - me.x, dz = mine.z - me.z;
  if (Math.hypot(dx, dz) > 40) {
    me.x = mine.x; me.z = mine.z;
    me.v = mine.v; me.lat = 0;
    return;
  }
  me.x += dx * BLEND; me.z += dz * BLEND;
  me.v += (mine.v - me.v) * BLEND;
}

/** 供渲染层复用：一台车的速度（公里/小时）。 */
export const kmhOf = r => Math.round((r.v || 0) * KMH);
