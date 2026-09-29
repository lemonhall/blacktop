/**
 * 车手与车的**画法契约**（`web/js/sprites.mjs` + `web/js/bike.mjs`）。
 *
 * 这里不验"好不好看"——好看要靠人眼；这里验的是几条一破就出大问题的规矩：
 *   - 十五台车一起画，`save/restore` 必须配平（不配平会让后面所有东西都歪掉）；
 *   - 远景（`detail 0`）必须比近景省：屏幕上的对手常常只有十几像素高，
 *     给他画胎纹只会糊成一团泥；
 *   - 出拳、摔车、氮气、手里那件家伙，每一个都得真的改变画面；
 *   - 脏输入（越界的配色号、没见过的家伙）不能把渲染循环带崩。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { PALETTES } from "../sim/data.mjs";
import { WEAPONS } from "../sim/weapons.mjs";
import { drawBike } from "../web/js/bike.mjs";
import { drawRider } from "../web/js/sprites.mjs";
import { assertBalanced, assertSane, countOps, fingerprint, spyCtx } from "./helpers/spy-ctx.mjs";

const rider = extra => ({ cx: 400, baseY: 700, s: 140, palette: 0, lean: 0, swing: 0, wreck: 0, ...extra });

test("一台车一个人：画得出来，而且 save/restore 配平", () => {
  const { ctx, ops, invalid } = spyCtx();
  drawRider(ctx, rider({}));
  assertBalanced(ops, "车手");
  assertSane(ops, invalid, "车手");
});

test("远中近三档：越远画得越省，但都不能一笔不画", () => {
  const sizes = [8, 20, 140];
  const counts = sizes.map(s => {
    const { ctx, ops } = spyCtx();
    drawRider(ctx, rider({ s }));
    assertBalanced(ops, `s=${s}`);
    return countOps(ops, "fill") + countOps(ops, "stroke");
  });
  assert.ok(counts[0] < counts[1], `远景(${counts[0]} 笔)没有比中景(${counts[1]} 笔)省`);
  assert.ok(counts[1] < counts[2], `中景(${counts[1]} 笔)没有比近景(${counts[2]} 笔)省`);
  for (const [i, n] of counts.entries()) assert.ok(n >= 8, `s=${sizes[i]} 只画了 ${n} 笔`);
});

test("摩托车本体也分远中近：远处不该画胎纹", () => {
  const near = spyCtx();
  drawBike(near.ctx, { palette: PALETTES[0], detail: 2 });
  const far = spyCtx();
  drawBike(far.ctx, { palette: PALETTES[0], detail: 0 });
  assertBalanced(near.ops, "近景车");
  assertSane(near.ops, near.invalid, "近景车");
  const nearOps = near.ops.length, farOps = far.ops.length;
  assert.ok(farOps < nearOps * 0.6, `远景车用了 ${farOps} 条指令，近景 ${nearOps} 条——省得不够`);
});

test("八个配色都画得出来，越界的配色号退回第 0 套", () => {
  for (let pal = 0; pal < PALETTES.length + 3; pal++) {
    const { ctx, ops, invalid } = spyCtx();
    drawRider(ctx, rider({ palette: pal }));
    assertBalanced(ops, `配色 ${pal}`);
    assertSane(ops, invalid, `配色 ${pal}`);
  }
});

test("出拳、摔车、氮气：每一样都得真的改变画面", () => {
  const base = spyCtx();
  drawRider(base.ctx, rider({}));
  const poses = {
    出拳: { swing: 0.14 },
    回身打: { swing: 0.14, swingBack: true },
    摔车: { wreck: 0.4 },
    氮气: { nitro: true },
    压弯: { lean: 0.9 },
  };
  const seen = new Map([[fingerprint(base.ops), "什么都不做"]]);
  for (const [name, extra] of Object.entries(poses)) {
    const { ctx, ops, invalid } = spyCtx();
    drawRider(ctx, rider(extra));
    assertBalanced(ops, name);
    assertSane(ops, invalid, name);
    const fp = fingerprint(ops);
    assert.ok(!seen.has(fp), `${name} 画出来和「${seen.get(fp)}」一模一样`);
    seen.set(fp, name);
  }
});

test("手里每件家伙都画得出来，而且共用同一套挥拳轨迹", () => {
  const shapes = new Set();
  for (const spec of WEAPONS) {
    const { ctx, ops, invalid } = spyCtx();
    drawRider(ctx, rider({ swing: 0.1, weapon: spec.id }));
    assertBalanced(ops, `${spec.name} · 挥`);
    assertSane(ops, invalid, `${spec.name} · 挥`);
    shapes.add(fingerprint(ops));
    const idle = spyCtx();
    drawRider(idle.ctx, rider({ weapon: spec.id }));
    assertBalanced(idle.ops, `${spec.name} · 举`);
    assertSane(idle.ops, idle.invalid, `${spec.name} · 举`);
  }
  assert.equal(shapes.size, WEAPONS.length, "有两件家伙挥起来长得一模一样");
});

test("脏输入不该把渲染循环带崩", () => {
  for (const bad of [
    { palette: -3 }, { palette: 99 }, { weapon: "不存在的家伙" }, { weapon: "" },
    { s: 0 }, { s: -1 }, { swing: 1e9 }, { wreck: 1e9 }, { lean: NaN },
  ]) {
    const { ctx } = spyCtx();
    drawRider(ctx, rider(bad));
  }
});
