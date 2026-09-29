/**
 * 路边**地上**的东西：原木堆、巨石、小石头、草垛、风滚草。
 *
 * 从 `propsnature.mjs` 里分出来，是因为那个文件已经顶到 400 行以上，而"长在地上
 * 的植物"和"散在地面上的东西"本来就是两拨：前者靠树干与树冠的体积感，后者靠
 * **轮廓的碎**——石头要几个切面、草垛要勒出绳痕、风滚草要乱得能看出是被风吹着
 * 跑的。两类东西共用同一套坐标约定：米，y 向上，原点在接地点，横向以 0 为轴。
 */

import { TAU } from "../../sim/constants.mjs";
import { hash2 } from "../../sim/rng.mjs";
import { hgrad, poly, shade } from "./art.mjs";
import { snowCap } from "./parts.mjs";

/** 一堆原木：三层交错码起来，端面是年轮。 */
export function logpile(ctx, w, h, t, seed) {
  const r = h * 0.17;
  for (let row = 0; row < 3; row++) {
    const n = 3 - row;
    for (let i = 0; i < n; i++) {
      const x = -w * 0.36 + (i + row * 0.5) * (w * 0.34);
      const y = r + row * r * 1.85;
      ctx.fillStyle = hgrad(ctx, -w * 0.5, w * 0.5, y, [
        [0, shade(t.wood, 0.28)], [0.4, t.wood], [1, shade(t.wood, -0.44)],
      ]);
      ctx.fillRect(x - w * 0.17, y - r, w * 0.34, r * 2);
      ctx.fillStyle = "#d8bd8e";
      ctx.beginPath();
      ctx.ellipse(x + w * 0.16, y, r * 0.28, r * 0.94, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(140,108,66,.7)";
      ctx.beginPath();
      ctx.ellipse(x + w * 0.16, y, r * 0.12, r * 0.5, 0, 0, TAU);
      ctx.fill();
    }
  }
}

/** 巨石：三到四个切面，最亮的那面朝左上。 */
export function boulder(ctx, w, h, t, seed) {
  const g = hash2(seed, 3) < 0.5 ? t.stone : shade(t.stone, -0.2);
  ctx.fillStyle = shade(g, -0.34);
  poly(ctx, [
    [-w / 2, 0], [-w * 0.38, h * 0.86], [-w * 0.04, h], [w * 0.42, h * 0.7],
    [w / 2, h * 0.16], [w * 0.3, 0],
  ], shade(g, -0.34));
  ctx.fillStyle = hgrad(ctx, -w / 2, w / 2, h * 0.6, [
    [0, shade(g, 0.32)], [0.36, g], [1, shade(g, -0.3)],
  ]);
  poly(ctx, [
    [-w * 0.42, h * 0.14], [-w * 0.34, h * 0.8], [-w * 0.02, h * 0.94],
    [w * 0.28, h * 0.62], [w * 0.16, h * 0.18],
  ], ctx.fillStyle);
  ctx.fillStyle = "rgba(255,255,255,.2)";
  poly(ctx, [[-w * 0.34, h * 0.8], [-w * 0.02, h * 0.94], [-w * 0.06, h * 0.6]], "rgba(255,255,255,.2)");
  ctx.fillStyle = "rgba(6,9,16,.34)";
  ctx.beginPath();
  ctx.ellipse(0, 0.04, w * 0.56, 0.1, 0, 0, TAU);
  ctx.fill();
  if (t.snow) snowCap(ctx, -w * 0.34, h * 0.92, w * 0.5, h * 0.14, 0.9);
}

/** 小石头：巨石的简化版，但没有雪、也矮。 */
export function rock(ctx, w, h, t) {
  ctx.fillStyle = shade(t.stone, -0.3);
  poly(ctx, [[-w / 2, 0], [-w * 0.3, h * 0.9], [w * 0.16, h], [w / 2, h * 0.3], [w * 0.3, 0]],
    shade(t.stone, -0.3));
  ctx.fillStyle = hgrad(ctx, -w / 2, w / 2, h * 0.5, [
    [0, shade(t.stone, 0.3)], [0.4, t.stone], [1, shade(t.stone, -0.36)],
  ]);
  poly(ctx, [[-w * 0.34, h * 0.1], [-w * 0.24, h * 0.82], [w * 0.12, h * 0.9], [w * 0.26, h * 0.24]],
    ctx.fillStyle);
  ctx.fillStyle = "rgba(0,0,0,.3)";
  ctx.fillRect(-w * 0.42, 0, w * 0.84, 0.05);
}

/**
 * 草垛：一卷干草。
 *
 * 上一版是一个纯色长方形加几道横线，看上去像一块木地板。牧草卷真正的特征是
 * **端面那一圈一圈的螺旋**和**四周翘出来的草茬**——所以现在画成圆柱（筒身 +
 * 端面同心椭圆 + 两道勒进去的捆绳），再撒一把从卷里支出来的干草。
 */
export function haybale(ctx, w, h, t, seed) {
  const r = h * 0.5, cy = r * 0.94;
  ctx.fillStyle = hgrad(ctx, -w / 2, w / 2, cy, [
    [0, "#e8d08c"], [0.34, "#d2b063"], [1, "#8a6c30"],
  ]);
  ctx.fillRect(-w / 2, cy - r, w, r * 2);
  // 端面：一圈一圈收进去的同心椭圆（牧草卷的招牌）
  for (let i = 6; i >= 1; i--) {
    const k = i / 6;
    ctx.fillStyle = i % 2
      ? `rgba(196,168,96,${(0.42 - k * 0.1).toFixed(3)})`
      : `rgba(226,204,140,${(0.42 - k * 0.1).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(-w * 0.3, cy, r * 0.34 * k + 0.05, r * k, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(90,70,30,.42)";
  ctx.beginPath();
  ctx.ellipse(-w * 0.3, cy, r * 0.11, r * 0.3, 0, 0, TAU);
  ctx.fill();
  // 两道捆绳：勒进去一点，绳那儿有一道暗痕
  for (const f of [0.26, 0.72]) {
    ctx.fillStyle = "rgba(74,56,26,.4)";
    ctx.fillRect(-w / 2 + w * f, cy - r, w * 0.052, r * 2);
    ctx.fillStyle = "#7a5e32";
    ctx.fillRect(-w / 2 + w * f + w * 0.013, cy - r, w * 0.022, r * 2);
  }
  // 翘出来的草茬：一把散在垛面上
  ctx.strokeStyle = "rgba(150,124,54,.7)";
  ctx.lineWidth = 0.022;
  for (let i = 0; i < 18; i++) {
    const x = -w * 0.46 + hash2(seed, i) * w * 0.92;
    const y = cy - r * 0.6 + hash2(seed, i + 40) * r * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (hash2(seed, i + 80) - 0.5) * 0.3, y + 0.1 + hash2(seed, i + 120) * 0.16);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(6,9,16,.32)";
  ctx.beginPath();
  ctx.ellipse(0, 0.04, w * 0.56, h * 0.1, 0, 0, TAU);
  ctx.fill();
}

/**
 * 风滚草：一团干枝，滚在路上。
 *
 * 上一版是"从圆心放射十一条线 + 一个整圆"，画出来像一只自行车轮子。真东西是
 * **乱**的：枝条互相交叉、有的卷回中心、有的支出轮廓之外，而且整团不是圆的，
 * 是上宽下窄（它本来就是被风吹着走的）。
 */
export function tumble(ctx, w, h, t, seed) {
  const r = Math.min(w, h) * 0.5, cy = r * 1.06;
  ctx.lineCap = "round";
  // 颜色要"干"：枯草是发白的。上一版用的是木质本色（深棕），在柏油上几乎看不见，
  // 只剩一团橘色的影子——风滚草在画面上是**一掠而过的一团**，它必须先立得住。
  const dry = shade(t.wood, 0.46), dead = shade(t.wood, 0.1);
  ctx.strokeStyle = dry;
  for (let i = 0; i < 22; i++) {
    const a0 = hash2(seed, i * 3) * TAU;
    const len = r * (0.55 + hash2(seed, i * 3 + 1) * 0.95);
    const bend = (hash2(seed, i * 3 + 2) - 0.5) * 1.6;
    const x0 = Math.cos(a0) * r * 0.26, y0 = cy + Math.sin(a0) * r * 0.22;
    const x1 = Math.cos(a0 + bend * 0.34) * len, y1 = cy + Math.sin(a0 + bend * 0.34) * len * 0.88;
    const mx = (x0 + x1) / 2 + Math.cos(a0 + 1.5) * len * 0.26;
    ctx.strokeStyle = i % 3 === 0 ? dead : dry;
    ctx.lineWidth = 0.024 + hash2(seed, i + 200) * 0.02;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(mx, (y0 + y1) / 2 + 0.05);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  // 几根卷回中心的长枝：有了它才像"一团"，而不是一圈辐条
  ctx.lineWidth = 0.022;
  for (let i = 0; i < 5; i++) {
    const a = hash2(seed, i + 90) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.8);
    ctx.quadraticCurveTo(0, cy + r * 0.18, Math.cos(a + 2.4) * r * 0.7, cy + Math.sin(a + 2.4) * r * 0.7);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(6,9,16,.26)";
  ctx.beginPath();
  ctx.ellipse(0, 0.04, r * 0.9, r * 0.16, 0, 0, TAU);
  ctx.fill();
}
