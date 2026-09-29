/**
 * 十三种车的**画法契约**。
 *
 * 颜色好不好看没法自动断言，但这一版新加的东西恰好留下一批能断言的关系：
 *   - **一台车一种长相**：分发表里漏掉一行，症状是"路上跑着一台轿车形状的公交"，
 *     这种事故只能靠指纹比对抓；
 *   - **踹瘪必须看得见**：`dmg` 从 0 走到 1 的过程是这一脚的全部表现力。
 *     如果它画完和崭新那台一模一样，玩家只会看到一台车原地转圈飞出去；
 *   - **伤是长出来的，不是换贴图**：`dmg` 越深，笔数越多、颜色越多。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { VEHICLES } from "../sim/traffic.mjs";
import { drawVehicle, hasArt } from "../web/js/vehicles.mjs";
import { assertBalanced, assertSane, fingerprint, spyCtx } from "./helpers/spy-ctx.mjs";

const KINDS = Object.keys(VEHICLES);
/** 它们在游戏里真实的样子：同向看到车尾，对向看到车头。 */
const dirOf = kind => ((VEHICLES[kind] || {}).side === "oncom" ? -1 : 1);

function paint(kind, o = {}) {
  const spy = spyCtx();
  drawVehicle(spy.ctx, {
    kind, id: 3, cx: 640, baseY: 700, s: 20, dir: dirOf(kind), ...o,
  });
  return spy;
}

test("十三种车每一种都有自己的画法，分发表里一个都不缺", () => {
  assert.equal(KINDS.length, 13);
  for (const kind of KINDS) assert.equal(hasArt(kind), true, `${kind} 没有画法，会静默退回轿车`);
  assert.equal(hasArt("hovercraft"), false, "不认识的车型不该说有画法");
});

test("十三种车两两长得不一样", () => {
  const seen = new Map();
  for (const kind of KINDS) {
    const spy = paint(kind);
    assertBalanced(spy.ops, kind);
    assertSane(spy.ops, spy.invalid, kind);
    const fp = fingerprint(spy.ops);
    assert.ok(!seen.has(fp), `${kind} 和 ${seen.get(fp)} 画出来一模一样`);
    seen.set(fp, kind);
  }
  assert.equal(seen.size, KINDS.length);
});

test("每一台车被踹瘪之后画出来都不是原来的样子，而且笔数只多不少", () => {
  for (const kind of KINDS) {
    const fresh = paint(kind, { dmg: 0 });
    const beaten = paint(kind, { dmg: 1 });
    assertBalanced(beaten.ops, `${kind} 被踹瘪`);
    assertSane(beaten.ops, beaten.invalid, `${kind} 被踹瘪`);
    assert.notEqual(fingerprint(fresh.ops), fingerprint(beaten.ops),
      `${kind} 被踹飞了，画面上却和崭新那台一模一样`);
    assert.ok(beaten.ops.length > fresh.ops.length,
      `${kind} 挨了一脚反而画得更少了：${fresh.ops.length} → ${beaten.ops.length}`);
  }
});

test("伤是长出来的：踹瘪之后多出来的是褶皱、凹坑、碎玻璃那几种颜色", () => {
  for (const kind of KINDS) {
    const before = new Set([...paint(kind, { dmg: 0 }).fills, ...paint(kind, { dmg: 0 }).strokes]);
    const spy = paint(kind, { dmg: 1 });
    const after = [...spy.fills, ...spy.strokes];
    const fresh = after.filter(c => typeof c === "string" && !before.has(c));
    assert.ok(fresh.length > 0, `${kind} 被踹瘪之后一笔新颜色都没有`);
  }
});

test("同一台车的伤随 dmg 单调地长：三档不能有两档画出同一幅画", () => {
  for (const kind of KINDS) {
    const d = [0.15, 0.5, 1].map(dmg => {
      const spy = paint(kind, { dmg });
      assertSane(spy.ops, spy.invalid, `${kind} dmg=${dmg}`);
      return fingerprint(spy.ops);
    });
    assert.notEqual(d[0], d[1], `${kind} 在 dmg 0.15 和 0.5 上长得一样`);
    assert.notEqual(d[1], d[2], `${kind} 在 dmg 0.5 和 1 上长得一样`);
  }
});

test("被踹飞、弹到天上的车：投影没了，但本体还得在", () => {
  for (const kind of KINDS) {
    const spy = paint(kind, { air: 3, dmg: 0.8, spin: 1.2 });
    assertBalanced(spy.ops, `${kind} 在天上`);
    assertSane(spy.ops, spy.invalid, `${kind} 在天上`);
    const ground = paint(kind, { air: 0, dmg: 0.8 });
    assert.ok(spy.ops.length > 0, `${kind} 飞起来之后就一笔不画了`);
    assert.ok(spy.ops.length <= ground.ops.length + 2,
      `${kind} 飞在天上反而比在地上画得还多：${spy.ops.length} vs ${ground.ops.length}`);
  }
});

test("脏数据不该把渲染循环带崩：dmg 越界、方向缺失、名字不认识", () => {
  for (const o of [
    { kind: "car", dmg: -3 }, { kind: "car", dmg: 9 }, { kind: "car", dmg: NaN },
    { kind: "police", dir: 0 }, { kind: "whatisthis" }, { kind: "trike", spin: -7, air: 99 },
  ]) {
    const spy = paint(o.kind, o);
    assertBalanced(spy.ops, `脏数据 ${JSON.stringify(o)}`);
    assert.deepEqual(spy.invalid, []);
  }
});
