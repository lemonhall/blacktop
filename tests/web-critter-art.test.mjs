/**
 * 路上那些畜生的画法契约（`web/js/critters.mjs`）。
 *
 * 畜生和车流不一样：车流是"撞上去就减速"，畜生是**能踹飞**的，所以它的画法里
 * 多了一种姿态——在天上翻滚。这一层要管住三件事：
 *
 *   1. 六种畜生（`sim/critters.mjs` 的表说了算）**每一种都得有画法**。表里加了
 *      一头牛、画法忘了写，那头上路时就是一团看不见的东西，撞上去还以为撞了空气。
 *   2. **两两不能长得一样**——都画成一个方块是最省事、也最丢人的做法。
 *   3. 朝左走的必须真的镜像过；被踹飞之后投影要收掉、本体还得在，而且**脏数据
 *      （NaN、超小比例、不认识的种类）不能把渲染循环炸掉**。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { CRITTERS } from "../sim/critters.mjs";
import { drawCritter, hasCritterArt } from "../web/js/critters.mjs";
import { assertBalanced, assertSane, fingerprint, spyCtx } from "./helpers/spy-ctx.mjs";

test("六种畜生每一种都有自己的画法，两两长得不一样", () => {
  const seen = new Map();
  for (const kind of Object.keys(CRITTERS)) {
    assert.equal(hasCritterArt(kind), true, `${kind} 没有画法——它会在路上凭空撞到空气`);
    const spy = spyCtx();
    const info = CRITTERS[kind];
    drawCritter(spy.ctx, {
      cx: 640, baseY: 700, s: 12, kind, dir: 1, spin: 0, air: 0, w: info.len, h: info.h,
    });
    assertBalanced(spy.ops, kind);
    assertSane(spy.ops, spy.invalid, kind);
    const fp = fingerprint(spy.ops);
    assert.ok(!seen.has(fp), `${kind} 和 ${seen.get(fp)} 画出来一模一样`);
    seen.set(fp, kind);
  }
  assert.equal(seen.size, Object.keys(CRITTERS).length);
});

test("朝左走的畜生是镜像过的：同一头牛两个方向不能画成一幅画", () => {
  for (const kind of Object.keys(CRITTERS)) {
    const info = CRITTERS[kind];
    const draw = dir => {
      const spy = spyCtx();
      drawCritter(spy.ctx, { cx: 0, baseY: 0, s: 12, kind, dir, air: 0, w: info.len, h: info.h });
      assertSane(spy.ops, spy.invalid, `${kind} dir=${dir}`);
      return fingerprint(spy.ops);
    };
    assert.notEqual(draw(1), draw(-1), `${kind} 不管朝哪走都是同一个方向`);
  }
});

test("被踹飞、弹到天上的畜生：投影没了，本体还得在；脏数据也不炸", () => {
  for (const kind of Object.keys(CRITTERS)) {
    const info = CRITTERS[kind];
    const air = spyCtx();
    drawCritter(air.ctx, {
      cx: 0, baseY: 0, s: 12, kind, dir: -1, spin: 2.4, air: 5, w: info.len, h: info.h,
    });
    assertBalanced(air.ops, `${kind} 在天上`);
    assertSane(air.ops, air.invalid, `${kind} 在天上`);
    assert.ok(air.ops.length > 0, `${kind} 飞起来之后一笔不画了`);
  }
  for (const o of [
    { kind: "cow", s: 12, w: NaN }, { kind: "unknown", s: 12, w: 2, h: 2 },
    { kind: "deer", s: 12, w: 2, h: 2, spin: NaN, air: -1 },
    { kind: "goose", s: 0.01, w: 1, h: 1 },
  ]) {
    const spy = spyCtx();
    drawCritter(spy.ctx, { cx: 0, baseY: 0, dir: 1, ...o });
    assertBalanced(spy.ops, `脏数据 ${JSON.stringify(o)}`);
  }
});
