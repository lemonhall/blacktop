/**
 * 浏览器那一半的**本地预测**。
 *
 * 这个模块坏掉的样子特别难查：不报错、不白屏，只是"油门踩下去车不动"或者
 * "车往前骑一段又跳回来"。它住在 `web/js/` 里，过去只有浏览器能跑到——所以
 * 它一直是个测试盲区。这一份把它拖进 `node --test`：
 *
 *   1. 预测世界必须**真的能跑一格**（缺一个字段就当场抛异常）；
 *   2. 油门给上去，`z` 必须往前走；
 *   3. 对账（`reconcile`）在"权威点 + 待确认命令"之间重放，误差要落在几个毫米里。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DT } from "../sim/constants.mjs";
import { createTrack } from "../sim/track.mjs";
import { decodeMap, decodePickups, decodeRacer, encodeMap, encodeSnapshot } from "../sim/wire.mjs";
import { S } from "../web/js/state.mjs";
import { initPredict, stepPredict, reconcile } from "../web/js/predict.mjs";

/** 把客户端状态摆成"刚进赛道"的样子。`S` 是模块级单例，测试之间要自己清干净。 */
function boot(seed = 3) {
  // 地图的编解码顺手在这里一起验了：客户端拿到的从来不是"参数"，而是两条消息。
  const map = decodeMap(encodeMap({
    mode: "city", matchSeed: seed, difficulty: 1,
    track: { lanes: 4, length: 3000 },
    countdown: 3,
    racers: [{ id: 1, ownerId: "p1", kind: "human", name: "我", bike: 0, palette: 0, skill: 1 }],
  }));
  S.track = createTrack({ seed, mode: "city" });
  S.map = map;
  S.meId = "p1";
  S.screen = "play";
  S.countdown = 0;
  S.cmds = [];
  S.predictMe = null;
  S.predictW = null;
  return S.track;
}

/** 一份"服务端说我在哪"的最小记录——和 `decodeRacer` 的产物同形。 */
function mineAt({ x = 0, z = 40, v = 24 } = {}) {
  return {
    id: 1, ownerId: "p1", kind: "human", name: "我", bike: 0, palette: 0,
    x, z, v, kmh: v * 3.6, state: "ride", wreck: 0, lean: 0, swing: 0,
    nitro: false, nitroCd: 0, stamina: 100, belt: [], wi: 0,
    rank: 1, finished: false, finishTime: 0, wobble: 0,
    ack: 0, ackZ: z, ackX: x, ackV: v, ackLat: 0, queued: 0,
  };
}

const keys = (patch = {}) => ({ th: 0, br: 0, st: 0, nos: false, ...patch });

test("预测世界能真的跑一格：油门一给，车就往前走", () => {
  boot();
  initPredict(S, mineAt());
  assert.ok(Array.isArray(S.predictW.pickups), "预测世界必须有个 pickups 数组：`stepRacer` 每格都会读它");
  assert.deepEqual(S.predictMe.belt, []);
  const z0 = S.predictMe.z;
  stepPredict(S, DT, keys({ th: 1 }), 0);
  assert.ok(S.predictMe.z > z0, "油门到底还不往前走，说明预测根本没生效");
  assert.ok(Number.isFinite(S.predictMe.x), "横向位置不能是 NaN");
});

test("预测里出拳、换家伙都不会把它带崩（判定在服务端，这里只管画）", () => {
  boot();
  initPredict(S, mineAt());
  for (const act of [1, 2, 3, 4, 5, 7]) {
    assert.doesNotThrow(() => stepPredict(S, DT, keys({ th: 1 }), act), `act=${act} 不该让预测崩掉`);
  }
  assert.equal(S.predictW.events.length, 0, "预测世界不攒事件：那些没人看，攒一场就是几千条");
  assert.equal(S.predictMe.belt.length, 0, "捡与抢都发生在权威端，预测里腰永远是空的");
});

test("对账：从权威确认点重放待确认命令，算出来的位置和本机预测一致", () => {
  boot();
  initPredict(S, mineAt());
  // 走三格，并且把这三格记成"已发出、还没被 ack"的命令。
  const cmd = { sq: 1, th: 1, br: 0, st: 0, nos: 0, act: 0, n: 3 };
  S.cmds = [cmd];
  for (let i = 0; i < 3; i++) stepPredict(S, DT, keys({ th: 1 }), 0);
  const predicted = S.predictMe.z;

  // 服务端说：第 1 条命令一格都还没走完（ack=0），我从"起点、速度 24"出发。
  reconcile(S, mineAt({ z: 40, v: 24 }));
  assert.ok(Number.isFinite(S.predictMe.z));
  assert.ok(Math.abs(S.predictMe.z - predicted) < 0.5,
    `重放出来的位置该和本机预测几乎相同（${predicted} vs ${S.predictMe.z}）`);
});

test("被 ack 覆盖掉的那几条命令会被丢掉，不再重复走一遍", () => {
  boot();
  initPredict(S, mineAt());
  const done = { sq: 1, th: 1, br: 0, st: 0, nos: 0, act: 0, n: 4 };
  const pending = { sq: 2, th: 1, br: 0, st: 0, nos: 0, act: 0, n: 2 };
  S.cmds = [done, pending];
  reconcile(S, { ...mineAt({ z: 40, v: 24 }), ack: 1 });
  assert.deepEqual(S.cmds.map(c => c.sq), [2], "已经确认过的命令还留在列表里，就会被重放第二遍");
});

test("快照那一头：地上的家伙能解码成渲染层要的形状", () => {
  boot();
  const back = decodePickups([["mace", 1.5, 220.4, 7], ["club", -2, 260, 0]]);
  assert.deepEqual(back.map(p => p.x), [1.5, -2]);
  assert.equal(back[0].charges, 7);
  assert.ok(back.every(p => Number.isInteger(p.i) && p.i > 0), "解码出来的是下标，不是名字");
});

test("快照 → decodeRacer：手里那件跟着快照走", () => {
  boot();
  const map = S.map;
  const snap = decodeSnapshotLike(map);
  const wire = snap.r[0];
  const decoded = decodeRacer(wire, map.roster);
  assert.equal(decoded.ownerId, "p1", "身份只能从名册查");
  assert.deepEqual(decoded.belt.map(b => b.i), [3, 6], "铁链与流星锤都在腰里");
  assert.equal(decoded.belt[1].charges, 4);
  assert.equal(decoded.wi, 1, "举在手里的是第二件");
});

/** 借 `encodeSnapshot` 造一条真记录，别在测试里手抄字段名——抄错就失去意义。 */
function decodeSnapshotLike(map) {
  return encodeSnapshot({
    tick: 1, time: 1, phase: "live", countdown: 0, events: [], pickups: [],
    traffic: [],
    racers: [{
      id: 1, ownerId: "p1", name: "我", bike: 0, palette: 0, skill: 1,
      x: 0, z: 40, v: 24, state: "ride", wreck: 0, lean: 0, swing: 0,
      nitroT: 0, nitroCd: 0, stamina: 100, rank: 1, finished: false, finishTime: 0,
      downs: 0, kills: 0, crashes: 0, cash: 0, wobble: 0, wreckKind: "",
      belt: [{ i: 3, charges: 0 }, { i: 6, charges: 4 }], wi: 1,
      ack: 0, ackZ: 40, ackX: 0, ackV: 24, ackLat: 0, queued: 0,
    }],
  }, -1);
}
