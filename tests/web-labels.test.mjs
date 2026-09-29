/**
 * 世界文字的贴图缓存（`web/js/labels.mjs`）。
 *
 * 名字牌是整条渲染管线上最贵的一笔（`strokeText` 每帧只发三次，却比 `fillText`
 * 贵十倍）。缓存它当然划算，但有两条必须钉住的契约：
 *   - **摆位一致**：`y` 仍然是**基线**。烘成贴图之后如果按"贴图中心"摆，
 *     所有人的名字都会往上飘半行——这种错很容易被当成"美术改过"而漏掉。
 *   - **没有字形度量就现画**：`node --test` 里的假上下文没有 `measureText`，
 *     量不出宽度就烘不出来，这时候必须老老实实现画，而不是画一块空白。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { clearLabels, label, labelCacheSize } from "../web/js/labels.mjs";
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
