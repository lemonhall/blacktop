/**
 * 命中标记（那颗美漫的星）的**契约**。
 *
 * "好不好看"没法自动断言，但让这一笔画崩的那几条可以：半径会不会贴脸糊满屏、
 * 看不见的时候有没有白发一堆调用、save/restore 有没有配平、有没有把 undefined
 * 当颜色。这几条每一条都真的踩过，所以每一条都在这里钉住。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { drawHitStar, starRadius } from "../web/js/hitmark.mjs";
import { assertBalanced, assertSane, bounds, countOps, spyCtx } from "./helpers/spy-ctx.mjs";

/** 画一颗星，把记账本一起交出来。 */
function draw(ppm, k, color = "#fff3c4", alpha = 1) {
  const { ctx, ops, invalid } = spyCtx();
  drawHitStar(ctx, 100, 60, ppm, k, color, alpha);
  return { ops, invalid };
}

test("半径跟着份量长，但 `ppm` 要封顶：贴脸那一拳不许糊满屏", () => {
  assert.ok(starRadius(120, 1.5) > starRadius(120, 1), "踹车比打人重");
  assert.ok(starRadius(120, 2.2) > starRadius(120, 1.5), "大运最重");
  assert.equal(starRadius(340, 1), starRadius(120, 1), "`ppm` 超过 120 就不再变大");
  // 屏幕上实际占多宽也是同一件事：封顶之后，贴脸和正常距离画出来一样大。
  const near = bounds(draw(340, 1).ops);
  const far = bounds(draw(120, 1).ops);
  assert.equal(near.x1 - near.x0 > 0, true, "得真的画出了东西");
  assert.equal(Math.round(near.x1 - near.x0), Math.round(far.x1 - far.x0));
});

test("星画在给定的那一格上，不会跑到别的地方去", () => {
  const b = bounds(draw(120, 1).ops);
  assert.ok(b.x0 > 100 - 140 && b.x1 < 100 + 140, `横向跑出了 ${b.x0}..${b.x1}`);
  assert.ok(b.y0 > 60 - 140 && b.y1 < 60 + 140, `纵向跑出了 ${b.y0}..${b.y1}`);
});

test("看不见的时刻一笔都不画：小到 3 像素、或者已经淡到 0.01", () => {
  assert.equal(countOps(draw(120, 0.2, "#fff3c4", 0).ops, "fill"), 0, "淡没了还画就是白发调用");
  assert.equal(countOps(draw(2, 1).ops, "fill"), 0, "两颗像素的星画出来只是脏点");
  assert.ok(countOps(draw(120, 1).ops, "fill") >= 3, "正常时刻要画得出来");
});

test("save/restore 配平，而且不许出现 NaN 或 undefined 颜色", () => {
  const { ops, invalid } = draw(120, 2.2, "#ffe9a0", 0.5);
  assertBalanced(ops, "命中星");
  assertSane(ops, invalid, "命中星");
});

test("轮廓是并集的：先整层粗描底、再把同色填回来，不许每层各描一圈", () => {
  const { ops } = draw(120, 1.2);
  const firstFill = ops.findIndex(([n]) => n === "fill");
  const lastStroke = ops.map(([n]) => n).lastIndexOf("stroke");
  assert.ok(firstFill > 0, "得先有描边");
  // 描边全部落在第一次填充之前，才说明"描底→填回"这个次序是对的。
  assert.ok(lastStroke < firstFill, `有 ${lastStroke - firstFill} 次描边发生在填充之后——那是洋葱圈`);
  assert.ok(countOps(ops, "stroke") >= 3, "三层形状都得参与并集");
  // 三层形状 + 一点白的内芯
  assert.ok(countOps(ops, "fill") >= 4, "层数不够，那颗星会退化成一块色斑");
});

test("内芯是白的：中心那一点过曝的白才是「这一下有多硬」", () => {
  const { ops, fills } = (() => {
    const s = spyCtx();
    drawHitStar(s.ctx, 0, 0, 120, 1.5, "#ffe9a0", 1);
    return s;
  })();
  assert.ok(fills.includes("#fffdf4"), "中心没有白芯");
  assert.ok(fills.includes("#ffe9a0"), "星体本身应该是调用方给的那个颜色");
  assert.ok(ops.length > 0);
});
