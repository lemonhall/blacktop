/**
 * 世界文字的贴图缓存（`web/js/labels.mjs`）。
 *
 * 名字牌是整条渲染管线上最贵的一笔（`strokeText` 每帧只发三次，却比 `fillText`
 * 贵十倍）。缓存它当然划算，但有两条必须钉住的契约：
 *   - **摆位一致**：`y` 仍然是**基线**。烘成贴图之后如果按"贴图中心"摆，
 *     所有人的名字都会往上飘半行——这种错很容易被当成"美术改过"而漏掉。
 *   - **没有字形度量就现画**：`node --test` 里的假上下文没有 `measureText`，
 *     量不出宽度就烘不出来，这时候必须老老实实现画，而不是画一块空白。
 *   - **量宽度要用对字体**：线上那句"MISS 的 M 和 S 像被竖着切开"，根因就是
 *     `measureText` 量的是上下文**当前**的字体，而贴图那一步从来没设过它。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { clearLabels, label, labelCacheSize } from "../web/js/labels.mjs";
import { floaterSize } from "../web/js/render.mjs";
import { fakeCanvas } from "./helpers/dom.mjs";
import { countOps, spyCtx } from "./helpers/spy-ctx.mjs";

/** 装上记账的 `document`，并造一个**能报宽度**的上下文（真浏览器就是这样）。 */
function rig() {
  const made = [];
  const prev = globalThis.document;
  globalThis.document = {
    createElement: () => { const c = fakeCanvas(); made.push(c); return c; },
  };
  clearLabels();
  const spy = spyCtx();
  spy.ctx.measureText = text => ({ width: text.length * 12 });
  return { made, spy, done: () => { globalThis.document = prev; clearLabels(); } };
}

test("第一次画：字真的被描进那块小画布", () => {
  const { made, spy, done } = rig();
  try {
    label(spy.ctx, 100, 200, "柠檬叔", "#dfe8ff", 13);
    assert.equal(made.length, 1, "应该正好烘了一张");
    const ops = made[0].__spy.ops;
    assert.equal(countOps(ops, "strokeText"), 1);
    assert.equal(countOps(ops, "fillText"), 1);
    assert.equal(ops.find(([n]) => n === "fillText")[1][0], "柠檬叔");
  } finally { done(); }
});

test("第二次画同一个名字：只有一次 drawImage，不再描一遍字", () => {
  const { made, spy, done } = rig();
  try {
    label(spy.ctx, 100, 200, "柠檬叔", "#dfe8ff", 13);
    const before = made.length;
    const again = spyCtx();
    again.ctx.measureText = () => ({ width: 36 });
    label(again.ctx, 100, 200, "柠檬叔", "#dfe8ff", 13);
    assert.equal(made.length, before, "同一行字不该再烘一张");
    assert.equal(countOps(again.ops, "drawImage"), 1);
    assert.equal(countOps(again.ops, "strokeText"), 0);
    assert.equal(countOps(again.ops, "fillText"), 0);
  } finally { done(); }
});

test("基线对齐：贴图的上边 = 基线上方 top 像素，字不会整体飘走", () => {
  const { made, spy, done } = rig();
  try {
    label(spy.ctx, 100, 200, "柠檬叔", "#dfe8ff", 13);
    const art = made[0];
    const tile = made[0].__spy.ops.find(([n]) => n === "fillText");
    const baseline = tile[1][2];              // 烘的时候字摆在画布内的第几行
    const draw = spy.ops.find(([n]) => n === "drawImage");
    assert.ok(draw, "没贴上去");
    const [, args] = draw;
    assert.equal(args[1], 100 - art.width / 2, "横向要居中");
    assert.equal(args[2], 200 - baseline, "纵向要按基线摆回去");
  } finally { done(); }
});

test("字号 / 颜色 / 文字任一不同：各烘各的", () => {
  const { made, spy, done } = rig();
  try {
    const n = [];
    for (const args of [["甲", "#fff", 12], ["乙", "#fff", 12], ["甲", "#f00", 12], ["甲", "#fff", 20], ["甲", "#fff", 12]]) {
      const before = made.length;
      label(spy.ctx, 0, 0, args[0], args[1], args[2]);
      n.push(made.length - before);
    }
    assert.deepEqual(n, [1, 1, 1, 1, 0], "不同的字必须各烘各的，重复的必须命中");
    assert.equal(labelCacheSize(), 4);
  } finally { done(); }
});

test("量不出宽度就现画：没有 document / 没有 measureText 时不许画空白", () => {
  const spy = spyCtx();
  clearLabels();
  label(spy.ctx, 10, 20, "柠檬叔", "#dfe8ff", 13);
  assert.equal(countOps(spy.ops, "strokeText"), 1);
  assert.equal(countOps(spy.ops, "fillText"), 1);
  assert.equal(countOps(spy.ops, "drawImage"), 0);
});

/**
 * **"MISS 的 M 和 S 像被竖着切开"**——线上原话。
 *
 * `measureText` 量的是上下文**当前**的字体，而贴图那一步以前从来没设过字体：画布刚
 * 建好时它是 `10px sans-serif`，于是不管要烘的是多大的字，量出来的永远是"10 像素
 * 下那一行"。贴图比字形窄一大截，`fillText` 画到画布外面的部分被直接切掉——左右各
 * 少一块，看起来就是被竖着划了两刀。字号越大切得越狠。
 */
test("量宽度用的是要烘的那一号字体：贴图不许比字形窄", () => {
  const made = [];
  const prev = globalThis.document;
  globalThis.document = { createElement: () => { const c = fakeCanvas(); made.push(c); return c; } };
  clearLabels();
  try {
    const spy = spyCtx();
    // 真浏览器的 `measureText` 就是认 `ctx.font` 的：字号翻倍，量出来的宽度也翻倍。
    spy.ctx.measureText = function (text) {
      const px = Number(/(\d+(?:\.\d+)?)px/.exec(this.font || "")?.[1] || 10);
      return { width: text.length * px * 0.6 };
    };
    label(spy.ctx, 0, 0, "MISS", "#dce9ff", 44);
    assert.equal(made.length, 1, "应该烘了一张");
    // 44 像素下 "MISS" 约 4 × 44 × 0.6 ≈ 106 像素宽，留白只加几个像素。
    assert.ok(made[0].width > 100, `贴图只有 ${made[0].width} 像素宽，字形会被左右切掉`);
  } finally {
    globalThis.document = prev;
    clearLabels();
  }
});

test("弹入放大只放大目标矩形，不会为每一个尺寸重新烘一张图", () => {
  const { made, spy, done } = rig();
  try {
    label(spy.ctx, 100, 200, "砰!", "#ffe27a", 20, 1.4);
    assert.equal(made.length, 1, "放大不该再烘一张——跳字是跟着距离连续变大的");
    const draw = spy.ops.filter(([n]) => n === "drawImage").at(-1);
    assert.ok(draw[1][3] > made[0].width, "目标宽度要真的放大");
    const before = made.length;
    label(spy.ctx, 100, 200, "砰!", "#ffe27a", 20, 1);
    assert.equal(made.length, before, "回到原大小仍然打同一张图");
  } finally { done(); }
});

/**
 * 跳字的字号必须封顶。踩过的坑：踹飞的那台车就贴在我车头前面，跳字按 ppm 一路
 * 长到三百多像素——一个字铺满半个屏幕，比当时发生的事还大。
 */
test("跳字跟着距离长，但到顶就停：贴脸的东西不许把字撑满屏幕", () => {
  assert.ok(floaterSize(20, false) < floaterSize(60, false), "远处该比近处小");
  assert.equal(floaterSize(400, false), 28, "普通跳字封顶 28 像素");
  assert.equal(floaterSize(400, true), 44, "大字号的赏金封顶 44 像素");
  assert.ok(floaterSize(900, true) === floaterSize(400, true), "再近也不许继续长");
  assert.ok(floaterSize(20, true) > floaterSize(20, false), "赏金那一档本来就该更大");
  // 第三档（提示语 56）与第四档（只给 MISS 的 68）也要各自封顶，而且彼此不同：
  // "再近也不许继续长"这条对每一档都成立，漏掉哪一档，那一档就会在贴脸时爆掉。
  assert.equal(floaterSize(400, 2), 56, "提示语封顶 56 像素");
  assert.equal(floaterSize(400, 3), 68, "MISS 那一档封顶 68 像素");
  assert.ok(floaterSize(900, 3) === floaterSize(400, 3), "MISS 再近也不许继续长");
});
