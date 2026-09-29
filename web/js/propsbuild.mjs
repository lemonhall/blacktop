/**
 * 路边**盖起来的东西**：报刊亭、谷仓、风车、水塔、井架、灯塔、护林站、
 * 山地木屋、筒仓、集装箱、油桶。
 *
 * 这一组是"远处的地标"——玩家在两百米外认出一条路，靠的不是路本身（伪 3D 的路
 * 都是直的），而是这些轮廓：谷仓那个双折屋顶、灯塔那条红白带、井架那个三角。
 * 所以它们的画法第一原则是**剪影要能认**，第二才是近处的细节。
 *
 * 坐标系：米，y 向上，原点在接地点。
 */

import { TAU } from "../../sim/constants.mjs";
import { hash2 } from "../../sim/rng.mjs";
import { hgrad, poly, shade, vgrad } from "./art.mjs";
import {
  bulb, concreteFace, glassPane, label3d, plankFace, rustPatch, snowCap, steelPlate,
} from "./parts.mjs";

/** 一个屋顶：两块斜板 + 脊线 + 檐口的暗边。所有小屋共用它。 */
function gable(ctx, w, y, rh, base, { snow = false } = {}) {
  ctx.fillStyle = hgrad(ctx, -w / 2, w / 2, y, [
    [0, shade(base, 0.3)], [0.42, base], [1, shade(base, -0.4)],
  ]);
  poly(ctx, [[-w * 0.56, y], [0, y + rh], [w * 0.56, y]], ctx.fillStyle);
  ctx.fillStyle = "rgba(255,255,255,.16)";
  poly(ctx, [[-w * 0.56, y], [0, y + rh], [-w * 0.02, y + rh * 0.9]], "rgba(255,255,255,.16)");
  ctx.fillStyle = "rgba(6,9,16,.4)";
  ctx.fillRect(-w * 0.58, y - 0.05, w * 1.16, 0.06);
  if (snow) {
    ctx.fillStyle = "#f4f8ff";
    poly(ctx, [[-w * 0.56, y], [0, y + rh], [w * 0.1, y + rh * 0.78]], "#f4f8ff");
  }
}

/** 报刊亭：一个顶棚、一个亮着的柜台、一张招牌。 */
export function kiosk(ctx, w, h, t, seed) {
  ctx.fillStyle = "rgba(6,9,16,.36)";
  ctx.fillRect(-w * 0.54, 0, w * 1.08, 0.07);
  plankFace(ctx, -w * 0.44, 0, w * 0.88, h * 0.62, t.wood, seed);
  gable(ctx, w * 0.96, h * 0.6, h * 0.22, t.accent, { snow: t.snow });
  const lit = t.night;
  glassPane(ctx, -w * 0.34, h * 0.2, w * 0.68, h * 0.34, { lit });
  ctx.fillStyle = "rgba(6,9,16,.6)";
  ctx.fillRect(-w * 0.4, h * 0.16, w * 0.8, h * 0.05);
  ctx.fillStyle = lit ? "#ffe0a0" : "#e8eef8";
  ctx.fillRect(-w * 0.3, h * 0.72, w * 0.6, h * 0.14);
  label3d(ctx, 0, h * 0.79, h * 0.1, ["报", "烟", "水"][Math.floor(hash2(seed, 3) * 3)], "#12161f");
  if (lit) bulb(ctx, w * 0.3, h * 0.42, 0.05, "#ffe8b0", true, 0.8);
}

/** 谷仓：双折屋顶 + 大门上一个 X + 阁楼窗。荒野上的地标。 */
export function barn(ctx, w, h, t, seed) {
  const wall = "#9c3a2c";
  ctx.fillStyle = "rgba(6,9,16,.4)";
  ctx.fillRect(-w * 0.54, 0, w * 1.08, 0.08);
  ctx.fillStyle = hgrad(ctx, -w / 2, w / 2, h * 0.3, [
    [0, shade(wall, 0.28)], [0.42, wall], [1, shade(wall, -0.46)],
  ]);
  ctx.fillRect(-w / 2, 0, w, h * 0.62);
  ctx.fillStyle = "rgba(0,0,0,.16)";
  for (let i = 0; i < 8; i++) ctx.fillRect(-w / 2 + i * (w / 8), 0, 0.035, h * 0.62);
  // 双折屋顶：先陡后缓两段，这是"谷仓"三个字的一半
  ctx.fillStyle = shade("#8d3325", -0.1);
  poly(ctx, [[-w * 0.56, h * 0.6], [-w * 0.3, h * 0.82], [w * 0.3, h * 0.82], [w * 0.56, h * 0.6]],
    shade("#8d3325", -0.1));
  ctx.fillStyle = "#a8442f";
  poly(ctx, [[-w * 0.3, h * 0.82], [-w * 0.14, h], [w * 0.14, h], [w * 0.3, h * 0.82]], "#a8442f");
  ctx.fillStyle = "rgba(255,255,255,.14)";
  poly(ctx, [[-w * 0.3, h * 0.82], [-w * 0.14, h], [-w * 0.03, h]], "rgba(255,255,255,.14)");
  // 大门 + X
  ctx.fillStyle = "#6f2a20";
  ctx.fillRect(-w * 0.24, 0, w * 0.48, h * 0.36);
  ctx.strokeStyle = "rgba(232,226,210,.8)";
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.moveTo(-w * 0.24, 0);
  ctx.lineTo(w * 0.24, h * 0.36);
  ctx.moveTo(w * 0.24, 0);
  ctx.lineTo(-w * 0.24, h * 0.36);
  ctx.stroke();
  glassPane(ctx, -w * 0.1, h * 0.86, w * 0.2, h * 0.1, { lit: false });
  if (t.snow) snowCap(ctx, -w * 0.56, h * 0.6, w * 1.12, h * 0.05, 0.7);
}

/** 风车：格构塔 + 多叶扇 + 尾舵。荒野上转着的那一台。 */
export function windmill(ctx, w, h, t, seed) {
  const legs = [[-w * 0.2, 0], [w * 0.2, 0], [-w * 0.06, h * 0.7], [w * 0.06, h * 0.7]];
  ctx.strokeStyle = shade(t.steel, -0.2);
  ctx.lineWidth = 0.05;
  for (const [x0, y0] of legs.slice(0, 2)) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(Math.sign(x0) * w * 0.06, h * 0.7);
    ctx.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const f = i / 4;
    const y0 = 0.08 + f * h * 0.6, y1 = y0 + h * 0.16;
    ctx.beginPath();
    ctx.moveTo(-w * 0.19 + f * w * 0.13, y0);
    ctx.lineTo(w * 0.19 - f * w * 0.13, y1);
    ctx.moveTo(w * 0.19 - f * w * 0.13, y0);
    ctx.lineTo(-w * 0.19 + f * w * 0.13, y1);
    ctx.stroke();
  }
  ctx.fillStyle = shade(t.steel, 0.16);
  ctx.fillRect(-w * 0.08, h * 0.68, w * 0.16, h * 0.07);
  // 扇叶：12 片，围着轮毂转
  const cx = 0, cy = h * 0.76, r = w * 0.42;
  ctx.fillStyle = "rgba(228,222,206,.9)";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + hash2(seed, 1);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.fillRect(r * 0.22, -r * 0.09, r * 0.74, r * 0.18);
    ctx.restore();
  }
  ctx.fillStyle = "#3a4049";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.14, 0, TAU);
  ctx.fill();
  ctx.fillStyle = shade(t.steel, 0.1);
  poly(ctx, [[cx, cy + 0.06], [cx + w * 0.5, cy + h * 0.1], [cx + w * 0.5, cy - 0.04]], shade(t.steel, 0.1));
}

/** 水塔：四腿 + 一个大罐 + 梯子 + 落水管。沙漠和荒野上的地标。 */
export function watertower(ctx, w, h, t, seed) {
  const ly = h * 0.42;
  ctx.strokeStyle = shade(t.steel, -0.24);
  ctx.lineWidth = 0.07;
  for (const [x0, x1] of [[-w * 0.42, -w * 0.2], [w * 0.42, w * 0.2], [-w * 0.42, w * 0.2], [w * 0.42, -w * 0.2]]) {
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x1, ly);
    ctx.stroke();
  }
  ctx.lineWidth = 0.035;
  for (const f of [0.3, 0.66]) {
    ctx.beginPath();
    ctx.moveTo(-w * 0.42 + f * w * 0.2, ly * f + 0.1);
    ctx.lineTo(w * 0.42 - f * w * 0.2, ly * f + 0.1);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(6,9,16,.36)";
  ctx.fillRect(-w * 0.44, 0, w * 0.88, 0.06);
  // 罐体
  ctx.fillStyle = hgrad(ctx, -w / 2, w / 2, ly + h * 0.24, [
    [0, shade(t.steel, 0.32)], [0.36, t.steel], [0.74, shade(t.steel, -0.3)], [1, shade(t.steel, -0.52)],
  ]);
  ctx.fillRect(-w * 0.48, ly, w * 0.96, h * 0.4);
  ctx.fillStyle = "#8a6a3a";
  for (const f of [0.34, 0.66]) ctx.fillRect(-w * 0.48, ly + h * 0.4 * f, w * 0.96, 0.04);
  ctx.fillStyle = shade(t.steel, -0.16);
  ctx.beginPath();
  ctx.ellipse(0, ly + h * 0.4, w * 0.48, h * 0.06, 0, 0, Math.PI);
  ctx.fill();
  rustPatch(ctx, -w * 0.48, ly, w, h * 0.4, seed, 0.8);
  // 梯子
  ctx.fillStyle = "#5c6572";
  for (let i = 0; i < 7; i++) ctx.fillRect(w * 0.24 - w * 0.04, ly * i / 7, w * 0.08, 0.03);
  ctx.fillRect(w * 0.22, 0, 0.035, ly + h * 0.4);
  ctx.fillRect(w * 0.3, 0, 0.035, ly + h * 0.4);
}

/** 井架：四腿的格构金字塔 + 天车 + 平台。沙漠干道上"这里在抽油"。 */
export function derrick(ctx, w, h, t, seed) {
  const topW = w * 0.16;
  ctx.fillStyle = "rgba(6,9,16,.4)";
  ctx.fillRect(-w * 0.5, 0, w, 0.07);
  ctx.strokeStyle = shade(t.steel, -0.14);
  for (const side of [-1, 1]) {
    ctx.lineWidth = 0.055;
    ctx.beginPath();
    ctx.moveTo(side * w * 0.44, 0);
    ctx.lineTo(side * topW * 0.5, h);
    ctx.stroke();
    ctx.lineWidth = 0.03;
    for (let i = 0; i < 8; i++) {
      const f0 = i / 8, f1 = (i + 1) / 8;
      const x0 = side * (w * 0.44 + (topW * 0.5 - w * 0.44) * f0);
      const x1 = side * (w * 0.44 + (topW * 0.5 - w * 0.44) * f1);
      ctx.beginPath();
      ctx.moveTo(x0, h * f0);
      ctx.lineTo(x1, h * f1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x1, h * f0);
      ctx.lineTo(x0, h * f1);
      ctx.stroke();
    }
  }
  for (const f of [0.34, 0.66]) {
    ctx.fillStyle = shade(t.steel, -0.3);
    ctx.fillRect(-w * (0.44 - f * 0.28), h * f, w * (0.88 - f * 0.56), 0.05);
  }
  ctx.fillStyle = "#c8a03c";
  ctx.fillRect(-topW * 0.6, h, topW * 1.2, h * 0.07);
  ctx.fillStyle = shade(t.accent, -0.1);
  bulb(ctx, 0, h * 1.09, 0.06, t.accent, true, 1.1);
}

/** 灯塔：红白横带 + 观景台栏杆 + 灯室 + 一道扫出去的光。 */
export function lighthouse(ctx, w, h, t, seed) {
  // 底座礁石
  ctx.fillStyle = shade(t.stone, -0.3);
  poly(ctx, [[-w * 0.6, 0], [-w * 0.34, h * 0.1], [w * 0.36, h * 0.08], [w * 0.66, 0]], shade(t.stone, -0.3));
  const bands = 4;
  for (let i = 0; i < bands; i++) {
    const f0 = i / bands, f1 = (i + 1) / bands;
    const w0 = w * (0.44 - f0 * 0.2), w1 = w * (0.44 - f1 * 0.2);
    const y0 = h * (0.1 + f0 * 0.7), y1 = h * (0.1 + f1 * 0.7);
    ctx.fillStyle = i % 2 ? "#eef2f8" : "#cf3b39";
    poly(ctx, [[-w0 / 2, y0], [w0 / 2, y0], [w1 / 2, y1], [-w1 / 2, y1]], ctx.fillStyle);
    ctx.fillStyle = "rgba(0,0,0,.2)";
    poly(ctx, [[w0 * 0.16, y0], [w0 / 2, y0], [w1 / 2, y1], [w1 * 0.16, y1]], "rgba(0,0,0,.2)");
  }
  const gy = h * 0.82;
  ctx.fillStyle = "#2e333d";
  ctx.fillRect(-w * 0.28, gy, w * 0.56, h * 0.05);
  ctx.strokeStyle = "#9aa4b0";
  ctx.lineWidth = 0.03;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * w * 0.07, gy + h * 0.05);
    ctx.lineTo(i * w * 0.07, gy + h * 0.12);
    ctx.stroke();
  }
  ctx.fillStyle = "#eef2f8";
  ctx.fillRect(-w * 0.2, gy + h * 0.12, w * 0.4, h * 0.1);
  ctx.fillStyle = "#8c1f1d";
  ctx.fillRect(-w * 0.22, gy + h * 0.22, w * 0.44, h * 0.06);
  bulb(ctx, 0, gy + h * 0.18, w * 0.12, "#fff4cf", true, 2.2);
  ctx.fillStyle = vgrad(ctx, 0, gy, h * 1.1, [
    [0, "rgba(255,244,207,.34)"], [1, "rgba(255,244,207,0)"],
  ]);
  poly(ctx, [[-w * 0.16, gy + h * 0.16], [w * 0.16, gy + h * 0.16], [w * 2.4, h * 1.05], [-w * 2.4, h * 1.05]],
    ctx.fillStyle);
}

/** 护林站：小木屋 + 门廊 + 烟囱。红杉林道上"有人住"的证据。 */
export function rangerhut(ctx, w, h, t, seed) {
  ctx.fillStyle = "rgba(6,9,16,.36)";
  ctx.fillRect(-w * 0.54, 0, w * 1.08, 0.06);
  plankFace(ctx, -w * 0.46, 0, w * 0.92, h * 0.62, t.wood, seed);
  gable(ctx, w * 0.98, h * 0.6, h * 0.3, "#4c3a29", { snow: t.snow });
  glassPane(ctx, -w * 0.34, h * 0.24, w * 0.22, h * 0.24, { lit: true, alpha: 0.9 });
  glassPane(ctx, w * 0.12, h * 0.24, w * 0.22, h * 0.24, { lit: t.night });
  ctx.fillStyle = "#3a2a1c";
  ctx.fillRect(-w * 0.06, 0, w * 0.18, h * 0.36);
  ctx.fillStyle = "#6b5237";
  ctx.fillRect(w * 0.26, h * 0.4, w * 0.12, h * 0.46);
  ctx.fillStyle = "rgba(200,200,200,.28)";
  ctx.fillRect(w * 0.26, h * 0.86, w * 0.12, h * 0.08);
}

/** 山地木屋：陡屋顶 + 阳台 + 挂着的雪。雪原上唯一像样的房子。 */
export function lodge(ctx, w, h, t, seed) {
  ctx.fillStyle = "rgba(6,9,16,.36)";
  ctx.fillRect(-w * 0.56, 0, w * 1.12, 0.07);
  plankFace(ctx, -w * 0.48, 0, w * 0.96, h * 0.58, "#5c4230", seed);
  ctx.fillStyle = "#4a3423";
  ctx.fillRect(-w * 0.48, h * 0.44, w * 0.96, h * 0.05);
  for (const f of [-0.3, 0.06, 0.3]) glassPane(ctx, w * f, h * 0.5, w * 0.18, h * 0.2, { lit: true, alpha: 0.9 });
  poly(ctx, [[-w * 0.78, h * 0.56], [0, h], [w * 0.78, h * 0.56]], "#3c2c1e");
  ctx.fillStyle = "#f4f8ff";
  poly(ctx, [[-w * 0.78, h * 0.56], [0, h], [w * 0.06, h * 0.92]], "#f4f8ff");
  ctx.fillStyle = "#2a1e14";
  ctx.fillRect(-w * 0.4, h * 0.2, w * 0.8, h * 0.05);
  ctx.fillStyle = "#3a2a1c";
  ctx.fillRect(-w * 0.08, 0, w * 0.16, h * 0.3);
  ctx.fillStyle = "#6b5237";
  ctx.fillRect(w * 0.26, h * 0.6, w * 0.1, h * 0.44);
  ctx.fillStyle = "rgba(220,226,236,.3)";
  ctx.fillRect(w * 0.26, h * 0.96, w * 0.1, h * 0.09);
}

/** 筒仓：圆筒 + 圆顶 + 一圈箍 + 梯子。工业支线上最像工业的东西。 */
export function silo(ctx, w, h, t, seed) {
  concreteFace(ctx, -w * 0.56, 0, w * 1.12, h * 0.06, t.conc, seed);
  ctx.fillStyle = hgrad(ctx, -w / 2, w / 2, h * 0.5, [
    [0, shade(t.conc, 0.34)], [0.32, shade(t.conc, 0.12)], [0.74, t.conc], [1, shade(t.conc, -0.42)],
  ]);
  ctx.fillRect(-w / 2, 0, w, h * 0.86);
  ctx.fillStyle = "rgba(0,0,0,.2)";
  for (let i = 0; i < 6; i++) ctx.fillRect(-w / 2, h * (0.12 + i * 0.13), w, 0.035);
  ctx.fillStyle = "rgba(255,255,255,.16)";
  for (let i = 0; i < 6; i++) ctx.fillRect(-w / 2, h * (0.12 + i * 0.13) + 0.035, w, 0.02);
  ctx.fillStyle = shade(t.steel, -0.1);
  ctx.beginPath();
  ctx.ellipse(0, h * 0.86, w * 0.5, h * 0.07, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = "#4a4f58";
  ctx.fillRect(w * 0.14, h * 0.9, w * 0.1, h * 0.08);
  rustPatch(ctx, -w / 2, 0, w, h * 0.86, seed, 0.6);
  ctx.fillStyle = "#5c6572";
  ctx.fillRect(-w * 0.36, 0, 0.03, h * 0.92);
  for (let i = 0; i < 9; i++) ctx.fillRect(-w * 0.38, h * (0.05 + i * 0.1), w * 0.09, 0.028);
}

/** 集装箱：竖楞 + 门 + 锁杆 + 锈。工业支线上码成一排。 */
export function container(ctx, w, h, t, seed) {
  const paint = ["#3f6a8c", "#8c4a3a", "#4a7a4c", "#8a7a3a"][Math.floor(hash2(seed, 7) * 4)];
  ctx.fillStyle = "rgba(6,9,16,.42)";
  ctx.fillRect(-w * 0.54, 0, w * 1.08, 0.07);
  steelPlate(ctx, -w / 2, 0, w, h, paint, { ribs: 14, seed });
  ctx.fillStyle = shade(paint, -0.34);
  ctx.fillRect(-w * 0.06, 0, w * 0.12, h);
  ctx.fillStyle = "#6b7480";
  for (const x of [-w * 0.26, w * 0.26]) {
    ctx.fillRect(x - 0.035, h * 0.1, 0.07, h * 0.8);
    for (let i = 0; i < 4; i++) ctx.fillRect(x - 0.1, h * (0.16 + i * 0.2), 0.2, 0.05);
  }
  ctx.fillStyle = "rgba(255,255,255,.14)";
  ctx.fillRect(-w / 2, h * 0.92, w, 0.04);
  rustPatch(ctx, -w / 2, 0, w, h, seed + 3, 1);
  if (t.snow) snowCap(ctx, -w / 2, h, w, h * 0.04, 0.8);
}

/** 油桶：两道箍 + 一个危险标志 + 一圈锈。 */
export function barrel(ctx, w, h, t, seed) {
  ctx.fillStyle = "rgba(6,9,16,.4)";
  ctx.beginPath();
  ctx.ellipse(0, 0.03, w * 0.5, 0.08, 0, 0, TAU);
  ctx.fill();
  const paint = hash2(seed, 11) < 0.5 ? "#c05a2c" : "#3f7a8c";
  ctx.fillStyle = hgrad(ctx, -w / 2, w / 2, h / 2, [
    [0, shade(paint, 0.34)], [0.34, paint], [0.76, shade(paint, -0.3)], [1, shade(paint, -0.5)],
  ]);
  ctx.fillRect(-w / 2, 0, w, h);
  ctx.fillStyle = shade(paint, -0.36);
  for (const f of [0.3, 0.66]) ctx.fillRect(-w / 2, h * f, w, h * 0.06);
  ctx.fillStyle = "rgba(255,255,255,.16)";
  ctx.fillRect(-w * 0.3, 0.05, w * 0.1, h - 0.1);
  ctx.fillStyle = "#f2c018";
  poly(ctx, [[-w * 0.16, h * 0.46], [w * 0.16, h * 0.46], [0, h * 0.78]], "#f2c018");
  rustPatch(ctx, -w / 2, 0, w, h, seed, 0.9);
}
