/**
 * 车手：**物理与推进**。人类和机器人走的是同一段代码，区别只在"input 从哪来"——
 * 人类从命令队列（`netcode.mjs`），机器人从 `ai.mjs`。
 *
 * 这一间屋子只放三件事：造一个车手、推进一帧、以及摔在地上的那两秒。出拳和撞车
 * 各占一间（`combat.mjs` / `impact.mjs`），手感数字全在 `spec.mjs`。分家的好处很
 * 直白：调手感去 `spec.mjs` 改数字，查判定去 `combat.mjs` 读窗口，读代码的人不用
 * 在三百行里找那一行。
 *
 * 摔车是整个手感的重心。撞车、被打到体力见底，结果都是"人车分离"：车速掉光、
 * 躺两秒、再从低速爬起来。它必须**痛**（否则躲车流没有意义），但不能**致命**
 * （否则一局里摔两次就不用玩了）——所以时长固定、体力固定回一点点。
 *
 * 对外仍然只有这一个入口：`attack` / `wreck` 这些名字从这里转出去，别的模块和
 * 测试照旧 `import ... from "./racer.mjs"`。
 */

import { clamp, KMH } from "./constants.mjs";
import { BIKES } from "./data.mjs";
import { takePickup } from "./pickups.mjs";
import { cycleWeapon } from "./weapons.mjs";
import { attack, bump, syncAttack } from "./combat.mjs";
import { collideTraffic } from "./impact.mjs";
import { NITRO_CD, NITRO_TIME, STAMINA_MAX, TUNE, specOf } from "./spec.mjs";
import { resetQueue } from "./netcode.mjs";
import { poseFor } from "./history.mjs";

export { NITRO_CD, NITRO_TIME, STAMINA_MAX, TUNE, specOf };
export { attack, punchTarget, syncAttack, bump } from "./combat.mjs";
export { collideTraffic, wreck } from "./impact.mjs";

export function newRacer(w, { id, kind, ownerId, name, bike = 0, palette = 0, skill = 1, grid = { x: 0, z: 0 } }) {
  const r = {
    id, kind, ownerId, name,
    bike: clamp(Math.floor(bike), 0, BIKES.length - 1),
    palette: palette % 8, skill,
    x: grid.x, z: grid.z, v: 0, lat: 0, lean: 0, wobble: 0,
    stamina: STAMINA_MAX, state: "ride", wreck: 0, wreckKind: "",
    attackCd: 0, hitCd: 0, swing: 0, nitroT: 0, nitroCd: 0,
    // 挂起的那一拳（见 `combat.syncAttack`）：`null` = 胳膊是空的。
    atk: null,
    belt: [], wi: 0,
    lastHit: -99, downs: 0, kills: 0, crashes: 0, topV: 0, cash: 0,
    // `lap` 是"正在跑第几圈"（从 1 起），`z` 是总里程。两个都记：排名看 `z`，
    // 界面看 `lap`——见 `crossFinish`。
    finished: false, finishTime: 0, rank: 0, kmh: 0, lap: 1,
  };
  resetQueue(r);
  return r;
}

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
  // 冲过**终点**之后还能往前滑一段（进缓冲区），但不能无限跑下去——那会让"世界的
  // 长度"变成一个没有上界的数，车流回收的判据跟着一起失效。注意这里夹的是
  // `totalLength`（三圈的终点），不是一圈的尽头：夹错一个量，所有人都会被钉在第一
  // 圈的终点线上。
  if (r.z > w.track.totalLength + 90) r.z = w.track.totalLength + 90;

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
  // 动作位：bit1 = 正前方一拳，bit2 = 回身一拳，bit4 = 换家伙。
  // 换家伙放在挥拳**之前**——举对了再打，不然"按键那一格"会白挥。
  // bit1 与 bit2 同时按着也只出一拳：原版一挥手就只挥一次，共用同一个冷却。
  if (input.act & 4) cycleWeapon(r, 1);
  // `input.vt` / `input.cvt` 是**人**才有的字段：它们说"我按这一下的时候，屏幕上
  // 显示的人和车分别是哪一刻"。判定就回到那一刻去算——见 `history.mjs` 里那笔
  // 0.24 秒的账。机器人没有这两个字段，本地预测也没有，两种都自然退回"用当下"。
  // 上一格挂起的那一拳先兑现：世界又往前走了 1/60 秒，也许车已经撞进窗口了。
  syncAttack(w, r, dt);
  if (input.act & 1) attack(w, r, 1, poseFor(w, input));
  else if (input.act & 2) attack(w, r, -1, poseFor(w, input));

  takePickup(w, r);
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
 * 越线：名次由"第几个冲过终点"决定，所以这里只记时刻，排序在世界层做。
 *
 * `z` 是一路累加的**总里程**（不按圈取模），所以"谁在前面"永远就是 `z` 谁大；
 * 圈数只是把它除以一圈长度取整。这两个量分开记，是因为"按第几圈排名"会在圈末
 * 把整桌人的次序抖一下——那正是赛车游戏里最不该出现的假动作。
 */
export function crossFinish(w, r) {
  const lap = Math.min(w.track.laps, Math.floor(r.z / w.track.length) + 1);
  if (lap > (r.lap || 1)) {
    r.lap = lap;
    if (!r.finished) {
      w.events.push({ k: "lap", a: r.id, l: lap, n: w.track.laps, z: r.z, x: r.x, h: r.kind === "human" });
    }
  }
  if (r.finished || r.z < w.track.totalLength) return false;
  r.finished = true;
  r.finishTime = w.time;
  r.rank = ++w.finishers;
  w.events.push({ k: "finish", a: r.id, r: r.rank, z: r.z, x: r.x, n: r.name, h: r.kind === "human" });
  return true;
}
