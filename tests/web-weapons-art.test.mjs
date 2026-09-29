/**
 * 家伙的**画法**（`web/js/weaponsart.mjs`）。
 *
 * 美术没法自动断言"好不好看"，但它的**契约**可以：每一件都得画得出来、七件不能
 * 长得一模一样、`save()` 必须和 `restore()` 配平（少一次 restore，这一帧之后整条
 * 渲染管线都会带着那个变换跑——画面上是"所有东西突然全歪了"，查起来极其费劲）。
 *
 * 用一个记账用的假 ctx 把每条绘制指令收下来。不引入任何依赖，也只验形状。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { WEAPONS } from "../sim/weapons.mjs";
import { drawHeld, drawPickup } from "../web/js/weaponsart.mjs";

/** 只记账的 canvas 上下文：把每条指令连参数一起收下来。 */
function recorder() {
  const ops = [];
  const rec = name => (...args) => { ops.push({ op: name, args }); };
  return {
    ops,
    fillStyle: "", strokeStyle: "", lineWidth: 1, lineCap: "", lineJoin: "", globalAlpha: 1,
    save: rec("save"), restore: rec("restore"),
    translate: rec("translate"), rotate: rec("rotate"), scale: rec("scale"),
    beginPath: rec("beginPath"), closePath: rec("closePath"),
    moveTo: rec("moveTo"), lineTo: rec("lineTo"), arc: rec("arc"), arcTo: rec("arcTo"),
    ellipse: rec("ellipse"), quadraticCurveTo: rec("quadraticCurveTo"),
    fill: rec("fill"), stroke: rec("stroke"),
  };
}

const count = (ops, op) => ops.filter(o => o.op === op).length;
/** 一幅画的"指纹"：多少笔填充、多少笔描边、多少个点。形状一样它就一样。 */
const signature = ops => `${count(ops, "fill")}/${count(ops, "stroke")}/${count(ops, "lineTo") + count(ops, "arc")}`;
/** 更细的指纹：连坐标一起比。用来验"挥出去那一下真的动了"。 */
const pose = ops => ops
  .map(o => `${o.op}(${o.args.map(a => Math.round(Number(a) * 1000) / 1000).join(",")})`)
  .join(" ");

test("每一件家伙都画得出来，空手什么都不画", () => {
  for (const spec of WEAPONS) {
    const ctx = recorder();
    drawHeld(ctx, spec.id, 0.4);
    if (spec.id === "fist") {
      assert.equal(ctx.ops.length, 0, "空手没有形状：它由 `drawSwing` 的拳头负责");
      continue;
    }
    const strokes = count(ctx.ops, "fill") + count(ctx.ops, "stroke");
    assert.ok(strokes >= 2, `${spec.name} 只画了 ${strokes} 笔，那不是一件家伙，那是一道划痕`);
  }
});

test("七件不能长成一个样", () => {
  const seen = new Map();
  for (const spec of WEAPONS) {
    if (spec.id === "fist") continue;
    const ctx = recorder();
    drawHeld(ctx, spec.id, 0);
    const sig = signature(ctx.ops);
    assert.ok(!seen.has(sig), `${spec.name} 和 ${seen.get(sig)} 画出来一模一样——玩家分不出手里是什么`);
    seen.set(sig, spec.name);
  }
  assert.equal(seen.size, 7);
});

test("save/restore 必须配平：少一次 restore 会污染后面所有东西", () => {
  for (const spec of WEAPONS) {
    const ctx = recorder();
    drawHeld(ctx, spec.id, 0.5);
    const opens = count(ctx.ops, "save"), closes = count(ctx.ops, "restore");
    assert.equal(opens, closes, `${spec.id}: save ${opens} 次、restore ${closes} 次`);
  }
});

test("挥出去那一下要有变化：`k` 不能是个摆设", () => {
  for (const id of ["prod", "oilcan", "mace", "chain"]) {
    const rest = recorder(); const strike = recorder();
    drawHeld(rest, id, 0);
    drawHeld(strike, id, 0.9);
    if (id === "chain") continue;   // 鞭子本身不变形，甩出去靠父级的旋转变换
    assert.ok(pose(rest.ops) !== pose(strike.ops),
      `${id} 挥出去和举着画得一模一样——"这一下打出去了"就没有视觉反馈了`);
  }
});

test("躺在地上那件：有影子、有形状，充能的还多一层可捡的光环", () => {
  const plain = recorder();
  drawPickup(plain, 100, 200, 3, "club", 0);
  assert.ok(count(plain.ops, "ellipse") >= 1, "地上那件要有影子，否则像浮在半空");
  assert.ok(count(plain.ops, "fill") >= 2, "影子之外还得画出家伙本身");

  const charged = recorder();
  drawPickup(charged, 100, 200, 3, "mace", 7);
  const spent = recorder();
  drawPickup(spent, 100, 200, 3, "mace", 0);
  assert.ok(count(charged.ops, "fill") > count(spent.ops, "fill"), "还剩几次的，地上也该看得出来");
  assert.ok(count(charged.ops, "ellipse") > count(spent.ops, "ellipse"), "充能的光环没了才说明它真的用光了");
  assert.ok(count(spent.ops, "fill") >= 2, "用光不等于看不见：地上那件还等着人捡");
});

test("画不出来的东西不该把渲染循环带崩", () => {
  const ctx = recorder();
  assert.doesNotThrow(() => drawHeld(ctx, "bazooka", 0));
  assert.doesNotThrow(() => drawPickup(ctx, 0, 0, 0, "", 0));
  assert.doesNotThrow(() => drawPickup(ctx, 0, 0, 0, "chain", 0), "距离太远（ppm≈0）时直接跳过");
  assert.equal(ctx.ops.length, 0);
});
