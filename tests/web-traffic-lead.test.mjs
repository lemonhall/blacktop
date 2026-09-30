/**
 * **车流画在"此刻"，不画在 140 毫秒前。**
 *
 * 这一份盯着一条线上实测的手感问题：撞车（还有撞牛）是拿服务端**此刻的真实位置**
 * 判的，但画面上它们停在插值延迟那一刻。对向车相对速度 70 m/s，这 140 毫秒就是
 * 十来米——玩家看到的是"车还在八米外我就飞了"，或者"明明从缝里钻过去却撞了"。
 *
 * 所以车流和畜生要在画的时候按自己的速度补到最新一帧。这份测试把那条补帧钉在
 * **"补完 ≈ 最新那张快照里的位置"**上——补多了、补少了、补反了都会红；车手那条
 * 反过来钉住"**不许补**"（打击判定本来就回到玩家看见的那一刻，见 `sim/history.mjs`）。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { buildView, INTERP_DELAY, pushSnapshot, TRAFFIC_LEAD_MAX } from "../web/js/view.mjs";
import { decodeCritters, decodeMap, decodeTraffic, encodeMap, encodeSnapshot, racerIdOf } from "../sim/wire.mjs";
import { build, run } from "./helpers.mjs";

const SNAP_TICKS = 3;
const SNAPS = 8;

/**
 * 造一块"人看见的画面"：一张地图 + 一串 50 毫秒一张的快照，和线上那条路一样。
 * 八张是有讲究的——快照的间隔只有比插值延迟更密的时候，渲染头才会落在两张之间，
 * 而那正是线上"补帧"生效的那个位置。
 */
function watching({ car = null, critter = false, rtt = 0 } = {}) {
  const w = build({ seed: 3, bots: 3, humans: [{ ownerId: "me", name: "我", bike: 0 }] });
  run(w, 20);
  w.countdown = 0;
  const a = w.racers.find(r => r.ownerId === "me");
  a.v = 30;                                     // 我自己在跑，车手那条断言才有的比
  let added = null;
  if (car) {
    added = {
      id: w.nextEntity++, kind: car.kind, x: a.x, z: a.z + 200,
      v: 20, dir: car.dir, state: "run", t: 0, spin: 0, vy: 0, lane: 2,
    };
    w.traffic.push(added);
  }
  if (critter) {
    added = { id: w.nextEntity++, kind: "cow", x: 0, z: a.z + 60, dir: 1, v: 2.5, state: "walk", y: 0, spin: 0, t: 0 };
    w.critters.push(added);
  }
  const S = {
    snaps: [], map: decodeMap(encodeMap(w)), meId: "me",
    predictMe: null, headTm: 0, headAt: 0, mine: null, me: null, rtt,
  };
  const selfId = racerIdOf(S.map.roster, "me");
  for (let i = 0; i < SNAPS; i++) {
    run(w, SNAP_TICKS);
    pushSnapshot(S, encodeSnapshot(w, selfId, 0));
  }
  const newest = S.snaps.at(-1);
  const where = id => decodeTraffic(newest.tr.find(row => row[0] === id));
  return { w, S, a, added, where, view: () => buildView(S) };
}

test("同向车：画面上的位置补到了最新一帧，不是停在 140 毫秒前", () => {
  const h = watching({ car: { kind: "car", dir: 1 } });
  const newest = h.where(h.added.id);
  const shown = h.view().traffic.find(v => v.id === h.added.id);
  assert.ok(shown, "这台车在画面上");
  assert.ok(Math.abs(shown.z - newest.z) < 0.3,
    `画面上的车在 ${shown.z.toFixed(1)}，最新快照说它在 ${newest.z.toFixed(1)}——差了 ${(shown.z - newest.z).toFixed(1)} 米`);
});

test("对向车：方向反过来，补帧也得跟着反过来", () => {
  const h = watching({ car: { kind: "dayun", dir: -1 } });
  const newest = h.where(h.added.id);
  const shown = h.view().traffic.find(v => v.id === h.added.id);
  assert.ok(Math.abs(shown.z - newest.z) < 0.3,
    `对向车补错方向了：画面 ${shown.z.toFixed(1)}，实际 ${newest.z.toFixed(1)}`);
});

test("畜生沿 x 过马路：补的那一维也必须是 x", () => {
  const h = watching({ critter: true });
  const newest = decodeCritters(h.S.snaps.at(-1).cr)[0];
  const shown = h.view().critters.find(c => c.id === h.added.id);
  assert.ok(Math.abs(shown.x - newest.x) < 0.1,
    `牛应该补在 x 上：画面 ${shown.x.toFixed(2)}，实际 ${newest.x.toFixed(2)}`);
  assert.equal(shown.z, newest.z, "牛不沿 z 走，z 不该被补");
});

test("报出来的 `carTime` 就是车流被画到的那个时刻：最新一帧，或比它再靠后一点", () => {
  const h = watching({ car: { kind: "car", dir: 1 } });
  const view = h.view();
  const newest = h.S.snaps.at(-1).tm;
  assert.ok(view.carTime > view.time, "车流比人靠前，carTime 必须比 time 晚");
  assert.ok(view.carTime >= newest - 1e-9, `carTime(${view.carTime}) 不该停在最新一帧(${newest})之前`);
  assert.ok(view.carTime - view.time <= TRAFFIC_LEAD_MAX + 1e-6, "补帧有上限");
  assert.ok(view.carTime - view.time >= INTERP_DELAY - 1e-6,
    "最少也要把 140ms 的插值延迟补回来——这是「车还在八米外我就飞了」的根");
  assert.ok(view.carTime - view.time < INTERP_DELAY + 0.06,
    "刚收到帧就画的时候，多出来的只有'帧到手之后过去的那几毫秒'");
});

test("半个来回也算进去：延迟大的时候车流再往前一点", () => {
  const quick = watching({ rtt: 0 }).view();
  const slow = watching({ rtt: 120 }).view();
  const gap = (slow.carTime - slow.time) - (quick.carTime - quick.time);
  assert.ok(Math.abs(gap - 0.06) < 0.02, `120ms 的来回该多补 60ms，实际多补了 ${(gap * 1000).toFixed(0)}ms`);
});

test("补帧有上限：网络烂成什么样，车流都不许整体瞬移", () => {
  const view = watching({ rtt: 5000 }).view();
  assert.ok(view.carTime - view.time <= TRAFFIC_LEAD_MAX + 1e-6,
    `一次抖动不该让路上的车挪出去十几米：实际补了 ${((view.carTime - view.time) * 1000).toFixed(0)}ms`);
});

test("车手不补、而且是**插值**出来的：他们还停在两帧之间（不然回看和画面会各说各话）", () => {
  const h = watching({ car: { kind: "car", dir: 1 } });
  const shown = h.view().racers.find(r => r.id === h.a.id);
  const behind = h.a.z - shown.z;
  assert.ok(behind > 1.5 && behind < 7,
    `车手应该落后真实位置大约一个插值延迟（30 m/s × 0.14s ≈ 4 米），实际 ${behind.toFixed(2)} 米`);
});
