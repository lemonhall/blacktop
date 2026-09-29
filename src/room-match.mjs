/**
 * 一场比赛的"开、进、退"：把名册变成场上的车手，以及中途进出的人怎么落位。
 *
 * 与 `room-state.mjs` 的分工：那边管**名册**（谁在房里、谁是房主），
 * 这边管**场上**（谁在哪、骑什么车、有没有实体）。两边都只吃普通对象。
 */

import { MAX_RACERS } from "../sim/data.mjs";
import { resetQueue } from "../sim/netcode.mjs";
import { newRacer } from "../sim/racer.mjs";
import { encodeMap } from "../sim/wire.mjs";
import { createWorld, fillRoster, leadZ, startMatch } from "../sim/world.mjs";
import { clearReady, rosterOf } from "./room-state.mjs";

/** 开一局新的：换种子、重铺赛道、重排发车格。房主点一次"开跑"就走到这里。 */
export function beginMatch(state, now = Date.now()) {
  const seed = randomSeed();
  const world = createWorld({
    tenant: state.tenant, roomId: state.roomId,
    mode: state.mode, difficulty: state.difficulty, seed,
  });
  startMatch(world, fillRoster(world, rosterOf(state), state.bots), seed);
  state.phase = "live";
  state.lastSeed = seed;
  state.startedAt = now;
  state.results = null;
  return { world, mapMsg: encodeMap(world) };
}

/** 重开一局（结算之后房主点"再来一局"）。 */
export function resetMatch(state, world) {
  state.phase = "staging";
  state.results = null;
  state.startedAt = 0;
  // 回到候场就得重新举手：上一局开跑前的那次 ready 不能顺延到下一局，
  // 否则房主可以对着"全都没动过"的名册直接再开一局，等于把确认又变成了摆设。
  clearReady(state);
  if (world) { world.phase = "staging"; world.racers = []; }
}

/**
 * 比赛进行中有人进来：直接给他一台车丢进路上。
 *
 * 落位是这件事里唯一需要动脑子的地方。扔在起点等于让他在三公里外独自骑；
 * 扔在领跑者前面又等于空降抢第一。所以：**落在领跑者身后 45 米、速度给全场的
 * 平均速度**——他会看见前面一串尾灯，追得上，但一分钱便宜都没占。
 */
export function joinLive(world, member) {
  if (!world || world.phase !== "live") return null;
  if (world.racers.some(r => r.ownerId === member.playerId)) return null;
  makeRoom(world);
  const slot = joinSlot(world);
  const racer = newRacer(world, {
    id: world.nextEntity++,
    kind: "human",
    ownerId: member.playerId,
    name: member.name,
    bike: member.bike,
    palette: (world.racers.length * 3) % 8,
    skill: 1,
    grid: slot,
  });
  racer.gridIndex = world.racers.length;
  racer.v = slot.v;
  world.racers.push(racer);
  return racer;
}

/**
 * 场上满了就先挪走一个机器人：**真人进来占掉机器人名额**——建房的提示里就是
 * 这么写的，机器人本来就是拿来补位的。挑谁？优先**落后最多**的那个，少影响
 * 一个正在缠斗的人。真人的上限本来就是 2，所以"把真人挤下去"这种局面不存在。
 */
function makeRoom(world) {
  if (world.racers.length < MAX_RACERS) return;
  const bots = world.racers.filter(r => r.kind !== "human");
  if (!bots.length) return;
  const victim = [...bots].sort((a, b) => a.z - b.z)[0];
  world.racers = world.racers.filter(r => r !== victim);
}

/** 半路加入的落点：领跑者身后一小段，速度取全场平均（否则一进来就被套圈）。 */
function joinSlot(world) {
  const z = Math.max(0, leadZ(world) - 45);
  let sum = 0;
  for (const r of world.racers) sum += r.v;
  const v = world.racers.length ? sum / world.racers.length : 30;
  return { x: world.track.laneX(freeLane(world, z)), z, v };
}

/** 挑一条"这个位置附近没人"的车道；都有人就挑最空的那条。 */
function freeLane(world, z) {
  let best = 0, bestD = -1;
  for (let i = 0; i < world.track.lanes; i++) {
    const x = world.track.laneX(i);
    let d = Infinity;
    for (const r of world.racers) {
      if (Math.abs(r.z - z) > 26) continue;
      d = Math.min(d, Math.abs(r.x - x));
    }
    if (d === Infinity) return i;
    if (d > bestD) { bestD = d; best = i; }
  }
  return best;
}

/**
 * 把人从场上**彻底拿掉**（踢人用）。
 *
 * 和 `dropPlayer`（掉线）刻意分开：掉线的人只是失去输入，车留在原地挨撞，
 * 回来还能接着用；被踢的人是真被请走了，留着一台不动的车只会让大家以为他挂机。
 */
export function ejectFromWorld(world, playerId) {
  if (!world) return false;
  const before = world.racers.length;
  world.racers = world.racers.filter(r => r.ownerId !== playerId);
  return world.racers.length !== before;
}

/**
 * 掉线：清掉还没消化的输入命令。
 *
 * 刻意**不**把车从场上拿掉——那样会让"重连"变成一个需要重放名额的状态机。
 * 车留在路上（会被撞、会摔），重连上来接着用同一台。但命令队列必须清空：
 * 那是"我接下来还要往哪走"的债，人不在了就不该继续兑现。
 */
export function dropPlayer(world, playerId) {
  if (!world) return;
  const racer = world.racers.find(r => r.ownerId === playerId);
  if (racer) resetQueue(racer);
}

export function actorIdOf(world, playerId) {
  const r = world?.racers.find(x => x.ownerId === playerId);
  return r ? r.id : 0;
}

function randomSeed() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] || 1;
}
