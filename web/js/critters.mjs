/**
 * 路上的畜生：牛、羊、鹿、野猪、狗、鹅。侧视、四足、左亮右暗。
 *
 * 1991～1993 那三代《暴力摩托》里最有名的一个彩蛋就是"一头牛站在路中间"。
 * 画它们有两条硬要求：
 *   1. **一眼认出是什么**——在 60 公里的时速下你只有半秒。所以每个品种都保留
 *      它最扎眼的那一件：牛的斑、羊的毛、鹿的角、猪的獠牙、狗的翘尾巴、鹅的长脖子。
 *   2. **体型要准**——判定用的是 `sim/critters.mjs` 里的长宽，画出来的东西
 *      不能比判定胖也不能比它瘦。撞上一头"看着能躲过去"的牛最让人生气。
 *
 * 被踹飞之后按 `spin` 旋转（和车流同一套处理），落地就不再画了。
 */

import { TAU } from "../../sim/constants.mjs";
import { hgrad, poly, shade, vgrad } from "./art.mjs";

/** 四条腿：两条在前、两条在后，压地的那一头有一小片影。 */
function legs(ctx, w, h, color, len = 0.42) {
  const legH = h * len;
  ctx.fillStyle = shade(color, -0.3);
  for (const x of [-w * 0.3, -w * 0.18, w * 0.2, w * 0.32]) {
    ctx.fillRect(x - w * 0.035, 0, w * 0.07, legH);
  }
  ctx.fillStyle = "rgba(6,9,16,.42)";
  ctx.fillRect(-w * 0.42, 0, w * 0.16, h * 0.03);
  ctx.fillRect(w * 0.1, 0, w * 0.3, h * 0.03);
}

/** 一个躯干：背上受光、肚子压暗。所有品种共用。 */
function body(ctx, w, h, color, { y = 0.4, rw = 0.5, rh = 0.26 } = {}) {
  const bw = w * rw * 2, bh = h * rh * 2;
  const bx = -bw / 2, by = h * y - bh / 2;
  ctx.fillStyle = hgrad(ctx, bx, bx + bw, by + bh / 2, [
    [0, shade(color, 0.28)], [0.36, color], [0.76, shade(color, -0.24)], [1, shade(color, -0.44)],
  ]);
  ctx.beginPath();
  ctx.ellipse(0, h * y, bw / 2, bh / 2, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = vgrad(ctx, 0, by, by + bh, [
    [0, "rgba(255,255,255,.16)"], [0.5, "rgba(255,255,255,0)"], [1, "rgba(0,0,0,.22)"],
  ]);
  ctx.beginPath();
  ctx.ellipse(0, h * y, bw / 2, bh / 2, 0, 0, TAU);
  ctx.fill();
}

/** 一条尾巴。牛/鹿往下垂带一撮毛，狗往上翘。 */
function tail(ctx, w, h, color, { up = false } = {}) {
  ctx.strokeStyle = shade(color, -0.24);
  ctx.lineWidth = Math.max(0.03, w * 0.05);
  ctx.beginPath();
  const x0 = -w * 0.46, y0 = h * (up ? 0.46 : 0.5);
  ctx.moveTo(x0, y0);
  if (up) ctx.quadraticCurveTo(x0 - w * 0.16, y0 + h * 0.3, x0 - w * 0.08, y0 + h * 0.42);
  else ctx.quadraticCurveTo(x0 - w * 0.14, y0 - h * 0.1, x0 - w * 0.06, y0 - h * 0.28);
  ctx.stroke();
  ctx.fillStyle = shade(color, -0.4);
  ctx.beginPath();
  ctx.arc(x0 + (up ? -w * 0.08 : -w * 0.06), y0 + (up ? h * 0.44 : -h * 0.3), w * 0.045, 0, TAU);
  ctx.fill();
}

/** 牛：花斑 + 犄角 + 垂耳 + 一撮尾巴。 */
export function drawCow(ctx, w, h) {
  legs(ctx, w, h, "#e8e4dc", 0.4);
  body(ctx, w, h, "#f0ece4", { y: 0.5, rw: 0.5, rh: 0.24 });
  // 花斑：三块不规则的深色，牛之所以是牛
  ctx.fillStyle = "#2a2622";
  poly(ctx, [[-w * 0.34, h * 0.56], [-w * 0.12, h * 0.44], [w * 0.02, h * 0.62], [-w * 0.24, h * 0.68]], "#2a2622");
  poly(ctx, [[w * 0.18, h * 0.42], [w * 0.42, h * 0.48], [w * 0.34, h * 0.62], [w * 0.12, h * 0.56]], "#2a2622");
  tail(ctx, w, h, "#f0ece4");
  // 头：一条短脖子 + 一个长方的吻
  ctx.fillStyle = "#e2ddd2";
  ctx.fillRect(w * 0.34, h * 0.46, w * 0.26, h * 0.2);
  ctx.fillStyle = hgrad(ctx, w * 0.4, w * 0.62, h * 0.6, [
    [0, "#f6f2ea"], [0.5, "#ded8cc"], [1, "#a49c8e"],
  ]);
  ctx.fillRect(w * 0.5, h * 0.4, w * 0.3, h * 0.26);
  ctx.fillStyle = "#3a332c";
  ctx.fillRect(w * 0.56, h * 0.46, w * 0.05, h * 0.05);
  ctx.fillRect(w * 0.68, h * 0.46, w * 0.05, h * 0.05);
  // 犄角 + 耳
  ctx.fillStyle = "#c9bda2";
  for (const [x, y, sx] of [[w * 0.52, h * 0.68, -1], [w * 0.66, h * 0.7, 1]]) {
    poly(ctx, [[x, y], [x + sx * w * 0.12, y + h * 0.1], [x + sx * w * 0.04, y + h * 0.02]], "#c9bda2");
  }
  ctx.fillStyle = "#c9bda2";
  for (const x of [w * 0.44, w * 0.76]) {
    ctx.beginPath();
    ctx.ellipse(x, h * 0.64, w * 0.07, h * 0.04, 0.4, 0, TAU);
    ctx.fill();
  }
}

/** 羊：一团毛 + 一张黑脸 + 四根细腿。 */
export function drawSheep(ctx, w, h) {
  legs(ctx, w, h, "#4a4640", 0.3);
  // 羊毛：九团叠加的圆，左亮右暗
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const bx = Math.cos(a) * w * 0.3;
    const by = h * 0.52 + Math.sin(a) * h * 0.16;
    const r = w * (0.18 + (i % 3) * 0.03);
    ctx.fillStyle = i % 2
      ? "#f2f0ea"
      : hgrad(ctx, bx - r, bx + r, by, [[0, "#ffffff"], [1, "#c6c2ba"]]);
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = "#33302c";
  ctx.beginPath();
  ctx.ellipse(w * 0.44, h * 0.56, w * 0.12, h * 0.11, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#1d1b18";
  ctx.beginPath();
  ctx.arc(w * 0.48, h * 0.6, w * 0.022, 0, TAU);
  ctx.fill();
  tail(ctx, w, h, "#eae6de");
}

/** 鹿：细腿 + 一对分叉的角 + 一截白屁股。 */
export function drawDeer(ctx, w, h) {
  legs(ctx, w, h, "#a8723f", 0.5);
  body(ctx, w, h, "#b07c46", { y: 0.56, rw: 0.44, rh: 0.2 });
  ctx.fillStyle = "#efe6d6";
  ctx.beginPath();
  ctx.ellipse(-w * 0.4, h * 0.58, w * 0.1, h * 0.09, 0, 0, TAU);
  ctx.fill();
  tail(ctx, w, h, "#e8dcc6", { up: true });
  // 脖子朝上
  ctx.fillStyle = "#a8723f";
  poly(ctx, [[w * 0.3, h * 0.62], [w * 0.44, h * 0.62], [w * 0.48, h * 0.86], [w * 0.34, h * 0.86]],
    "#a8723f");
  ctx.fillStyle = hgrad(ctx, w * 0.4, w * 0.6, h * 0.9, [
    [0, "#c08a52"], [0.6, "#a8723f"], [1, "#7c5028"],
  ]);
  poly(ctx, [[w * 0.4, h * 0.82], [w * 0.62, h * 0.84], [w * 0.6, h * 0.98], [w * 0.4, h * 0.96]],
    ctx.fillStyle);
  ctx.fillStyle = "#241d16";
  ctx.beginPath();
  ctx.arc(w * 0.56, h * 0.92, w * 0.018, 0, TAU);
  ctx.fill();
  // 角：两根主干 + 每根两个分叉
  ctx.strokeStyle = "#8a6a44";
  ctx.lineWidth = Math.max(0.025, w * 0.03);
  for (const [x, sx] of [[w * 0.46, -1], [w * 0.54, 1]]) {
    ctx.beginPath();
    ctx.moveTo(x, h * 0.96);
    ctx.lineTo(x + sx * w * 0.1, h * 1.14);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + sx * w * 0.04, h * 1.03);
    ctx.lineTo(x + sx * w * 0.18, h * 1.08);
    ctx.stroke();
  }
}

/** 野猪：矮胖的深色身体 + 獠牙 + 背上一排鬃毛。 */
export function drawBoar(ctx, w, h) {
  legs(ctx, w, h, "#3d322a", 0.26);
  body(ctx, w, h, "#4a3a2e", { y: 0.4, rw: 0.48, rh: 0.2 });
  ctx.fillStyle = "#2a211a";
  for (let i = 0; i < 7; i++) {
    const x = -w * 0.36 + i * w * 0.11;
    poly(ctx, [[x, h * 0.58], [x + w * 0.05, h * 0.7], [x + w * 0.09, h * 0.58]], "#2a211a");
  }
  tail(ctx, w, h, "#4a3a2e");
  ctx.fillStyle = "#3d322a";
  poly(ctx, [[w * 0.4, h * 0.42], [w * 0.66, h * 0.36], [w * 0.68, h * 0.5], [w * 0.42, h * 0.54]],
    "#3d322a");
  ctx.fillStyle = "#e8e2d2";
  poly(ctx, [[w * 0.6, h * 0.4], [w * 0.72, h * 0.46], [w * 0.6, h * 0.46]], "#e8e2d2");
  ctx.fillStyle = "#1a1512";
  ctx.beginPath();
  ctx.arc(w * 0.62, h * 0.46, w * 0.02, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#c05a3a";
  ctx.beginPath();
  ctx.arc(w * 0.52, h * 0.52, w * 0.016, 0, TAU);
  ctx.fill();
}

/** 狗：小、翘尾巴、四条短腿。 */
export function drawDog(ctx, w, h) {
  legs(ctx, w, h, "#8a6134", 0.34);
  body(ctx, w, h, "#a8763f", { y: 0.48, rw: 0.4, rh: 0.17 });
  tail(ctx, w, h, "#a8763f", { up: true });
  ctx.fillStyle = "#b8843f";
  poly(ctx, [[w * 0.32, h * 0.5], [w * 0.56, h * 0.44], [w * 0.58, h * 0.68], [w * 0.34, h * 0.68]],
    "#b8843f");
  ctx.fillStyle = "#8a6134";
  poly(ctx, [[w * 0.4, h * 0.68], [w * 0.48, h * 0.78], [w * 0.56, h * 0.66]], "#8a6134");
  ctx.fillStyle = "#20180f";
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.62, w * 0.02, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#1a1410";
  ctx.beginPath();
  ctx.arc(w * 0.6, h * 0.58, w * 0.016, 0, TAU);
  ctx.fill();
}

/** 鹅：白身 + 长脖子 + 橙嘴 + 一对蹼脚。 */
export function drawGoose(ctx, w, h) {
  ctx.fillStyle = "#d8822a";
  for (const x of [-w * 0.16, w * 0.14]) {
    poly(ctx, [[x, 0], [x + w * 0.22, 0], [x + w * 0.2, h * 0.08], [x, h * 0.08]], "#d8822a");
  }
  ctx.fillStyle = hgrad(ctx, -w / 2, w / 2, h * 0.5, [
    [0, "#ffffff"], [0.4, "#f0efe8"], [1, "#b8b8b0"],
  ]);
  ctx.beginPath();
  ctx.ellipse(-w * 0.04, h * 0.5, w * 0.42, h * 0.24, 0, 0, TAU);
  ctx.fill();
  // 翅膀：一道分层的弧
  ctx.fillStyle = "rgba(180,178,168,.7)";
  ctx.beginPath();
  ctx.ellipse(-w * 0.08, h * 0.52, w * 0.26, h * 0.14, -0.16, 0, TAU);
  ctx.fill();
  // 脖子：一根本弯曲的柱
  ctx.fillStyle = "#f6f5ee";
  poly(ctx, [
    [w * 0.2, h * 0.52], [w * 0.34, h * 0.52], [w * 0.4, h * 0.92], [w * 0.28, h * 0.94],
  ], "#f6f5ee");
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(w * 0.36, h * 0.92, w * 0.13, h * 0.08, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#e8862a";
  poly(ctx, [[w * 0.46, h * 0.9], [w * 0.66, h * 0.94], [w * 0.46, h * 0.97]], "#e8862a");
  ctx.fillStyle = "#1a1a18";
  ctx.beginPath();
  ctx.arc(w * 0.4, h * 0.96, w * 0.018, 0, TAU);
  ctx.fill();
}

/** 品种 → 画法。和 `sim/critters.mjs` 的 `CRITTERS` 一一对应。 */
const DRAWERS = {
  cow: drawCow, sheep: drawSheep, deer: drawDeer,
  boar: drawBoar, dog: drawDog, goose: drawGoose,
};

export const hasCritterArt = kind => Object.hasOwn(DRAWERS, kind);

/**
 * 画一头畜生。参数和 `drawVehicle` 一致：`air` 是踹飞后的离地高度，`spin` 是转的角。
 * `dir < 0` 表示它朝左走——把头那一侧翻过去，否则整条路上所有动物都朝右。
 */
export function drawCritter(ctx, o) {
  const s = o.s;
  if (!(s > 0.03)) return;
  const painter = DRAWERS[o.kind];
  if (!painter) return;
  ctx.save();
  ctx.translate(o.cx, o.baseY - (o.air || 0) * s);
  if (o.spin) ctx.rotate(o.spin);
  ctx.scale(o.dir < 0 ? -s : s, -s);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (!o.air) {
    ctx.fillStyle = "rgba(0,0,0,.32)";
    ctx.beginPath();
    ctx.ellipse(0, 0.03, o.w * 0.5, 0.14, 0, 0, TAU);
    ctx.fill();
  }
  painter(ctx, o.w, o.h);
  ctx.restore();
}
