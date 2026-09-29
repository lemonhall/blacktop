/**
 * 仪表盘的**画法契约**（`web/js/gauge.mjs`）。
 *
 * 这只表踩过两个只有测试能按住的坑：
 *   1. **针反向 180°**。局部坐标里针尖必须朝 -y，旋转 `角度 + π/2` 之后才指得准。
 *      写成 +y 的时候，115 km/h 会指到 240 上去，而画面上"针确实在动"，肉眼很难判对错。
 *   2. **红区不跟 `redline` 走**。红区起点是个纯参数，谁也不会每次改刻度都手算一遍角度。
 *
 * 所以这里不验"好不好看"，只验这两条：把画出来的点按 `translate/rotate` 真的变换一次，
 * 算出的针尖位置必须落在读数该在的角度上；红弧的起始角必须等于 `redline / max`。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spyCtx, assertBalanced, assertSane, countOps } from "./helpers/spy-ctx.mjs";
import { drawGauge } from "../web/js/gauge.mjs";

const SIZE = 124;
const CENTER = SIZE / 2;
const A0 = Math.PI * 0.78, A1 = Math.PI * 2.22;
const angleOf = k => A0 + (A1 - A0) * k;

const canvas = () => {
  const { ctx, ops, invalid } = spyCtx();
  return { canvas: { width: SIZE, height: SIZE, getContext: () => ctx }, ops, invalid };
};

/**
 * 把 `moveTo/lineTo` 的点按当时的 `translate/rotate` 变换到画布坐标。
 * 只支持平移和旋转——画表就用了这两样，多一点都不需要。
 */
function points(ops) {
  let tx = 0, ty = 0, rot = 0;
  const out = [];
  for (const [name, args] of ops) {
    if (name === "translate") { tx = args[0]; ty = args[1]; }
    else if (name === "rotate") rot = args[0];
    else if (name === "moveTo" || name === "lineTo") {
      const [x, y] = args;
      out.push([tx + x * Math.cos(rot) - y * Math.sin(rot),
        ty + x * Math.sin(rot) + y * Math.cos(rot)]);
    }
  }
  return out;
}

/**
 * 针是整幅画里**唯一**在 `rotate` 之下画出来的东西，所以这样取它最稳：
 * 记住那次 rotate，然后收下到下一个 `restore` 之前的所有点。
 * 局部坐标里 |y| 最大的那个点就是针尖（配重和高光都比它短）。
 */
function needle(ops) {
  let rot = null, tx = CENTER, ty = CENTER, pts = [];
  for (const [name, args] of ops) {
    if (name === "translate") { tx = args[0]; ty = args[1]; }
    else if (name === "rotate") { rot = args[0]; pts = []; }
    else if (name === "restore" && rot !== null) break;
    else if (name === "lineTo" && rot !== null) pts.push(args);
  }
  if (rot === null) return null;
  const local = pts.reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a), [0, 0]);
  return {
    rot,
    local,
    world: [tx + local[0] * Math.cos(rot) - local[1] * Math.sin(rot),
      ty + local[0] * Math.sin(rot) + local[1] * Math.cos(rot)],
  };
}

const draw = (value, max, opts) => {
  const g = canvas();
  drawGauge(g.canvas, value, max, "#6ef0ff", opts);
  return g;
};

test("速度表画得出来，而且干净：save/restore 配平、没有 undefined 颜色、没有 NaN", () => {
  const g = draw(115, 260, {});
  assertBalanced(g.ops, "速度表");
  assertSane(g.ops, g.invalid, "速度表");
  assert.ok(countOps(g.ops, "fillText") >= 8, "刻度数字没画全");
});

test("针尖指着的角度就是读数：0 在左下、一半在正上、满表在右下", () => {
  const faceR = (CENTER - 1) * 0.855;
  for (const [value, k] of [[0, 0], [130, 0.5], [260, 1]]) {
    const n = needle(draw(value, 260, {}).ops);
    assert.ok(n, "没找到指针");
    const [x, y] = n.world;
    const a = angleOf(k);
    const wantX = CENTER + Math.cos(a) * faceR * 0.93;
    const wantY = CENTER + Math.sin(a) * faceR * 0.93;
    assert.ok(Math.hypot(x - wantX, y - wantY) < 1.5,
      `${value} km/h 的针尖在 (${x.toFixed(1)}, ${y.toFixed(1)})，应该在 (${wantX.toFixed(1)}, ${wantY.toFixed(1)})`);
  }
});

test("红区的起点跟着 redline 走，不是写死的", () => {
  const startOf = g => {
    const arc = g.ops.find(([n, a]) => n === "arc" && a[3] !== 0);
    assert.ok(arc, "没画红区");
    return arc[1][3];
  };
  assert.ok(Math.abs(startOf(draw(0, 260, { redline: 220 })) - angleOf(220 / 260)) < 1e-9);
  assert.ok(Math.abs(startOf(draw(0, 9, { redline: 7, minor: 0.5 })) - angleOf(7 / 9)) < 1e-9);
});

test("转速表和速度表是两只不同的表：刻度、单位、小数位都不一样", () => {
  const texts = g => g.ops.filter(([n]) => n === "fillText").map(([, a]) => a[0]);
  const speed = texts(draw(115, 260, { unit: "km/h" }));
  const tach = texts(draw(6.2, 9, {
    unit: "RPM ×1000", major: 1, minor: 0.5, redline: 7, decimals: 1, labelPx: 11,
  }));
  assert.ok(speed.includes("40") && speed.includes("240"), "速度表按 40 一格标数");
  assert.ok(!tach.includes("240"), "转速表不该出现 240");
  assert.ok(tach.includes("8") && tach.includes("9"), "转速表要标到 9 千转");
  assert.ok(tach.includes("RPM ×1000") && speed.includes("km/h"), "单位要各印各的");
  assert.ok(tach.includes("6.2"), "转速留一位小数");
});

test("针真的在动：差一个读数，画出来就不是同一幅画", () => {
  const pose = g => JSON.stringify(points(g.ops));
  assert.notEqual(pose(draw(0, 260, {})), pose(draw(130, 260, {})));
  assert.notEqual(pose(draw(130, 260, {})), pose(draw(260, 260, {})));
});

test("表壳外面那块液晶跟着窗口读数走（含小数位）", () => {
  const node = { textContent: "" };
  globalThis.document = { getElementById: id => (id === "gaugeRSpeed" ? node : null) };
  try {
    draw(6.18, 9, { readout: "gaugeRSpeed", decimals: 1 });
    assert.equal(node.textContent, "6.2");
    draw(115, 260, { readout: "gaugeRSpeed" });
    assert.equal(node.textContent, "115");
  } finally {
    delete globalThis.document;
  }
});
