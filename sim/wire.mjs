/**
 * 线格式（wire format）：世界状态 ↔ 可以过 WebSocket 的普通对象。
 *
 * 用 JSON 而不是二进制是刻意的：这个项目的读者首先是架构师而不是带宽审计员，
 * 打开 DevTools 就能看懂每一帧发了什么，比省下 60% 字节值钱得多。一台车的
 * 一条记录大约 150 字节，15 台车 + 车流 ≈ 4KB，20Hz 下约 80KB/s——对
 * 一个 15 人同场竞速的游戏，这个数完全可以接受。
 *
 * 字段名短到一眼扫完，含义在下面注释里写死。**别改字段名**：客户端和 DO
 * 是两个独立部署的产物，改名等于一次强制同时发布。
 */

import { KMH } from "./constants.mjs";

const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;

/**
 * 地图：**开局只发一次**。
 *
 * 里面没有网格、没有墙体——只有一颗种子和赛道模式。客户端的 `createTrack()`
 * 用同样的输入算出逐位一致的曲率、坡度和路边道具。发"规则"而不是发"结果"，
 * 报文因此只有几百字节，而且永远不会和服务器不同步。
 */
export function encodeMap(w) {
  return {
    t: "map",
    mode: w.mode,
    seed: w.matchSeed ?? w.seed,
    difficulty: w.difficulty,
    lanes: w.track.lanes,
    length: w.track.length,
    countdown: r2(w.countdown),
    // 名册：谁是谁。快照里只发会变的东西，名字/配色/车型发一次就够。
    roster: w.racers.map(r => [r.id, r.ownerId, r.kind, r.name, r.bike, r.palette, r.skill]),
  };
}

export function decodeMap(msg) {
  const roster = new Map();
  for (const [id, ownerId, kind, name, bike, palette, skill] of msg.roster || []) {
    roster.set(id, { id, ownerId, kind, name, bike, palette, skill });
  }
  return {
    mode: msg.mode, seed: msg.seed, difficulty: msg.difficulty,
    lanes: msg.lanes, length: msg.length, countdown: msg.countdown || 0, roster,
  };
}

/**
 * 一帧快照。
 *
 * `tm` 是**世界模拟时间（秒）**，客户端在相邻两帧之间用它插值。它必须带毫秒
 * 精度（`r3`）：`r1` 会把 6.94 秒记成 6.9，而快照每 50ms 来一张，于是
 * "两张快照的 tm 完全相同"和"两张差 100ms"会轮流出现——插值规则跳过前一对、
 * 又从后一对里一次性补回来，画面上就是**每 100ms 顿一下**。1ms 精度对 16.67ms
 * 的模拟格足够了。
 *
 * `wt` 是发送时刻的墙上时间，只留给探针与诊断：渲染头的时钟是客户端的
 * `performance.now`，不是这个字段。
 */
export function encodeSnapshot(w, selfId, sentAt = 0) {
  const out = {
    t: "s", tk: w.tick, ph: w.phase,
    tm: r3(w.time), wt: sentAt, cd: r2(Math.max(0, w.countdown)),
    r: w.racers.map(r => racerWire(r, r.id === selfId)),
    tr: w.traffic.map(trafficWire),
    ev: w.events,
  };
  return out;
}

function racerWire(r, mine) {
  const out = {
    i: r.id, x: r1(r.x), z: r1(r.z), v: r1(r.v * KMH),
    st: r.state === "ride" ? 1 : 0, wk: r1(r.wreck),
    ln: r2(r.lean), sw: r2(r.swing), nl: r.nitroT > 0 ? 1 : 0,
    sm: Math.round(r.stamina),
    rk: r.rank || 0, fi: r.finished ? 1 : 0, ft: r.finished ? r3(r.finishTime) : 0,
    d: r.downs, dy: r.dayuns, cr: r.crashes, ca: r.cash,
    wb: r1(r.wobble), sk: r.state === "wreck" ? r.wreckKind : "",
  };
  if (mine) {
    // 权威确认点：客户端从这里出发、把待确认命令重放一遍，算出"我此刻应该在哪"。
    out.ak = r.ack | 0;
    out.az = r1(r.ackZ); out.ax = r1(r.ackX);
    out.q = r.queued | 0;
  }
  return out;
}

const TRAFFIC_STATE = { run: 1, flung: 2 };
const TRAFFIC_STATE_BACK = ["", "run", "flung"];

function trafficWire(v) {
  return [
    v.id, v.kind, r1(v.x), r1(v.z), v.dir,
    TRAFFIC_STATE[v.state] || 1, r1(v.y || 0), r2(v.spin || 0), r1(v.v * KMH),
  ];
}

export function decodeTraffic(arr) {
  const [id, kind, x, z, dir, state, y, spin, kmh] = arr;
  return { id, kind, x, z, dir, state: TRAFFIC_STATE_BACK[state] || "run", y, spin, v: kmh / KMH };
}

/** 客户端把快照里的车手还原成渲染层好用的对象（名册补上名字与配色）。 */
export function decodeRacer(wire, roster) {
  const meta = (roster && roster.get(wire.i)) || {};
  return {
    id: wire.i, ownerId: meta.ownerId || "", kind: meta.kind || "bot",
    name: meta.name || `#${wire.i}`, bike: meta.bike || 0, palette: meta.palette || 0,
    x: wire.x, z: wire.z, v: wire.v / KMH, kmh: wire.v,
    state: wire.st ? "ride" : "wreck", wreck: wire.wk, wreckKind: wire.sk || "",
    lean: wire.ln, swing: wire.sw, nitro: !!wire.nl, stamina: wire.sm,
    rank: wire.rk, finished: !!wire.fi, finishTime: wire.ft,
    downs: wire.d, dayuns: wire.dy, crashes: wire.cr, cash: wire.ca, wobble: wire.wb,
    ack: wire.ak | 0, ackZ: wire.az, ackX: wire.ax, queued: wire.q | 0,
  };
}
