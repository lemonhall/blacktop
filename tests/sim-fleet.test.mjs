/**
 * 路上的十三种社会车辆。
 *
 * 这里钉的不是"车流会不会动"（那条早有了），而是这一版新加的一条设计承诺：
 * **路上的每一台车都能被一脚踹飞**。大运只是赏金最高的那一台，不是唯一那一台。
 * 于是需要验的东西变成了三组：
 *   - 车型表里每一种都在"可踹"这一侧，而且赏金按车重分档；
 *   - 踹飞的物理是共用的：抛物线、横向漂移、`dmg` 一路长到 1、落地推一条 `boom`；
 *   - 重车飞得矮、轻车飞得高——这是"一脚踹飞一台三轮车"和"一脚踹飞一台半挂"
 *     手感不同的全部来源，所以它值得一条断言。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DT } from "../sim/constants.mjs";
import { build } from "./helpers.mjs";
import { VEHICLES, fling, kickable, spawnTraffic, stepTraffic } from "../sim/traffic.mjs";

const KINDS = Object.keys(VEHICLES);

/** 踹一台出去，然后一格一格推到它消失；顺手记下这条抛物线的最高点。 */
function flightOf(kind, dirX = 1) {
  const w = build({ seed: 7, bots: 1, humans: [] });
  const v = spawnTraffic(w, 50, kind);
  fling(w, v, dirX);
  let peak = 0, dmgMax = 0, boom = null, ticks = 0;
  for (let i = 0; i < 500 && w.traffic.includes(v); i++) {
    stepTraffic(w, DT);
    ticks++;
    peak = Math.max(peak, v.y || 0);
    dmgMax = Math.max(dmgMax, v.dmg || 0);
    if (!boom) boom = w.events.find(e => e.k === "boom") || null;
    w.events.length = 0;
  }
  return { v, peak, dmgMax, boom, ticks, gone: !w.traffic.includes(v) };
}

test("车型表里每一种都能被踹：十三种，一个不漏", () => {
  assert.equal(KINDS.length, 13, "这一版是十三种车——少了一种就是有台车画不出来也踹不动");
  for (const kind of KINDS) assert.equal(kickable(kind), true, `${kind} 踹不动`);
  // 车手不是车流：他对面站着的是一位对手，处理方式该是拳头，不是这一脚。
  for (const notCar of ["racer", "bike", "rider", ""]) {
    assert.equal(kickable(notCar), false, `${notCar} 不该进可踹表`);
  }
});

test("踹飞每一种车都给得起赏金，不是只有大运值钱", () => {
  for (const kind of KINDS) {
    const w = build({ seed: 3, bots: 1, humans: [] });
    const v = spawnTraffic(w, 50, kind);
    assert.equal(fling(w, v, 1), true, `${kind} 踹不飞`);
    assert.equal(v.state, "flung");
    assert.equal(v.cash, VEHICLES[kind].cash, `${kind} 的赏金没跟着车型表走`);
    assert.ok(v.cash >= 100, `${kind} 踹一脚只值 ${v.cash}，没人会去踹`);
    assert.ok(v.y > 0, `${kind} 被踹了却还贴在地上`);
    assert.ok(v.dmg > 0, "起飞那一刻就该有一道口子");
  }
});

test("飞出去的每一台车都会瘪、会落地、会在落地那一下炸开", () => {
  for (const kind of KINDS) {
    const f = flightOf(kind);
    assert.ok(f.gone, `${kind} 飞出去之后没有从世界里消失`);
    assert.ok(f.dmgMax > 0.99, `${kind} 飞到落地只瘪到 ${f.dmgMax.toFixed(2)}`);
    assert.ok(f.boom, `${kind} 落地没有推 boom 事件——那一脚就没有收尾`);
    assert.equal(f.boom.kind, kind);
    assert.equal(f.boom.b, VEHICLES[kind].boom, `${kind} 的爆炸大小没跟着车型表走`);
    assert.ok(f.ticks < 500, `${kind} 飞了 ${(f.ticks * DT).toFixed(1)} 秒还没收工`);
  }
});

test("重的飞得矮、轻的飞得高：一脚踹飞三轮车和踹飞半挂不该是同一个手感", () => {
  const trike = flightOf("trike").peak;
  const dayun = flightOf("dayun").peak;
  const container = flightOf("container").peak;
  assert.ok(trike > dayun * 1.5, `三轮车 ${trike.toFixed(1)} 米、大运 ${dayun.toFixed(1)} 米——轻车没飞起来`);
  assert.ok(trike > container * 1.5, `三轮车 ${trike.toFixed(1)} 米、半挂 ${container.toFixed(1)} 米`);
  assert.ok(dayun > 0.5, `大运只飞了 ${dayun.toFixed(2)} 米，看上去像没踹动`);
});

test("从左边踹和从右边踹，飞出去的方向不一样", () => {
  const right = flightOf("car", 1);
  const left = flightOf("car", -1);
  assert.ok(right.v.x > 0, `从左边踹，车该往右飞，实际 x=${right.v.x.toFixed(1)}`);
  assert.ok(left.v.x < 0, `从右边踹，车该往左飞，实际 x=${left.v.x.toFixed(1)}`);
  assert.ok(Math.abs(right.v.x - left.v.x) > 2, "两边踹的落点几乎一样，方向等于没算");
});

test("已经飞出去的再踹一次不生效（这一脚是幂等的）", () => {
  const w = build({ seed: 5, bots: 1, humans: [] });
  const v = spawnTraffic(w, 50, "bus");
  assert.equal(fling(w, v, 1), true);
  assert.equal(fling(w, v, 1), false);
});
