/**
 * 路边**盖起来的地标**：报刊亭、谷仓、风车、水塔、井架、灯塔。
 *
 * 这一组是"远处的地标"——玩家在两百米外认出一条路，靠的不是路本身（伪 3D 的路
 * 都是直的），而是这些轮廓：谷仓那个双折屋顶、灯塔那条红白带、井架那个三角。
 * 所以它们的画法第一原则是**剪影要能认**，第二才是近处的细节。
 *
 * 近处那些屋子与杂物（护林站、山地木屋、筒仓、集装箱、油桶）在 `propsyard.mjs`：
 * 它们只在几十米内起作用，重点反过来是材质而不是轮廓。
 *
 * 坐标系：米，y 向上，原点在接地点。
 */

import { TAU } from "../../sim/constants.mjs";
import { hash2 } from "../../sim/rng.mjs";
import { hgrad, poly, shade, vgrad } from "./art.mjs";
import {
  bulb, concreteFace, glassPane, label3d, plankFace, rustPatch, snowCap, steelPlate,
} from "./parts.mjs";

/**
 * 一个屋顶：两块斜板 + 脊线 + 檐口的暗边。所有小屋共用它。
 * 导出是因为 `propsyard.mjs` 里那几间屋子也要它——两边的屋顶必须长得一样。
 */
export function gable(ctx, w, y, rh, base, { snow = false } = {}) {
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
