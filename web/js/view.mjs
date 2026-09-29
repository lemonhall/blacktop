/**
 * 渲染视图：把快照缓冲插值成"这一刻应该画成什么样"。
 *
 * 两个时间点很关键：
 *   - 快照里的 `tm` 是权威世界时间（秒）；
 *   - 渲染头比它**晚 140ms**，于是任意两帧之间都恰好有一个包可以插值。
 *
 * 这 140ms 就是拿"操作手感"换"画面平滑"的那笔交易。它必须盖得住真实链路上
 * 最长的那个帧间隔——盖不住的话，渲染头一跑到数据前面就只能冻住等下一帧，
 * 数据到的那一刻又猛跳一段，看起来就是"机器人在放幻灯片"。
 */

import { clamp, lerp } from "/sim/constants.mjs";
import { decodeRacer, decodeTraffic } from "/sim/wire.mjs";

export const INTERP_DELAY = 0.14;

export function pushSnapshot(S, snap) {
  S.snaps.push(snap);
  if (S.snaps.length > 20) S.snaps.shift();
  S.serverTime = snap.tm;
  S.lastTm = snap.tm;
  S.countdown = snap.cd || 0;
  if (snap.ph === "over") S.screen = "over";
}

export const latest = S => S.snaps[S.snaps.length - 1] || null;

function brackets(S, tm) {
  const snaps = S.snaps;
  if (!snaps.length) return null;
  if (snaps.length === 1) return [snaps[0], snaps[0], 0];
  for (let i = snaps.length - 1; i >= 1; i--) {
    if (snaps[i - 1].tm <= tm) {
      const span = (snaps[i].tm - snaps[i - 1].tm) || 0.05;
      return [snaps[i - 1], snaps[i], clamp((tm - snaps[i - 1].tm) / span, 0, 1)];
    }
  }
  return [snaps[0], snaps[0], 0];
}

/** 按 id 在两帧里找同一条实体，插值它"一直在动"的那几个量。 */
function blend(older, newer, t, keyOf, fields) {
  const map = new Map(older.map(e => [keyOf(e), e]));
  return newer.map(entity => {
    const prev = map.get(keyOf(entity));
    if (!prev) return entity;
    const out = { ...entity };
    for (const [key, amount] of fields) {
      if (Number.isFinite(prev[key]) && Number.isFinite(entity[key])) {
        out[key] = lerp(prev[key], entity[key], amount);
      }
    }
    return out;
  });
}

const RACER_FIELDS = [["x", 1], ["z", 1], ["lean", 1], ["swing", 1], ["wreck", 1], ["wobble", 1]];
const TRAFFIC_FIELDS = [["x", 1], ["z", 1], ["y", 1], ["spin", 1]];
const idOf = e => (Array.isArray(e) ? e[0] : e.id);

/**
 * 这一刻的完整画面。**只读**：调用方拿到的东西不该再被改回去。
 */
export function buildView(S) {
  const snap = latest(S);
  if (!snap || !S.map) return null;
  const tm = renderHead(S, snap);
  const [older, newer, t] = brackets(S, tm);
  const roster = S.map.roster;

  const racers = blend(
    older.r.map(w => decodeRacer(w, roster)),
    newer.r.map(w => decodeRacer(w, roster)),
    t, idOf, RACER_FIELDS,
  );
  const traffic = blend(
    (older.tr || []).map(decodeTraffic),
    (newer.tr || []).map(decodeTraffic),
    t, idOf, TRAFFIC_FIELDS,
  );

  const mine = racers.find(r => r.ownerId && r.ownerId === S.meId) || null;
  if (mine) {
    S.mine = mine;
    // 我自己那台车用**本地预测**的位置：权威位置永远比手上慢一个来回，
    // 直接照着画就是"油门踩下去两百毫秒才动"。
    const predicted = S.predictMe;
    if (predicted && S.countdown <= 0 && mine.state === "ride") {
      mine.x = predicted.x; mine.z = predicted.z;
      mine.v = predicted.v; mine.kmh = predicted.v * 3.6;
      mine.lean = predicted.lean; mine.wobble = predicted.wobble;
    }
    mine.me = true;
    S.me = mine;
  }

  order(racers);
  const leader = racers.find(r => r.rank === 1) || racers[0] || null;
  const finishZ = S.map.length;
  return {
    time: tm, tick: newer.tk, phase: newer.ph, countdown: newer.cd || 0,
    racers, traffic, mine, leader, finishZ,
    myRank: mine ? mine.rank || 1 : 1,
    field: racers.length,
  };
}

/**
 * 名次：冲过线的按 **冲线时刻** 排，没冲线的按 **已跑距离** 排。
 * 与服务端 `settle()` 用同一条规矩——两边不一致的话，画面上的名次会在冲线瞬间跳一下。
 */
function order(racers) {
  racers.sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.z - a.z;
  });
  racers.forEach((r, i) => { if (!r.finished) r.rank = i + 1; });
}

/**
 * 这一刻该渲染**世界时间轴上的哪一点**——整套平滑的关键就在这里。
 *
 * 判据只有一条：**头离"理想位置"有多远**。理想位置 = 最新一帧的世界时间再往回
 * 退 `INTERP_DELAY`，也就是"抖动余量刚好用满"的那一点。规矩是：
 * 偏差在 15ms 以内走 1.0 倍速；落后最多提到 1.25 倍把位置挣回来；超前最多降到
 * 0.5 倍——减速比加速狠，因为"撞上数据边缘"是唯一会直接变成卡顿的情况。
 */
function renderHead(S, snap) {
  const now = performance.now();
  const dt = Math.min((now - (S.headAt || now)) / 1000, 0.25);
  let tm = S.headTm || (snap.tm - INTERP_DELAY);
  const err = snap.tm - INTERP_DELAY - tm;
  // 掉队半秒以上（切标签页、被系统冻结）就别慢慢爬了，直接对齐。
  if (err > 0.25) tm = snap.tm - INTERP_DELAY;
  else tm += dt * rateFor(err);
  // 头绝不能跑到最新一帧前面：那里没有数据，硬走只能靠外推，外推的方向一错
  // 就是一次"拽回"。留 20ms 余量，让插值永远落在两个真实快照之间。
  const limit = snap.tm - 0.02;
  if (tm > limit) tm = limit;
  S.headTm = tm; S.headAt = now;
  return tm;
}

function rateFor(err) {
  const mag = Math.abs(err);
  if (mag < 0.015) return 1;
  const over = Math.min(mag - 0.015, 0.2);
  const cap = err > 0 ? 0.25 : 0.5;
  return 1 + Math.sign(err) * Math.min(cap, over * (err > 0 ? 1.2 : 2.5));
}
