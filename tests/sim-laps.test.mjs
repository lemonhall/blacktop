/**
 * 三圈：一局比赛跑的是**三圈**，不是单程。
 *
 * 单程的问题不在"短"，而在**跑不完**：十五台车挤在三四公里的路上，第一名冲线时还有
 * 一半人没过第一个弯，一局就这么结束了。三圈让"抢第一个弯"和"追最后一个人"这两件事
 * 同时有意义，也让路上那八张地图真的值得看。
 *
 * 这份测试钉的是三圈这件事的**五条边界**，每一条都是改了圈数之后最容易塌的地方：
 *   1. 一圈的终点不是终点（`totalLength = length × laps`）；
 *   2. 一圈的首尾要接得上（接不上，三圈就是"同一道墙撞三次"）；
 *   3. 路边道具按圈复用（不然第二圈路边会秃掉）；
 *   4. 过线要报平安、要涨圈数，但**不算完**；
 *   5. 圈数得过线、计时上限得过线（服务端算的，客户端得看得见、够得着）。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { build, run, seconds } from "./helpers.mjs";
import { MODES } from "../sim/data.mjs";
import { createTrack } from "../sim/track.mjs";
import { crossFinish } from "../sim/racer.mjs";
import { TIME_LIMIT, TIME_LIMIT_PER_LAP } from "../sim/world.mjs";
import { decodeMap, encodeMap } from "../sim/wire.mjs";

const MODE_IDS = Object.keys(MODES);

test("一局默认三圈：`length` 仍是一圈的长度，终点在三圈的尽头", () => {
  for (const mode of MODE_IDS) {
    const t = createTrack({ seed: 8, mode });
    const want = MODES[mode].laps || 3;
    assert.equal(t.laps, want, `${mode}：圈数不对`);
    assert.ok(want >= 3, `${mode}：一局只有 ${want} 圈，太短`);
    assert.equal(t.length, MODES[mode].length, `${mode}：length 该是一圈的长度`);
    assert.equal(t.totalLength, t.length * t.laps, `${mode}：总里程不等于圈数乘一圈`);
  }
});

/**
 * 接缝。这条是"整圈周期化"唯一的验收点：`curveAt` / `hillAt` 现在把每条正弦的波长
 * 掐成一圈长度的整数分之一，所以圈末的位置、斜率都等于圈首——车开到圈末，路正好
 * 卷回起点。改回"随便一个正弦"的话，三圈就是同一道折角撞三次。
 */
test("一圈的首尾接得上：曲率与高程都是整圈周期", () => {
  for (const mode of MODE_IDS) {
    for (let seed = 1; seed <= 6; seed++) {
      const t = createTrack({ seed, mode });
      const eps = 1e-9;
      for (const [z, at] of [[0, 0], [37, 37], [t.length / 3, "1/3"]]) {
        assert.ok(Math.abs(t.curveAt(z + t.length) - t.curveAt(z)) < eps,
          `${mode}/${seed}：z=${at} 处曲率接不上`);
        assert.ok(Math.abs(t.hillAt(z + t.length) - t.hillAt(z)) < eps,
          `${mode}/${seed}：z=${at} 处高程接不上`);
      }
    }
  }
});

test("路边道具按圈复用：第二圈和第一圈长得一模一样", () => {
  for (const mode of MODE_IDS) {
    const t = createTrack({ seed: 91, mode });
    // 槽位表只盖一圈，第二圈走的是同一张表。槽号是**世界网格**上的序号（一路往大
    // 里数），所以对上的判据是"槽号对一圈取模相同"，不是"z 差一个 length"。
    const perLap = Math.ceil(t.length / t.propStep);
    const bySlot = new Map();
    for (const p of t.propsBetween(0, t.length * 2)) {
      const slot = ((p.i % perLap) + perLap) % perLap;
      if (!bySlot.has(slot)) bySlot.set(slot, []);
      bySlot.get(slot).push(p);
    }
    let twice = 0;
    for (const [slot, list] of bySlot) {
      if (list.length < 2) continue;
      twice++;
      const [a, b] = list;
      assert.equal(b.i - a.i, perLap, `${mode}：第 ${slot} 槽的两次出现不差一整圈`);
      assert.equal(b.kind, a.kind, `${mode}：第 ${slot} 槽跨圈换了样子`);
      assert.equal(b.side, a.side, `${mode}：第 ${slot} 槽换了一边`);
      assert.equal(b.x, a.x, `${mode}：第 ${slot} 槽挪了横向位置`);
      assert.equal(b.s, a.s, `${mode}：第 ${slot} 槽跨圈变了大小`);
    }
    assert.ok(twice > perLap * 0.9,
      `${mode}：${perLap} 个槽里只有 ${twice} 个跑到了第二圈`);
  }
});

/**
 * 接缝两侧也要守"同一种不许连着两槽"：槽位表是**一圈**的表，圈末那一槽和圈首那一槽
 * 在世界上是挨着的两件东西，光扫表内不管接缝，路边会冒出一对一模一样的井架。
 */
test("跨圈的相邻两件道具不会撞成同一款", () => {
  for (const mode of MODE_IDS) {
    for (let seed = 1; seed <= 30; seed++) {
      const t = createTrack({ seed, mode });
      const props = t.propsBetween(t.length - 120, t.length + 120);
      for (let k = 1; k < props.length; k++) {
        if (props[k].i !== props[k - 1].i + 1) continue;
        assert.notEqual(props[k].kind, props[k - 1].kind,
          `${mode} 种子 ${seed}：第 ${props[k - 1].i} 槽和第 ${props[k].i} 槽都长出了 ${props[k].kind}`);
      }
    }
  }
});

test("过一圈不算完：涨圈数、推 `lap` 事件，但不判冲线", () => {
  const w = build({ seed: 21, bots: 1 });
  const r = w.racers[0];
  w.events.length = 0;
  r.z = w.track.length;
  assert.equal(crossFinish(w, r), false, "过一圈就被判冲线了");
  assert.equal(r.finished, false);
  assert.equal(r.lap, 2, "圈数该涨到 2");
  const laps = w.events.filter(e => e.k === "lap");
  assert.equal(laps.length, 1, "过线没有播报");
  assert.equal(laps[0].l, 2, "事件里的圈数不对");
  assert.equal(laps[0].n, w.track.laps, "事件得带上总圈数，播报条才知道还剩几圈");
  assert.equal(laps[0].h, r.kind === "human");
  // 第二圈：圈数继续涨，仍然不算完。
  w.events.length = 0;
  r.z = w.track.length * 2;
  assert.equal(crossFinish(w, r), false);
  assert.equal(r.lap, 3);
  assert.equal(w.events.filter(e => e.k === "lap").length, 1);
  // 第三圈的尽头才是终点。
  w.events.length = 0;
  r.z = w.track.totalLength;
  assert.equal(crossFinish(w, r), true, "三圈跑完还不判冲线");
  assert.equal(r.finished, true);
  assert.equal(w.events.find(e => e.k === "finish").r, 1, "第一个冲线的名次是 1");
  // 冲线之后再越线不该再报一次圈。
  w.events.length = 0;
  r.z = w.track.totalLength + 40;
  assert.equal(crossFinish(w, r), false);
  assert.equal(w.events.length, 0, "冲线之后还在报圈数");
});

test("只跑完一圈：一局不会结算", () => {
  const w = build({ seed: 33, bots: 2 });
  w.racers.forEach(r => { r.z = w.track.length + 5; });
  run(w, seconds(1));
  assert.equal(w.results, null, "刚跑完一圈就结算了");
  assert.equal(w.phase, "live");
  assert.equal(w.racers[0].lap, 2, "圈数该涨到 2");
});

test("三圈跑完才结算：所有人冲线 → 名次按冲线时刻排", () => {
  const w = build({ seed: 44, bots: 2 });
  w.racers.forEach((r, i) => {
    r.lap = w.track.laps;
    r.z = w.track.totalLength + i; // 差一米，名次就是确定的
  });
  run(w, seconds(1));
  assert.ok(w.results, "三圈跑完没有结算");
  assert.equal(w.results.reason, "all_finished");
  assert.equal(w.results.players.length, w.racers.length);
  // 名次就是冲线次序：每人差一米出发，谁先到是确定的。
  assert.deepEqual(w.results.players.map(p => p.rank), w.racers.map((_, i) => i + 1));
  assert.deepEqual(w.results.players.map(p => p.name), w.racers.map(r => r.name));
});

test("计时上限与地上的家伙都跟着圈数放大", () => {
  const w = build({ seed: 5, bots: 1 });
  assert.equal(w.timeLimit, TIME_LIMIT_PER_LAP * w.track.laps, "计时门限没跟着圈数走");
  assert.ok(w.timeLimit > TIME_LIMIT_PER_LAP, "三圈的门限该比一圈宽三倍");
  assert.equal(TIME_LIMIT, TIME_LIMIT_PER_LAP * 3, "全局兜底值该是三圈的");
});

test("圈数要过线：地图消息里带着 `laps`，客户端才知道跑几圈", () => {
  const w = build({ seed: 4, bots: 1 });
  const msg = encodeMap(w);
  assert.equal(msg.laps, w.track.laps);
  assert.equal(decodeMap(msg).laps, w.track.laps);
  // 老报文没有 `laps` 时按单程算——不能让一个缺字段变成 `undefined` 圈。
  assert.equal(decodeMap({ ...msg, laps: undefined }).laps, 1);
});
