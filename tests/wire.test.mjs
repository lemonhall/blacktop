/**
 * 线格式。三条必须守住的：
 *   1. **发规则不发结果**：地图只发种子，客户端的 `createTrack()` 自己算出同一条路；
 *   2. **时间戳的精度要够**：`tm` 少一位小数就会让画面每 100ms 顿一下；
 *   3. **报文要小**：20Hz 的广播，一条 6KB 的报文就是 120KB/s 一个客户端。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { build, run, seconds } from "./helpers.mjs";
import { decodeMap, decodeRacer, decodeTraffic, encodeMap, encodeSnapshot, mineIn, racerIdOf } from "../sim/wire.mjs";
import { createTrack } from "../sim/track.mjs";
import { joinLive } from "../src/room-match.mjs";

test("地图：发的是种子和模式，解码后能重建出同一条路", () => {
  const w = run(build({ seed: 31337, mode: "wild" }), 1);
  const msg = encodeMap(w);
  assert.equal(msg.t, "map");
  assert.equal(msg.seed, 31337);
  assert.equal(msg.mode, "wild");
  assert.equal(msg.roster.length, w.racers.length);

  const map = decodeMap(JSON.parse(JSON.stringify(msg)));
  const rebuilt = createTrack({ seed: map.seed, mode: map.mode });
  assert.equal(rebuilt.length, w.track.length);
  assert.equal(rebuilt.lanes, w.track.lanes);
  for (let z = 0; z < 500; z += 11) assert.equal(rebuilt.curveAt(z), w.track.curveAt(z));
  assert.ok(JSON.stringify(msg).length < 2000, "地图报文应该只有一两 KB");
});

test("快照：自己的记录带权威确认点，别人的不带", () => {
  const w = build({ seed: 5, bots: 13, humans: [{ ownerId: "g1", name: "柠檬叔" }] });
  run(w, seconds(6));
  const mine = w.racers.find(r => r.ownerId === "g1");
  const snap = encodeSnapshot(w, mine.id, 123456);
  const self = snap.r.find(r => r.i === mine.id);
  assert.ok(self, "自己一定在快照里");
  assert.equal(typeof self.ak, "number");
  assert.equal(typeof self.az, "number");
  assert.equal(typeof self.ax, "number");
  assert.ok(snap.r.filter(r => r.i !== mine.id).every(r => r.ak === undefined), "别人的 ack 不该发");
  assert.equal(snap.wt, 123456);
});

test("世界时间带毫秒精度（少一位小数就会让画面每 100ms 顿一下）", () => {
  const w = run(build({ seed: 6 }), 7);
  const snap = encodeSnapshot(w, 0);
  assert.equal(snap.tm, Math.round(w.time * 1000) / 1000);
  assert.ok(String(snap.tm).split(".")[1] !== undefined, "tm 必须带小数");
});

test("快照能被 JSON 序列化，且大小在预算内", () => {
  const w = build({ seed: 8, bots: 14, humans: [{ ownerId: "g1", name: "柠檬叔" }] });
  run(w, seconds(45));
  const text = JSON.stringify(encodeSnapshot(w, w.racers[0].id, Date.now()));
  assert.ok(text.length > 500, "报文不能是空的");
  assert.ok(text.length < 9000, `快照 ${text.length} 字节，超预算了`);
});

test("车手与车流都能还原成渲染层好用的对象", () => {
  const w = run(build({ seed: 9 }), seconds(20));
  const snap = encodeSnapshot(w, 0);
  const roster = decodeMap(encodeMap(w)).roster;
  const r = decodeRacer(snap.r[0], roster);
  assert.equal(r.state, "ride");
  assert.ok(r.name.length > 0, "名字要从名册里补回来");
  assert.ok(r.kmh > 0);
  assert.ok(snap.tr.length > 0, "路上应该有车");
  const v = decodeTraffic(snap.tr[0]);
  assert.ok(v.kind && v.z > 0 && (v.dir === 1 || v.dir === -1));
});

/**
 * 身份解析：快照里**没有** ownerId，只有车号。这条约定踩过一次大坑——
 * 客户端按射击版的 `r.ow` 去找"我自己"，永远找不到，于是本地预测不启动、
 * 油门一点反应都没有（但别人的车照样在跑，看着像"卡了"）。所以这里把它钉死。
 */
test("快照里不带 ownerId，身份只能从名册查（踩过坑：查不到就等于没有油门）", () => {
  const w = run(build({ seed: 11, bots: 13, humans: [{ ownerId: "g1", name: "柠檬叔" }] }), seconds(3));
  const snap = encodeSnapshot(w, 0);
  assert.ok(snap.r.every(r => r.ow === undefined), "快照里不该出现 ownerId 字段");

  const roster = decodeMap(encodeMap(w)).roster;
  const id = racerIdOf(roster, "g1");
  assert.ok(id > 0, "名册要能把 ownerId 翻成车号");
  assert.equal(mineIn(snap, roster, "g1").i, id);
  assert.equal(mineIn(snap, roster, "查无此人"), null);
  assert.equal(mineIn(null, roster, "g1"), null);
  assert.equal(racerIdOf(null, "g1"), -1);
});

/**
 * 中途补位的人必须出现在**重新编码**的名册里。
 *
 * 反过来的症状很具体：新人拿到的还是开局那份名册，里面没有他，于是他在自己的
 * 屏幕上是"一块石头"——别人的车在跑，他的油门没有反应；而其他人看到的新人
 * 是一台没名字的灰车。
 */
test("有人中途补位之后，重新编码的名册里必须有他", () => {
  const w = run(build({ seed: 12, bots: 13, humans: [{ ownerId: "g1", name: "柠檬叔" }] }), seconds(8));
  const before = decodeMap(encodeMap(w)).roster;
  assert.equal(racerIdOf(before, "g2"), -1, "补位之前名册里不该有他");

  const joined = joinLive(w, { playerId: "g2", name: "链接来客", bike: 2 });
  assert.ok(joined, "比赛进行中应该能补位");
  assert.ok(joined.z > 0, "补位落在路上，不是起点");

  const after = decodeMap(encodeMap(w)).roster;
  const id = racerIdOf(after, "g2");
  assert.ok(id > 0, "补位之后名册里必须有他");
  const snap = encodeSnapshot(w, id);
  assert.equal(mineIn(snap, after, "g2").i, id);
});
