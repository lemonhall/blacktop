/**
 * **挥空要有回音。**
 *
 * 这条是从线上的一句话里长出来的："攻击，依旧很容易 miss 掉，失手了弹个字幕 MISS"。
 * 问题的实质不是判定，是**反馈**：以前挥空只有一声很轻的响，玩家分不清
 * "我打空了"、"我按了但游戏没理我"、"我方向按反了"这三件事——三件事要三种反应，
 * 而它们当时长得一模一样。而这三件事恰恰是"攻击用不起来"最常见的三种原因。
 *
 * 钉住三条：
 *   1. 自己挥空 → 拳够得到的那一截路上弹一个 MISS（前打摆身前、回身摆身后）；
 *   2. 别人挥空 → 一个字都不弹（十五台车每次抡空都飘一行字，画面就是弹幕）；
 *   3. 打中了不许弹 MISS——那会把"打中了"这件事说反。
 *
 * 还有一条藏在背后：这个事件是 **`sim/combat.mjs` 发的**，车、牛、人三条路径共用
 * 同一次判定。所以这条字幕天生对三种目标一视同仁，不需要在这里再抄一遍判定。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { attack } from "../sim/combat.mjs";
import { FX } from "../web/js/state.mjs";
import { consumeEvents } from "../web/js/fxevent.mjs";

const ME = 3;
/** 一块最小的画面：只有我自己，站在 z=100。 */
const view = () => ({ mine: { id: ME, z: 100 }, racers: [{ id: ME, name: "我" }], traffic: [], critters: [] });

function fresh() {
  FX.floaters.length = 0;
  FX.sparks.length = 0;
  FX.rings.length = 0;
  FX.smoke.length = 0;
  FX.feed.length = 0;
  FX.announce = null;
}

const miss = () => FX.floaters.filter(f => f.text === "MISS");

test("自己挥空：弹一个 MISS，摆在拳头够得到的那一截路上", () => {
  fresh();
  consumeEvents([{ k: "whiff", a: ME, z: 100, x: 0.8, dir: 1 }], view());
  const [f] = miss();
  assert.ok(f, "挥空连一行字都没有——玩家没法把'打空了'和'没按出去'分开");
  assert.equal(f.x, 0.8, "横向要跟着我站的地方");
  assert.ok(f.z > 100, `前打的 MISS 该在身前，实际在 ${f.z}`);
  assert.ok(f.y > 1.2 && f.y < 2.6, `高度要在胸口到头顶之间（${f.y}），贴地或飘天上去都不像字幕`);
  // 字号走的是**最高的那一档**（`render.floaterSize` 的 `3` = 68 像素封顶）。
  // 这一条改过两次：最早把 MISS 摆在普通跳字那一档（28 像素），线上反馈是
  // "miss 有看到，但很容易忽略掉"；提到 56 之后那条播报档被"第几圈""击倒!"
  // 一起用着，混战里还是会被淹——所以 MISS 单独一档，而且单独一条寿命。
  assert.equal(f.big, 3, "MISS 用自己那一档字号，混战里也得一眼看见");
  assert.ok(f.max > 1.2, `MISS 该挂得比普通跳字久一点（实际 ${f.max} 秒）——它是判决，不是装饰`);
  assert.ok(f.age === 0, "刚弹出来，还没走完弹入动画");
});

test("回身打挥空：MISS 摆在身后——不然人分不清自己按反了方向", () => {
  fresh();
  consumeEvents([{ k: "whiff", a: ME, z: 100, x: 0, dir: -1 }], view());
  const [f] = miss();
  assert.ok(f && f.z < 100, `回身那一拳的 MISS 该在身后，实际在 ${f && f.z}`);
});

test("别人挥空：一个字都不弹", () => {
  fresh();
  for (let i = 0; i < 14; i++) consumeEvents([{ k: "whiff", a: 10 + i, z: 100, x: 0, dir: 1 }], view());
  assert.equal(miss().length, 0, "十四台车一起抡空，画面就成弹幕了");
});

test("打中了不弹 MISS：这两件事必须分得开", () => {
  fresh();
  consumeEvents([{ k: "hit", a: ME, b: 8, z: 102, x: 0, d: 24, dir: 1, w: "" }], view());
  assert.equal(miss().length, 0, "打中了还弹 MISS，等于告诉玩家他打空了");
  assert.ok(FX.floaters.some(f => f.text === "-24"), "该弹的是伤害数字");
});

test("服务端真的会发这个事件：空荡荡的路上挥一拳就有一条 whiff", () => {
  // 一个只有我自己的世界：身前没车、没牛、没人——这一拳必然落空。
  const me = {
    id: ME, kind: "human", x: 0, z: 100, v: 0, lat: 0, state: "ride", attackCd: 0,
    stamina: 100, belt: [], wi: 0, swing: 0, atk: null, lastHit: -99, downs: 0, cash: 0,
  };
  const w = { time: 1, racers: [me], traffic: [], critters: [], events: [] };
  assert.equal(attack(w, me, 1, null), false, "空路上不该判定成打中了");
  const whiff = w.events.find(e => e.k === "whiff");
  assert.ok(whiff, "`attack` 没发 whiff，客户端的 MISS 就永远不会出现");
  assert.equal(whiff.a, ME);
  assert.equal(whiff.dir, 1, "方向要跟着发下来，不然字幕摆错边");

  fresh();
  consumeEvents(w.events, view());
  assert.equal(miss().length, 1, "服务端发了事件，画面上就该有一个 MISS");
});
