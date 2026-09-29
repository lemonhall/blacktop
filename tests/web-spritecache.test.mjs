/**
 * 贴图缓存的**契约**（`web/js/spritecache.mjs` + `web/js/sprites.mjs`）。
 *
 * 缓存最容易出的两类事，都是"看不出来"的那种：
 *   1. **烘歪了**。烘的时候坐标系摆错一个符号，画出来是上下颠倒或整体偏移，
 *      而它每一帧都一样地错——肉眼只会觉得"今天这台车有点怪"。
 *   2. **烘小了**。贴图是一块固定大小的画布，包围盒少留两厘米，头盔顶或者排气管
 *      就被切掉一块。它同样不会报错。
 *
 * 所以这里不去验"贴图是不是比现画好看"，只钉三件事：
 *   - 烘进去的那一串画法，和现画时画的**一模一样**（一笔不差）；
 *   - 贴到屏幕上的那个矩形，**刚好罩得住**现画出来的包围盒；
 *   - 配色 / 细节档 / 号牌不同的车，不许互相串用贴图。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { bakedCount, clearBaked, drawRider } from "../web/js/sprites.mjs";
import { fakeCanvas } from "./helpers/dom.mjs";
import { bounds, countOps, fingerprint, spyCtx } from "./helpers/spy-ctx.mjs";

/** 装上一个会**记账**的 `document`，并把烘出来的每块画布收进 `made`。 */
function withCanvasDom(fn) {
  const made = [];
  const prev = globalThis.document;
  globalThis.document = {
    createElement: () => { const c = fakeCanvas(); made.push(c); return c; },
  };
  clearBaked();
  try {
    fn(made);
  } finally {
    globalThis.document = prev;
    clearBaked();
  }
}

const rider = extra => ({
  cx: 300, baseY: 500, s: 120, palette: 1, lean: 0, swing: 0, wreck: 0,
  nitro: 0, weapon: "", number: 4, ...extra,
});

/** 现画一遍（没有 document，整个模块走直通）拿到基准。 */
function liveOps(extra) {
  const spy = spyCtx();
  drawRider(spy.ctx, rider(extra));
  return spy.ops;
}

test("烘进去的画法和现画的一模一样：一笔不差", () => {
  const live = liveOps({});
  withCanvasDom(made => {
    const spy = spyCtx();
    drawRider(spy.ctx, rider({}));
    assert.equal(made.length, 1, "应该正好烘了一张");
    const baked = made[0].__spy.ops;
    // 烘图的开头是"把那块画布摆到米坐标系上"的两笔，现画的开头是
    // save / translate / rotate / scale 四笔、末尾再收一次 restore。
    // 掐头去尾之后必须逐笔相同。
    assert.equal(baked[0][0], "translate");
    assert.equal(baked[1][0], "scale");
    assert.deepEqual(
      baked.slice(2).map(flat),
      live.slice(4, -1).map(flat),
      "烘出来的那一串画法和现画的不是同一幅画",
    );
  });
});

test("贴上去的矩形罩得住现画的包围盒：头盔顶和影子都不许被裁", () => {
  // `bounds` 已经把每一笔过了一遍当时的变换，所以它给的就是**屏幕坐标**。
  const screen = bounds(liveOps({}));
  withCanvasDom(() => {
    const spy = spyCtx();
    drawRider(spy.ctx, rider({}));
    const draw = spy.ops.find(([name]) => name === "drawImage");
    assert.ok(draw, "没有贴图，缓存没生效");
    const [, args, ctm] = draw;
    const [dx, dy, dw, dh] = args.slice(1);
    // 记下来的是**局部**坐标，先过一遍当时的变换（这里是 translate(300, 500)）。
    const at = (x, y) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
    const [lx, ty] = at(dx, dy);
    const [rx, by] = at(dx + dw, dy + dh);
    // 贴图左上角在 (dx, dy)，右下角在 (dx + dw, dy + dh)。
    assert.ok(lx <= screen.x0 + 0.5 && rx >= screen.x1 - 0.5,
      `贴图横向没罩住：贴图 ${lx.toFixed(1)}..${rx.toFixed(1)}，画到 ${screen.x0.toFixed(1)}..${screen.x1.toFixed(1)}`);
    assert.ok(ty <= screen.y0 + 0.5 && by >= screen.y1 - 0.5,
      `贴图纵向没罩住：贴图 ${ty.toFixed(1)}..${by.toFixed(1)}，画到 ${screen.y0.toFixed(1)}..${screen.y1.toFixed(1)}`);
  });
});

test("第二次画同一台车：只有一次 drawImage，不再重画一百次", () => {
  withCanvasDom(made => {
    const a = spyCtx();
    drawRider(a.ctx, rider({}));
    const built = made.length;
    assert.equal(built, 1, "第一帧应该烘了一张");
    assert.ok(countOps(made[0].__spy.ops, "fill") > 40, "烘的时候应该真的把画画进去");
    assert.equal(countOps(a.ops, "drawImage"), 1, "烘完之后贴上去");
    const b = spyCtx();
    drawRider(b.ctx, rider({}));
    assert.equal(made.length, built, "第二帧不该再烘一张");
    assert.equal(countOps(b.ops, "drawImage"), 1);
    assert.equal(countOps(b.ops, "fill"), 0);
  });
});

test("配色 / 细节档 / 号牌不同的车，不许互相串用贴图", () => {
  withCanvasDom(made => {
    const keys = [];
    for (const extra of [{ palette: 1 }, { palette: 2 }, { s: 20 }, { s: 8 }, { number: 9 }]) {
      const before = made.length;
      const spy = spyCtx();
      drawRider(spy.ctx, rider(extra));
      keys.push(made.length - before);
    }
    assert.deepEqual(keys, [1, 1, 1, 1, 1], "不同的车必须各烘各的");
    // 同一个（配色 + 细节档 + 号牌）再来一次：不该多烘
    const before = made.length;
    drawRider(spyCtx().ctx, rider({ palette: 2 }));
    assert.equal(made.length, before, "同样的组合应该命中缓存");
  });
});

test("会动的那几笔仍然现画：出拳 / 举家伙 / 氮气不受贴图影响", () => {
  withCanvasDom(() => {
    for (const extra of [{ swing: 0.2 }, { weapon: "chain" }, { nitro: 1 }]) {
      const spy = spyCtx();
      drawRider(spy.ctx, rider(extra));
      assert.ok(countOps(spy.ops, "stroke") + countOps(spy.ops, "fill") > 0,
        `${JSON.stringify(extra)} 这一笔没画出来——贴图把它盖掉了`);
    }
  });
});

test("没有 document 就现画（node --test 与老浏览器都靠它兜底）", () => {
  assert.equal(typeof globalThis.document, "undefined", "这条测试的前提是没有 DOM");
  const spy = spyCtx();
  drawRider(spy.ctx, rider({}));
  assert.equal(countOps(spy.ops, "drawImage"), 0);
  assert.ok(fingerprint(spy.ops).length > 2000, "兜底路径必须画全套，而不是画个空壳");
});

const flat = ([name, args]) => [name, args.map(a =>
  (typeof a === "number" ? Math.round(a * 1000) / 1000 : String(a)))];
