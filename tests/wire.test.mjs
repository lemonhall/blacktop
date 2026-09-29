/**
 * 线格式。三条必须守住的：
 *   1. **发规则不发结果**：地图只发种子，客户端的 `createTrack()` 自己算出同一条路；
 *   2. **时间戳的精度要够**：`tm` 少一位小数就会让画面每 100ms 顿一下；
 *   3. **报文要小**：20Hz 的广播，一条 6KB 的报文就是 120KB/s 一个客户端。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { build, run, seconds } from "./helpers.mjs";
import { decodeMap, decodeRacer, decodeTraffic, encodeMap, encodeSnapshot } from "../sim/wire.mjs";
import { createTrack } from "../sim/track.mjs";

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
