/**
 * 碎屑与烟的**画法契约**（`web/js/particles.mjs`）。
 *
 * 撞车是这游戏里最常发生、也最容易被将就的一刻：上一版的烟是"实心圆片 + 一个
 * alpha"，好几团叠在一起就是一碗肥皂泡，能一颗一颗数出来；上一版的火星子是
 * 屏幕上的小方块，看着像撒了一地彩色纸屑。这两条契约钉的就是这两件事——
 * **烟的边缘必须落在 alpha 0 上**，**火星子必须是一道往回拖的划**。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createTrack } from "../sim/track.mjs";
import { buildSlices, createCamera } from "../web/js/road.mjs";
import { drawPuff, drawSpark, puffSprite, sparkWidth, variantOf } from "../web/js/particles.mjs";
import { S } from "../web/js/state.mjs";
import { withDom } from "./helpers/dom.mjs";
import { assertBalanced, gradientStops, spyCtx } from "./helpers/spy-ctx.mjs";

function rig() {
  const track = createTrack({ seed: 4242, mode: "city" });
  Object.assign(S, {
    mode: "city", track, view: { w: 1280, h: 720 },
    me: { x: 0, z: 200, v: 30 }, shake: 0, punch: 0,
  });
  const cam = createCamera(S);
  return { cam, tbl: buildSlices(S, cam), hillAt: track.hillAt };
}

const spark = extra => ({
  x: 0.4, z: 197, y: 0.4, vx: 0, vy: 0, vz: 0,
  life: 0.4, max: 0.5, size: 0.1, color: "#ffd24a", ...extra,
});

/** 画一粒火星，返回它的划有多长（屏幕像素）。 */
function streak(extra) {
  const { cam, tbl, hillAt } = rig();
  const { ctx, ops } = spyCtx();
  drawSpark(ctx, cam, tbl, hillAt, spark(extra));
  assertBalanced(ops, "一粒火星");
  const a = ops.find(o => o[0] === "moveTo");
  const b = ops.find(o => o[0] === "lineTo");
  return a && b ? Math.hypot(b[1][0] - a[1][0], b[1][1] - a[1][1]) : -1;
}

const alphaOf = color => Number(String(color).replace(/^.*,\s*/u, "").replace(/\)$/u, ""));

test("烟是软边的：径向渐变从圆心就开始掉，最外一档 alpha 落在 0", () => {
  withDom(() => {
    // 贴图烘在它自己的小画布上，所以要翻那本账——不是翻 `drawPuff` 的账。
    const color = "rgba(70,62,58,.44)";
    const stopsList = gradientStops(puffSprite(color, 0).__spy.ops);
    assert.ok(stopsList.length > 0, "烟必须先烘一张贴图出来");
    for (const stops of stopsList) {
      assert.ok(stops.length >= 3, "烟必须是带档位的渐变，不是实心圆");
      const alphas = stops.map(alphaOf);
      assert.equal(alphas[alphas.length - 1], 0, "最外一档必须是 0——不然边缘是一刀切下去的硬边");
      for (let i = 1; i < alphas.length; i++) {
        assert.ok(alphas[i] <= alphas[i - 1], `第 ${i} 档比上一档还亮：${stops[i - 1]} → ${stops[i]}`);
      }
    }
    // 贴出去的时候要**摊到 r 的尺寸上**：半径 30 就是一块 60×60 的贴图，中心落在 (100,100)。
    const { ctx, ops, invalid } = spyCtx();
    drawPuff(ctx, 100, 100, 30, color, 0.6);
    assertBalanced(ops, "一团烟");
    assert.deepEqual(invalid, [], "烟里画出了无效的东西");
    const img = ops.find(o => o[0] === "drawImage");
    assert.ok(img, "一团烟最终必须是一次 drawImage");
    assert.deepEqual(img[1].slice(1), [70, 70, 60, 60], "贴图的落点与缩放写错了");
  });
});

test("同一颜色的烟备了三张形状，而且每团烟长得是**定**的", () => {
  withDom(() => {
    const a = puffSprite("rgba(198,178,138,.34)", 0);
    assert.equal(puffSprite("rgba(198,178,138,.34)", 0), a, "同一张形状必须只烘一次（缓存）");
    assert.notEqual(a, puffSprite("rgba(198,178,138,.34)", 1), "不同形状号不能是同一张贴图");
    const p = { x: 1.2, z: 300.5 };
    assert.equal(variantOf(p), variantOf({ ...p }), "同一团烟每一帧必须落到同一个形状上");
    const seen = new Set([0, 1, 2].map(v => variantOf({ x: 0.1 * v, z: 7 * v })));
    assert.ok(seen.size > 1, "一堆烟不能全都长一个样");
  });
});

test("火星子是一道划：跑得越快，拖得越长", () => {
  withDom(() => {
    const slow = streak({ vz: -8 });
    const fast = streak({ vz: -40 });
    const still = streak({ vz: 0 });
    assert.equal(still, 0, "原地爆开的火星子应该是一个点，不该拖一根棍");
    assert.ok(fast > slow, `跑得快的火星子应该拖得更长（${fast.toFixed(1)} 应该大于 ${slow.toFixed(1)}）`);
    assert.ok(slow > 0, "在动的火星子至少要拖出一点尾巴");
  });
});

test("屏幕外的火星子一笔都不画", () => {
  withDom(() => {
    const { cam, tbl, hillAt } = rig();
    for (const extra of [{ x: 400 }, { z: 40 }, { y: 400 }]) {
      const { ctx, ops } = spyCtx();
      drawSpark(ctx, cam, tbl, hillAt, spark(extra));
      assert.equal(ops.filter(o => o[0] === "stroke").length, 0,
        `${JSON.stringify(extra)} 这一粒落在画面外，不该画`);
    }
  });
});

test("火星子的粗细有上限：贴到脸上的那一粒也不许变成巧克力棒", () => {
  assert.equal(sparkWidth(0.26, 400), 6, "二十六厘米的铁屑在 400ppm 下应该有 6 像素的上限");
  assert.equal(sparkWidth(1e-6, 0.5), 1, "再细的火星子也要留一个像素，不然它直接消失");
  assert.ok(sparkWidth(0.1, 20) < sparkWidth(0.1, 34), "同一粒火星，近的本来就该比远的粗");
});

test("火星子的尾巴有上限：近处的快火星子不许拖出一条横跨半屏的杠", () => {
  withDom(() => {
    const len = streak({ vz: -60 });
    assert.ok(len > 40, `六十迈的火星子应该看得出在飞，只拖了 ${len.toFixed(0)} 像素`);
    assert.ok(len <= 90.5, `尾巴被拉到了 ${len.toFixed(0)} 像素；上限应该是 90`);
  });
});
