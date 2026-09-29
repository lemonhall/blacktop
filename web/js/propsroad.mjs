/**
 * 路边**人造的东西**：路灯、路牌、信号灯、护栏、雪杆、消防栓、候车亭、
 * 长椅、探照灯、广告牌、霓虹招牌、龙门架、涵管。
 *
 * 这一组负责的是"这里有人住"——纯自然的路边跑起来像在火星上骑摩托。
 * 每一条路上出现的种类都不一样：荒野是木栅栏与草垛，工业支线是铁网与龙门架，
 * 夜市是糊脸的招牌。**同一种道具在不同的路上颜色也不同**，那由 `theme` 定。
 *
 * 坐标系：米，y 向上，原点在接地点。
 */

import { TAU } from "../../sim/constants.mjs";
import { hash2 } from "../../sim/rng.mjs";
import { hgrad, poly, shade, vgrad } from "./art.mjs";
import { bulb, concreteFace, glassPane, label3d, plankFace, pole, rustPatch } from "./parts.mjs";

/** 路灯：底座 + 杆 + 悬臂 + 灯头。夜里在路面打一块光斑。 */
export function lamp(ctx, w, h, t, seed) {
  concreteFace(ctx, -w * 0.2, 0, w * 0.4, h * 0.075, t.conc, seed);
  pole(ctx, 0, w * 0.13, h * 0.95, t.steel);
  const armY = h * 0.93;
  ctx.strokeStyle = shade(t.steel, -0.1);
  ctx.lineWidth = w * 0.1;
  ctx.beginPath();
  ctx.moveTo(0, armY);
  ctx.quadraticCurveTo(w * 0.34, armY + h * 0.035, w * 0.62, armY - h * 0.01);
  ctx.stroke();
  ctx.fillStyle = shade(t.steel, -0.28);
  poly(ctx, [
    [w * 0.36, armY], [w * 0.72, armY], [w * 0.64, armY - h * 0.03], [w * 0.44, armY - h * 0.03],
  ], shade(t.steel, -0.28));
  const lit = t.night;
  bulb(ctx, w * 0.54, armY - h * 0.045, w * 0.055, lit ? "#fff0bb" : "#d7dbe4", lit, 1.4);
  if (!lit) return;
  // 灯锥 + 地面上那块亮斑：路灯真正的作用是"在地上打一块光"，不是自己发亮
  ctx.fillStyle = vgrad(ctx, 0, 0, h * 0.9, [
    [0, "rgba(255,226,150,.3)"], [1, "rgba(255,226,150,0)"],
  ]);
  poly(ctx, [
    [w * 0.4, armY - h * 0.06], [w * 0.7, armY - h * 0.06],
    [w * 1.9, 0], [w * 0.1, 0],
  ], ctx.fillStyle);
  ctx.fillStyle = "rgba(255,222,150,.32)";
  ctx.beginPath();
  ctx.ellipse(w * 1.0, 0.05, w * 1.3, h * 0.05, 0, 0, TAU);
  ctx.fill();
}

/** 路牌：立杆 + 牌面 + 白边 + 两行字。 */
export function sign(ctx, w, h, t, seed) {
  pole(ctx, 0, w * 0.1, h * 0.7, t.steel);
  const top = h * 0.98, bot = h * 0.62;
  ctx.fillStyle = "rgba(6,9,16,.7)";
  ctx.fillRect(-w / 2 - 0.04, bot - 0.04, w + 0.08, top - bot + 0.08);
  const face = t.night ? "#1f7a52" : t.accent === "#f4a634" ? "#2b6ea8" : "#2f7a58";
  ctx.fillStyle = hgrad(ctx, -w / 2, w / 2, (top + bot) / 2, [
    [0, shade(face, 0.22)], [0.5, face], [1, shade(face, -0.3)],
  ]);
  ctx.fillRect(-w / 2, bot, w, top - bot);
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.fillRect(-w / 2 + 0.06, bot + 0.06, w - 0.12, 0.035);
  ctx.fillRect(-w / 2 + 0.06, top - 0.095, w - 0.12, 0.035);
  ctx.fillStyle = "#eef3ff";
  ctx.fillRect(-w * 0.34, bot + (top - bot) * 0.42, w * 0.5, 0.05);
  ctx.fillRect(-w * 0.34, bot + (top - bot) * 0.66, w * 0.68, 0.045);
  if (h > 2.4) label3d(ctx, 0, (top + bot) * 0.5 + 0.1, h * 0.13, "前方", "#f2f6ff");
}

/** 信号灯：杆 + 悬臂 + 三灯箱，红灯亮。 */
export function trafficlight(ctx, w, h, t, seed) {
  pole(ctx, 0, w * 0.12, h * 0.98, t.steel);
  const armY = h * 0.96;
  ctx.fillStyle = shade(t.steel, -0.2);
  ctx.fillRect(0, armY - w * 0.05, w * 0.86, w * 0.1);
  const bx = w * 0.72, by = armY - h * 0.3;
  ctx.fillStyle = "rgba(6,9,16,.8)";
  ctx.fillRect(bx - w * 0.16, by, w * 0.32, h * 0.3);
  const cols = [["#ff4a4a", true], ["#ffc24a", false], ["#4ade80", false]];
  cols.forEach(([c, on], i) => {
    ctx.fillStyle = on ? c : shade(c, -0.62);
    ctx.beginPath();
    ctx.arc(bx, by + h * 0.26 - i * h * 0.095, w * 0.1, 0, TAU);
    ctx.fill();
    if (on) {
      ctx.fillStyle = "rgba(255,120,120,.3)";
      ctx.beginPath();
      ctx.arc(bx, by + h * 0.26 - i * h * 0.095, w * 0.22, 0, TAU);
      ctx.fill();
    }
  });
}

/** 波形护栏：两道波纹板 + 立柱 + 螺栓。海崖公路贴边那一整条。 */
export function guardrail(ctx, w, h, t, seed) {
  const n = 3;
  for (let i = 0; i < n; i++) pole(ctx, -w / 2 + (w / (n - 1)) * i, w * 0.075, h * 0.92, t.steel);
  const y = h * 0.6, bh = h * 0.26;
  ctx.fillStyle = hgrad(ctx, -w / 2, w / 2, y, [
    [0, shade(t.steel, 0.34)], [0.4, shade(t.steel, 0.1)], [1, shade(t.steel, -0.42)],
  ]);
  ctx.fillRect(-w / 2, y, w, bh);
  ctx.fillStyle = "rgba(255,255,255,.22)";
  ctx.fillRect(-w / 2, y + bh * 0.62, w, bh * 0.16);
  ctx.fillStyle = "rgba(0,0,0,.26)";
  ctx.fillRect(-w / 2, y + bh * 0.34, w, bh * 0.12);
  ctx.fillStyle = "rgba(6,9,16,.5)";
  for (let i = 0; i < n * 2; i++) {
    ctx.beginPath();
    ctx.arc(-w / 2 + (w / (n * 2 - 1)) * i, y + bh * 0.5, 0.035, 0, TAU);
    ctx.fill();
  }
}

/** 铁丝网：菱形网格 + 立柱 + 顶部刺线。工业支线那道边界。 */
export function chainfence(ctx, w, h, t, seed) {
  const n = 3;
  for (let i = 0; i < n; i++) pole(ctx, -w / 2 + (w / (n - 1)) * i, w * 0.05, h, t.steel);
  ctx.strokeStyle = "rgba(180,192,210,.55)";
  ctx.lineWidth = 0.018;
  const step = w * 0.14;
  for (let k = -8; k <= 14; k++) {
    ctx.beginPath();
    ctx.moveTo(-w / 2 + k * step, 0);
    ctx.lineTo(-w / 2 + k * step + h, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-w / 2 + k * step, h);
    ctx.lineTo(-w / 2 + k * step + h, 0);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(210,220,236,.7)";
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  ctx.moveTo(-w / 2, h);
  ctx.lineTo(w / 2, h);
  ctx.stroke();
}

/** 木栅栏：立柱 + 三道横板。荒野上"这块地有人管"的唯一证据。 */
export function fence(ctx, w, h, t, seed) {
  for (let i = 0; i <= 3; i++) {
    const x = -w / 2 + (w / 3) * i;
    plankFace(ctx, x - w * 0.035, 0, w * 0.07, h, shade(t.wood, -0.1), seed + i);
  }
  for (const f of [0.34, 0.62, 0.9]) {
    plankFace(ctx, -w / 2, h * f - h * 0.055, w, h * 0.11, t.wood, seed + f * 10);
  }
  if (t.snow) {
    ctx.fillStyle = "#f2f7ff";
    ctx.fillRect(-w / 2, h * 0.9, w, h * 0.075);
  }
}

/** 雪杆：红白相间的细杆。雪原上"路在哪"全靠这一排。 */
export function snowpole(ctx, w, h, t, seed) {
  pole(ctx, 0, w * 0.14, h, t.steel);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? "#e8eef8" : "#d8454a";
    ctx.fillRect(-w * 0.09, h * (0.14 + i * 0.19), w * 0.18, h * 0.1);
  }
  ctx.fillStyle = "#d8454a";
  ctx.fillRect(-w * 0.16, h * 0.95, w * 0.32, h * 0.05);
}

/** 消防栓：红色、两个侧口、顶上六角螺帽。 */
export function hydrant(ctx, w, h, t, seed) {
  ctx.fillStyle = "rgba(6,9,16,.4)";
  ctx.beginPath();
  ctx.ellipse(0, 0.03, w * 0.5, 0.08, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = hgrad(ctx, -w * 0.3, w * 0.3, h * 0.4, [
    [0, "#e8544a"], [0.36, "#c8392f"], [1, "#7d1f1a"],
  ]);
  ctx.fillRect(-w * 0.28, h * 0.08, w * 0.56, h * 0.66);
  ctx.fillRect(-w * 0.38, 0, w * 0.76, h * 0.12);
  ctx.beginPath();
  ctx.arc(0, h * 0.76, w * 0.28, 0, Math.PI);
  ctx.fill();
  for (const side of [-1, 1]) {
    ctx.fillStyle = "#9c2b23";
    ctx.beginPath();
    ctx.arc(side * w * 0.3, h * 0.44, w * 0.13, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = "#ffd45c";
  ctx.fillRect(-w * 0.12, h * 0.86, w * 0.24, h * 0.08);
  ctx.fillStyle = "rgba(255,255,255,.3)";
  ctx.fillRect(-w * 0.2, h * 0.12, w * 0.07, h * 0.56);
}

/** 候车亭：顶棚 + 一块玻璃背板 + 长凳 + 站牌。 */
export function busstop(ctx, w, h, t, seed) {
  ctx.fillStyle = "rgba(6,9,16,.36)";
  ctx.fillRect(-w * 0.5, 0, w, 0.08);
  ctx.fillStyle = hgrad(ctx, -w / 2, w / 2, h * 0.5, [
    [0, shade(t.conc, 0.24)], [0.46, t.conc], [1, shade(t.conc, -0.34)],
  ]);
  ctx.fillRect(-w * 0.46, h * 0.9, w * 0.92, h * 0.1);
  ctx.fillStyle = "rgba(255,255,255,.2)";
  ctx.fillRect(-w * 0.46, h * 0.94, w * 0.92, h * 0.03);
  glassPane(ctx, -w * 0.42, h * 0.16, w * 0.84, h * 0.7, { lit: t.night, alpha: 0.7 });
  ctx.fillStyle = "rgba(6,9,16,.6)";
  ctx.fillRect(-w * 0.42, h * 0.16, w * 0.84, h * 0.04);
  plankFace(ctx, -w * 0.32, h * 0.2, w * 0.64, h * 0.07, t.wood, seed);
  pole(ctx, w * 0.5, w * 0.05, h * 0.86, t.steel);
  ctx.fillStyle = t.night ? "#2469c8" : "#1f6a52";
  ctx.fillRect(w * 0.36, h * 0.86, w * 0.28, h * 0.13);
  label3d(ctx, w * 0.5, h * 0.925, h * 0.075, "站", "#f2f6ff");
}

/** 长椅：木条座面 + 靠背 + 铸铁腿。 */
export function bench(ctx, w, h, t, seed) {
  for (const side of [-1, 1]) {
    ctx.fillStyle = "#2a2e36";
    ctx.fillRect(side * w * 0.34 - w * 0.04, 0, w * 0.08, h * 0.5);
    ctx.fillRect(side * w * 0.34 - w * 0.04, 0, w * 0.08, h * 0.9);
  }
  for (let i = 0; i < 3; i++) {
    plankFace(ctx, -w / 2, h * (0.46 + i * 0.05), w, h * 0.045, t.wood, seed + i);
  }
  for (let i = 0; i < 3; i++) {
    plankFace(ctx, -w / 2, h * (0.6 + i * 0.1), w, h * 0.06, shade(t.wood, i * 0.04), seed + i * 3);
  }
}

/** 探照灯：高杆 + 一排两盏大灯，灯是亮的（工地夜里不关）。 */
export function floodlight(ctx, w, h, t, seed) {
  concreteFace(ctx, -w * 0.22, 0, w * 0.44, h * 0.06, t.conc, seed);
  pole(ctx, 0, w * 0.16, h * 0.98, t.steel);
  ctx.fillStyle = shade(t.steel, -0.24);
  ctx.fillRect(-w * 0.4, h * 0.92, w * 0.8, h * 0.06);
  for (const side of [-1, 1]) {
    const x = side * w * 0.5;
    ctx.fillStyle = "#2b303a";
    poly(ctx, [[x - w * 0.24, h * 0.94], [x + w * 0.24, h * 0.94], [x + w * 0.3, h * 1.02], [x - w * 0.3, h * 1.02]],
      "#2b303a");
    bulb(ctx, x, h * 0.94, w * 0.14, "#fff4cf", true, 1.6);
  }
  ctx.fillStyle = vgrad(ctx, 0, 0, h, [
    [0, "rgba(255,244,200,.2)"], [1, "rgba(255,244,200,0)"],
  ]);
  poly(ctx, [
    [-w * 0.9, h * 1.0], [w * 0.9, h * 1.0], [w * 2.2, 0], [-w * 2.2, 0],
  ], ctx.fillStyle);
}

/** 广告牌：两根柱 + 一块大板 + 一张海报。荒野/沙漠/夜市上都有。 */
export function billboard(ctx, w, h, t, seed) {
  pole(ctx, -w * 0.3, w * 0.07, h * 0.6, shade(t.steel, -0.2));
  pole(ctx, w * 0.3, w * 0.07, h * 0.6, shade(t.steel, -0.2));
  const top = h, bot = h * 0.56;
  ctx.fillStyle = "rgba(6,9,16,.6)";
  ctx.fillRect(-w / 2 - 0.04, bot - 0.04, w + 0.08, top - bot + 0.08);
  const base = ["#c8563f", "#2f6ea8", "#d8a03c", "#4a8a6a"][Math.floor(hash2(seed, 2) * 4)];
  ctx.fillStyle = hgrad(ctx, -w / 2, w / 2, (top + bot) / 2, [
    [0, shade(base, 0.24)], [0.5, base], [1, shade(base, -0.34)],
  ]);
  ctx.fillRect(-w / 2, bot, w, top - bot);
  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.fillRect(-w * 0.4, bot + (top - bot) * 0.62, w * 0.5, (top - bot) * 0.1);
  ctx.fillRect(-w * 0.4, bot + (top - bot) * 0.3, w * 0.72, (top - bot) * 0.14);
  label3d(ctx, 0, bot + (top - bot) * 0.79, (top - bot) * 0.24, "路上小心", "#fff6e4");
  rustPatch(ctx, -w / 2, bot, w, top - bot, seed, 0.5);
}

/** 霓虹招牌：一块竖牌 + 一圈灯管 + 发光字。夜市糊脸的那一笔。 */
export function neonsign(ctx, w, h, t, seed) {
  pole(ctx, 0, w * 0.08, h * 0.34, shade(t.steel, -0.2));
  const top = h, bot = h * 0.3;
  ctx.fillStyle = "rgba(6,9,16,.85)";
  ctx.fillRect(-w / 2 - 0.04, bot - 0.04, w + 0.08, top - bot + 0.08);
  ctx.fillStyle = vgrad(ctx, 0, bot, top, [
    [0, "#2a1038"], [0.5, "#48184f"], [1, "#210d2c"],
  ]);
  ctx.fillRect(-w / 2, bot, w, top - bot);
  const hue = Math.floor(hash2(seed, 5) * 3);
  const glow = ["#ff5fd0", "#5fe0ff", "#ffd23f"][hue];
  ctx.strokeStyle = glow;
  ctx.lineWidth = 0.06;
  ctx.globalAlpha = 0.62;
  ctx.strokeRect(-w / 2 + 0.1, bot + 0.1, w - 0.2, top - bot - 0.2);
  ctx.globalAlpha = 1;
  label3d(ctx, 0, bot + (top - bot) * 0.68, (top - bot) * 0.4, ["夜市", "烧烤", "加油"][hue], glow);
  label3d(ctx, 0, bot + (top - bot) * 0.3, (top - bot) * 0.24, "OPEN", "#f6e9ff");
  for (let i = 0; i < 6; i++) {
    bulb(ctx, -w / 2 + w * (0.12 + i * 0.15), bot + 0.06, 0.05, glow, true, 0.7);
  }
}

/** 龙门架：横跨半边的桁架 + 一块限高牌。工业支线的地标。 */
export function gantry(ctx, w, h, t, seed) {
  pole(ctx, -w * 0.42, w * 0.09, h, t.steel);
  pole(ctx, w * 0.42, w * 0.09, h, t.steel);
  const y = h * 0.86, th = h * 0.14;
  ctx.fillStyle = shade(t.steel, -0.2);
  ctx.fillRect(-w * 0.5, y, w, th);
  ctx.strokeStyle = shade(t.steel, 0.16);
  ctx.lineWidth = 0.04;
  for (let i = 0; i < 12; i++) {
    const x = -w * 0.5 + (w / 12) * i;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w / 24, y + th);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w / 24, y);
    ctx.lineTo(x, y + th);
    ctx.stroke();
  }
  ctx.fillStyle = "#f2c018";
  ctx.fillRect(-w * 0.2, y + th + 0.05, w * 0.4, h * 0.14);
  label3d(ctx, 0, y + th + 0.12, h * 0.09, "限高 4.5", "#1a1c22");
}

/** 涵管：两根躺着的混凝土管，端面能看见内壁。 */
export function pipe(ctx, w, h, t, seed) {
  for (let i = 0; i < 2; i++) {
    const x = i ? w * 0.24 : -w * 0.28;
    const y = i ? h * 0.52 : 0;
    ctx.fillStyle = hgrad(ctx, x - w / 2, x + w / 2, y + h / 2, [
      [0, shade(t.conc, 0.26)], [0.4, t.conc], [1, shade(t.conc, -0.4)],
    ]);
    ctx.fillRect(x - w * 0.5, y, w, h * 0.44);
    ctx.fillStyle = shade(t.conc, -0.5);
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h * 0.22, h * 0.1, h * 0.22, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#0d0f14";
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h * 0.22, h * 0.06, h * 0.13, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.fillRect(x - w * 0.5, y + h * 0.36, w, h * 0.05);
  }
}
