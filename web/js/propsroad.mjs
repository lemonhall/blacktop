/**
 * 路边**沿路排开的人造东西**：路灯、路牌、信号灯、护栏、铁网、木栅栏、雪杆。
 *
 * 这一组负责的是"这里有人住"——纯自然的路边跑起来像在火星上骑摩托。
 * 每一条路上出现的种类都不一样：荒野是木栅栏与草垛，工业支线是铁网与龙门架，
 * 夜市是糊脸的招牌。**同一种道具在不同的路上颜色也不同**，那由 `theme` 定。
 *
 * 它们和 `propsstreet.mjs` 里那拨"城市家具"的分界线是**密度**：这一拨是线性的，
 * 沿路一根接一根地重复，负责给速度感和路的边界；那一拨是点状的，一段路才冒一个。
 *
 * 坐标系：米，y 向上，原点在接地点。
 */

import { TAU } from "../../sim/constants.mjs";
import { hash2 } from "../../sim/rng.mjs";
import { hgrad, poly, shade, vgrad } from "./art.mjs";
import { bulb, concreteFace, glassPane, label3d, plankFace, pole, rustPatch, wireMesh } from "./parts.mjs";

/**
 * 路灯：水泥墩 + **锥形杆**（四段，越往上越细）+ 检修门 + 悬臂 + 灯头，夜里在地上
 * 打一块光。
 *
 * 上一版的灯锥是一块**硬边梯形**：一片米黄色的板子从灯头斜插到地面，近处看就是
 * 半透明的墙（截图里最扎眼的一处）。现在改成**径向渐变**填同一个多边形——亮度
 * 从灯头往外衰减，多边形那几条斜边正好落在 alpha≈0 的地方，边缘就化掉了。
 * 灯头从"一颗圆球"改成"一个弯下来的灯罩"，因为它本来就是个灯罩。
 */
export function lamp(ctx, w, h, t, seed) {
  // 水泥墩 + 压顶 + 地脚螺栓：路灯底下那一圈，近处看得出来是浇筑的
  concreteFace(ctx, -w * 0.24, 0, w * 0.48, h * 0.062, t.conc, seed);
  ctx.fillStyle = shade(t.conc, 0.22);
  ctx.fillRect(-w * 0.27, h * 0.055, w * 0.54, 0.035);
  ctx.fillStyle = "rgba(6,9,16,.4)";
  for (const bx of [-w * 0.17, w * 0.17]) {
    ctx.beginPath();
    ctx.arc(bx, h * 0.075, 0.035, 0, TAU);
    ctx.fill();
  }
  // 检修门：杆子底下那块方盖子。这一笔不为什么，就是"这根杆子有人管"
  ctx.fillStyle = shade(t.steel, -0.36);
  ctx.fillRect(w * 0.035, h * 0.06, w * 0.05, h * 0.15);
  ctx.fillStyle = "rgba(255,255,255,.12)";
  ctx.fillRect(w * 0.035, h * 0.205, w * 0.05, 0.018);
  // 杆：一根路灯杆是锥形的。四段拼出来，接缝正好当"法兰"
  const segs = 4, y0 = h * 0.062, span = h * 0.85;
  for (let i = 0; i < segs; i++) {
    const wa = w * (0.135 - i * 0.017), wb = w * (0.135 - (i + 1) * 0.017);
    const ya = y0 + (span / segs) * i, yb = ya + span / segs;
    ctx.fillStyle = hgrad(ctx, -wa / 2, wa / 2, (ya + yb) / 2, [
      [0, shade(t.steel, 0.36)], [0.34, t.steel], [1, shade(t.steel, -0.52)],
    ]);
    poly(ctx, [[-wa / 2, ya], [wa / 2, ya], [wb / 2, yb], [-wb / 2, yb]], ctx.fillStyle);
    if (i < segs - 1) {
      ctx.fillStyle = "rgba(6,9,16,.34)";
      ctx.fillRect(-wa * 0.62, yb - 0.022, wa * 1.24, 0.022);
    }
  }
  // 悬臂：从杆顶弯出去，末端挂灯罩
  const armY = h * 0.9;
  const headX = w * 0.62, headY = armY + h * 0.012;
  ctx.strokeStyle = shade(t.steel, -0.06);
  ctx.lineWidth = w * 0.075;
  ctx.beginPath();
  ctx.moveTo(0, armY + h * 0.02);
  ctx.quadraticCurveTo(w * 0.36, armY + h * 0.055, headX, headY);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,.16)";
  ctx.lineWidth = w * 0.022;
  ctx.beginPath();
  ctx.moveTo(0, armY + h * 0.036);
  ctx.quadraticCurveTo(w * 0.36, armY + h * 0.071, headX, headY + h * 0.008);
  ctx.stroke();
  // 灯罩：一个上宽下窄的梯形 + 底面的玻璃
  const lit = t.night;
  ctx.fillStyle = shade(t.steel, -0.3);
  poly(ctx, [
    [headX - w * 0.17, headY + h * 0.02], [headX + w * 0.17, headY + h * 0.02],
    [headX + w * 0.12, headY - h * 0.012], [headX - w * 0.12, headY - h * 0.012],
  ], shade(t.steel, -0.3));
  ctx.fillStyle = lit ? "#fff6d2" : "#c9ced8";
  ctx.fillRect(headX - w * 0.13, headY - h * 0.016, w * 0.26, h * 0.006);
  bulb(ctx, headX, headY + h * 0.004, w * 0.05, lit ? t.light : "#d7dbe4", lit, 1.1);
  if (!lit) return;
  // 光锥：多边形给形状，径向渐变给衰减。远近两端都落在 alpha≈0 上
  const cone = ctx.createRadialGradient(headX, headY, w * 0.1, headX, headY, h * 0.98);
  cone.addColorStop(0, "rgba(255,232,168,.34)");
  cone.addColorStop(0.45, "rgba(255,226,150,.14)");
  cone.addColorStop(1, "rgba(255,220,140,0)");
  ctx.fillStyle = cone;
  poly(ctx, [
    [headX - w * 0.14, headY - h * 0.01], [headX + w * 0.14, headY - h * 0.01],
    [headX + w * 1.15, 0], [headX - w * 1.15, 0],
  ], ctx.fillStyle);
  // 地面上那块亮斑：也是渐变的，边不能硬
  const pool = ctx.createRadialGradient(headX, 0.06, 0.05, headX, 0.06, w * 1.25);
  pool.addColorStop(0, "rgba(255,228,158,.3)");
  pool.addColorStop(1, "rgba(255,224,150,0)");
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(headX, 0.06, w * 1.25, h * 0.045, 0, 0, TAU);
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
  // 网格**必须**被裁进框里，理由见 `parts.mjs` 的 `wireMesh`。
  wireMesh(ctx, { x0: -w / 2, x1: w / 2, y0: 0, y1: h }, w * 0.14, "rgba(180,192,210,.55)", 0.018);
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
