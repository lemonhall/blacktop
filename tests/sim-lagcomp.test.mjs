/**
 * 打击判定的"回看"与"窗口宽度"。
 *
 * 这一份对着的是一条线上的实测结论：**人打不着，不是因为手慢，是因为他瞄的那个
 * 世界和判定用的那个世界不是同一个**。玩家看到的画面是 `插值 0.14 秒 + 一个单程`
 * 之前的，而判定发生在命令飘到服务端之后——一来一回差出 0.2~0.3 秒。对向车在这
 * 个错位里能跑十几米。
 *
 * 两个不变式，各自对应一条曾经真实成立过的 bug：
 *   1. **回看**：拿"我看见的那一刻"去判，就该还原我看见的那个距离；
 *   2. **车长不吃窗口**：踹一台 16.5 米的半挂，和踹一台 4.6 米的轿车，留给玩家的
 *      时间必须一样长——旧写法量车身中心，半挂的窗口只剩 65 毫秒，车越大越踢不着。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DT, LANE_W, TICK_HZ } from "../sim/constants.mjs";
import { build } from "./helpers.mjs";
import { attack, punchTarget, TUNE } from "../sim/racer.mjs";
import { kickTarget, spawnTraffic, stepTraffic, VEHICLES } from "../sim/traffic.mjs";
import { REWIND_MAX, poseAt, recordHistory, resetHistory } from "../sim/history.mjs";
import { pushCmd, resetQueue, takeCmd } from "../sim/netcode.mjs";

/** 两台并排的车，位置由测试摆；`w.time` 也由测试定，因为回看是要看时刻的。 */
function pair(seed = 100) {
  const w = build({ seed, bots: 2, humans: [] });
  const [a, b] = w.racers;
  w.countdown = 0;
  w.events.length = 0;
  a.x = 0; a.z = 1000; a.v = 30;
  b.x = 0; b.z = 1000; b.v = 30;
  return { w, a, b };
}

test("回看：出手那一刻他在窗里、现在跑远了——用那一刻判，够得着", () => {
  const { w, a, b } = pair();
  b.z = a.z + 2.4;            // 出手时：正前方两米四
  w.time = 12;
  resetHistory(w);
  recordHistory(w);           // 记下"我按下键的那一刻"
  b.z = a.z + 60;             // 命令飘到服务端的这 0.2 秒里，他跑出去五十八米

  const pose = poseAt(w, 12);
  assert.ok(pose, "历史里有这一刻");
  assert.ok(punchTarget(w, a, 1, 0, pose), "回到那一刻：他就在眼前，打得着");
  assert.equal(punchTarget(w, a, 1, 0), null, "不回看（按'服务端此刻'算）就够不着——这正是改版前的症状");
});

test("出手的人自己也回到那一刻：只回看目标会让相对距离算错", () => {
  const { w, a, b } = pair();
  // 出手那一刻两人**几乎并排**（差 0.2 米）：a 落后一点点
  a.z = 1000; b.z = 1000.2;
  w.time = 20;
  resetHistory(w);
  recordHistory(w);
  // 之后 a 追了过去、b 落在后面很远——若只回看 b 不回看 a，相对距离就成了"a 在前 b 在后"
  a.z = 1060;

  const pose = poseAt(w, 20);
  const target = punchTarget(w, a, 1, 0, pose);
  assert.equal(target, b, "回到那一刻，正前方那 0.2 米里的人就是 b");
});

test("回看有上限：报一个很久以前的时刻，也只能回到 REWIND_MAX 之内", () => {
  const w = build({ seed: 5, bots: 1, humans: [] });
  w.countdown = 0;
  resetHistory(w);
  for (let i = 0; i < 60; i++) { w.time = i * DT; recordHistory(w); }
  const pose = poseAt(w, 0);
  assert.ok(pose, "夹过之后仍然要给出一个能用的位姿");
  // 给的帧是"不晚于目标时刻的最近一帧"，所以允许一格（1/60 秒）的量化误差。
  assert.ok(pose.t >= w.time - REWIND_MAX - DT - 1e-9,
    `回看被夹在 ${REWIND_MAX} 秒之内，实际 ${pose.t}`);
  assert.equal(poseAt(w, Number.NaN), null, "非法时刻退回'用当下'");
  assert.ok(poseAt(w, w.time + 5).t <= w.time, "报一个未来的时刻，会被夹回当下");
});

test("没有历史的场合（机器人、本地预测）一律退回当下坐标，不报错", () => {
  const { w, a, b } = pair();
  b.z = a.z + 2.4;
  w.hist = null;
  assert.equal(poseAt(w, 1), null);
  assert.ok(punchTarget(w, a, 1, 0, null), "没有回看就按当下算，判定照常成立");
});

/** 从远处开到贴脸，数一数"还没撞上、但已经够得着"的格数。 */
function approachTicks(kind) {
  const w = build({ seed: 9, bots: 1, humans: [] });
  const a = w.racers[0];
  w.countdown = 0;
  a.x = 0; a.z = 0; a.v = 0;                 // 骑士站着不动，相对速度全由车提供
  const v = spawnTraffic(w, 400, kind);
  v.dir = -1; v.x = 0; v.z = 40; v.v = 20;
  const contact = (VEHICLES[kind].len + 2.2) / 2;   // `collideTraffic` 判定重叠的那条线
  let n = 0;
  for (let i = 0; i < 4 * TICK_HZ; i++) {
    stepTraffic(w, DT);
    if (v.z - a.z <= contact) break;                // 已经撞上了，后面的不算机会
    if (kickTarget(w, a)) n++;
  }
  return n;
}

test("车长不吃窗口：半挂和轿车留给玩家的时间一样长", () => {
  const car = approachTicks("car");
  const truck = approachTicks("dayun");
  assert.ok(car > 20, `轿车应该有一段时间可踢，实际 ${car} 格`);
  assert.ok(Math.abs(car - truck) <= Math.max(2, car * 0.1),
    `半挂(${truck} 格) 与轿车(${car} 格) 的窗口必须基本相等——旧写法下它们差两倍多`);
});

test("踹车窗口由'到车面的距离'决定，与车长无关（这条是那条 bug 的根）", () => {
  const w = build({ seed: 9, bots: 1, humans: [] });
  const a = w.racers[0];
  w.countdown = 0;
  a.x = 0; a.z = 0; a.v = 0;
  for (const kind of ["car", "bus", "dayun"]) {
    const v = spawnTraffic(w, 400, kind);
    v.dir = -1; v.x = 0; v.v = 20;
    // 车头离我 `kickReach` 米：三种车都该在窗内
    v.z = a.z + VEHICLES[kind].len / 2 + TUNE.kickReach - 0.05;
    assert.ok(kickTarget(w, a), `${kind}：车头差 ${TUNE.kickReach} 米，够得着`);
    // 车头离我 `kickReach + 1` 米：三种车都该在窗外
    v.z = a.z + VEHICLES[kind].len / 2 + TUNE.kickReach + 1;
    assert.equal(kickTarget(w, a), null, `${kind}：车头差 ${TUNE.kickReach + 1} 米，够不着`);
    w.traffic.length = 0;
  }
});

test("横向窗口必须盖得住大半条车道：'贴着骑'不能只是错觉", () => {
  assert.ok(TUNE.reachX > LANE_W * 0.6,
    `出拳横向窗口 ${TUNE.reachX} 米，对着 ${LANE_W} 米的车道宽太窄——邻道那台车画面上明明贴着，判定却够不着`);
  assert.ok(TUNE.kickX > LANE_W, "踹车的横向窗口至少要有整整一条车道，否则只能踢正对着的那台");
});

test("`vt` 跟着动作位走同一条生命期：第一格带出去，后面的格不带", () => {
  const a = { x: 0, z: 0 };
  resetQueue(a);
  pushCmd(a, { sq: 1, th: 1, br: 0, st: 0, act: 1, nos: 0, n: 2, vt: 42.5 }, 0);
  assert.equal(takeCmd(a).vt, 42.5, "第一格带上'我看见的时刻'");
  assert.equal(takeCmd(a).vt, undefined, "第二格不该再带一次");
});

test("回看是真的能改变结果：同一次出手，带不带 vt 的答案不同", () => {
  const { w, a, b } = pair();
  b.z = a.z + 3.0;
  w.time = 7;
  resetHistory(w);
  recordHistory(w);
  b.z = a.z + 200;
  assert.equal(attack(w, a, 1, poseAt(w, 7)), true, "带 vt：打得中");
  const first = w.events.find(e => e.k === "hit");
  assert.ok(first && first.b === b.id);
  a.attackCd = 0;
  assert.equal(attack(w, a, 1), false, "不带 vt：只剩挥空");
  assert.ok(w.events.some(e => e.k === "whiff"));
});
