/**
 * 光的**画法契约**（`web/js/art.mjs` 的 `bloom` / `withAlpha`、`web/js/parts.mjs`
 * 的 `bulb`）。
 *
 * 这里不验"好不好看"——验的是一条栽过跟头的规矩：**光晕的亮度必须从圆心一路
 * 往外掉**。上一版 `bloom` 的前 45% 半径和圆心同一个颜色（一个平台），于是半径
 * 一大的光晕就不是光，而是一张边缘微柔的圆饼：迎面开来的大运两盏远光（半径 1.1
 * 米）开到眼前时，路面上会压着两块直径两米多的暖白灰饼，车本身反而被盖住。
 * 远处的路灯在天上留下的那枚圆币，是 `bulb` 里同一个毛病的另一份。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { bloom, withAlpha } from "../web/js/art.mjs";
import { bulb } from "../web/js/parts.mjs";
import { countOps, spyCtx } from "./helpers/spy-ctx.mjs";

/** 一串颜色停靠点里的 alpha，按停靠点顺序。`rgba(r,g,b,a)` 与 `#rrggbb` 都认。 */
const alphas = stops => stops.map(({ color }) => {
  const m = /rgba?\(([^)]+)\)/iu.exec(String(color));
  if (!m) return 1;
  const parts = m[1].split(",").map(v => Number(v.trim()));
  return parts.length > 3 ? parts[3] : 1;
});

const stopsOf = ops => {
  const made = ops.filter(([name]) => name === "createRadialGradient");
  assert.equal(made.length, 1, "一次光晕只该建一个径向渐变");
  return made[0][1][made[0][1].length - 1].stops;
};

test("光晕：亮度从圆心一路往下掉，边缘落在 0 上", () => {
  const { ctx, ops } = spyCtx();
  bloom(ctx, 0, 0, 1.1, "rgba(255,246,207,.5)", 0.9);
  const a = alphas(stopsOf(ops));
  assert.ok(a.length >= 4, `停靠点太少（${a.length} 个），衰减一定是阶跃`);
  assert.ok(a[0] > a[1] && a[1] > a[2], `衰减不单调：${a.join(" → ")}`);
  assert.equal(a[a.length - 1], 0, "最外圈必须完全透明，否则光晕有一圈硬边");
  // 中段不许出现"平台"：相邻两档之间必须真的在掉，而且掉得动
  for (let i = 1; i < a.length - 1; i++) {
    assert.ok(a[i] < a[i - 1], `第 ${i} 档和第 ${i - 1} 档一样浓：${a.join(" → ")}`);
  }
  assert.ok(a[0] <= 0.5 + 1e-9, `中心不该比调用方给的 alpha 还亮：${a[0]}`);
});

test("光晕：画出来的半径就是给的半径，不是它的一半", () => {
  const { ctx, ops } = spyCtx();
  bloom(ctx, 0, 0, 1.1, "#fff", 1);
  const arcs = ops.filter(([name]) => name === "arc");
  assert.equal(arcs.length, 1);
  assert.equal(arcs[0][1][2], 1.1);
  const grad = ops.find(([name]) => name === "createRadialGradient");
  assert.equal(grad[1][5], 1.1, "渐变的半径必须和弧的半径一致");
});

test("withAlpha：只改浓淡，不改颜色", () => {
  assert.equal(withAlpha("rgba(255,246,207,.5)", 0.4), "rgba(255,246,207,0.200)");
  assert.equal(withAlpha("rgba(255,246,207,.5)", 0), "rgba(255,246,207,0.000)");
  assert.equal(withAlpha("rgba(255,246,207,.5)", 9), "rgba(255,246,207,1.000)");
  assert.equal(withAlpha("#ff5fd0", 0.5), "rgba(255,95,208,0.500)");
  assert.equal(withAlpha("瞎写的", 0.5), "瞎写的", "认不出的颜色原样返回，不能炸");
});

test("灯泡的光晕：同样不许有平台，也不能比灯本身还小", () => {
  const { ctx, ops } = spyCtx();
  bulb(ctx, 0, 0, 0.1, "#fff4cf", true, 1.5);
  const a = alphas(stopsOf(ops));
  assert.ok(a[0] > a[1] && a[1] > a[2], `灯泡光晕的衰减不单调：${a.join(" → ")}`);
  assert.equal(a[a.length - 1], 0);
  // 光晕是灯的光晕：必须比灯大一圈，否则"亮"这件事根本看不出来
  const arcs = ops.filter(([name]) => name === "arc");
  assert.ok(arcs[0][1][2] > 0.1 * 2, `光晕半径 ${arcs[0][1][2]} 太小`);
  assert.equal(countOps(ops, "arc"), 3, "灯泡本体 + 高光 + 光晕，三笔");
});
