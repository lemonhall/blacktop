/**
 * 八件彩蛋共用的**画法零件**。
 *
 * 彩蛋散在四个文件里（荒野两件、木头两件、人烟两件、院子两件），但它们的底子是
 * 同一批：一块压在地上的软影、一根会劈裂的旧木桩、一圈拧出来的麻绳、一团有明暗的
 * 雪。这些零件单独放一份的理由很实际——**彩蛋是最容易画"薄"的一类道具**：
 * 主体画好了，地面却是干的、影子是一条硬边、木头是一块纯色，于是再好笑的东西
 * 看着也像贴纸。把这四件事做扎实，八件彩蛋的下限就抬起来了。
 *
 * 坐标系和 `props.mjs` 一致：米，y 向上，原点在接地点。
 */

import { TAU } from "../../sim/constants.mjs";
import { hash2 } from "../../sim/rng.mjs";
import { hgrad, poly, shade, vgrad } from "./art.mjs";

/**
 * 一件东西压在地上的**软影**：外面一圈淡的 + 里面一块浓的。
 *
 * 为什么不是一条 `rgba` 实心椭圆：实心椭圆的边缘一刀切，看上去像地上贴了一块灰纸。
 * 两层叠起来，边缘就有了衰减，物件才像"陷在"地里。
 */
export function shadow(ctx, x, y, rx, ry, k = 1) {
  ctx.fillStyle = `rgba(6,9,16,${(0.14 * k).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 1.28, ry * 1.5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(6,9,16,${(0.24 * k).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 0.8, ry, 0, 0, TAU);
  ctx.fill();
}

/**
 * 一根**旧木桩**：左亮右暗的方料 + 三道顺纹 + 一条劈裂 + 两颗钉子 + 顶面亮一线。
 *
 * 立着的木头最容易画成一块巧克力——差别全在"顶面那一条亮"和"劈裂那一道暗"上。
 */
export function timber(ctx, x, w, h, base, seed = 1, y = 0) {
  const x0 = x - w / 2, top = y + h;
  ctx.fillStyle = hgrad(ctx, x0, x0 + w, y + h * 0.5, [
    [0, shade(base, 0.32)], [0.3, base], [1, shade(base, -0.54)],
  ]);
  ctx.fillRect(x0, y, w, h);
  // 顺纹：三道有长有短的暗线，位置由种子定，同一根桩子每帧都一样
  for (let i = 0; i < 3; i++) {
    const gx = x0 + w * (0.18 + i * 0.3) + hash2(seed, i) * w * 0.06;
    const gy = y + h * (0.06 + hash2(seed, i + 5) * 0.1);
    ctx.fillStyle = `rgba(30,19,10,${0.22 + i * 0.05})`;
    ctx.fillRect(gx, gy, Math.max(0.012, w * 0.05), h * (0.5 + hash2(seed, i + 11) * 0.4));
  }
  // 劈裂：从顶上一路裂下去，走到一半拐一下
  ctx.strokeStyle = "rgba(18,11,5,.55)";
  ctx.lineWidth = Math.max(0.02, w * 0.06);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.06, top - h * 0.05);
  ctx.lineTo(x - w * 0.16, y + h * 0.72);
  ctx.lineTo(x - w * 0.02, y + h * 0.58);
  ctx.stroke();
  // 顶面：木头的横截面偏亮，这条线一画上去，桩子立刻"立"起来了
  ctx.fillStyle = "rgba(255,246,220,.22)";
  ctx.fillRect(x0, top - w * 0.1, w, w * 0.1);
  ctx.fillStyle = "rgba(255,255,255,.12)";
  ctx.fillRect(x0 + w * 0.14, y + w * 0.06, w * 0.16, h - w * 0.2);
  // 钉子：两颗，一颗钉进去一半
  ctx.fillStyle = "#5d6470";
  ctx.beginPath();
  ctx.arc(x + w * 0.2, y + h * 0.34, Math.max(0.02, w * 0.09), 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.4)";
  ctx.beginPath();
  ctx.arc(x + w * 0.17, y + h * 0.35, Math.max(0.01, w * 0.035), 0, TAU);
  ctx.fill();
}

/**
 * 一圈**麻绳捆扎**：一条带子 + 几道斜纹（斜纹就是"拧过"的那几股），
 * 末尾再甩一小截断头出来。牛头骨挂在桩上、破船的桨绑在舷边，都靠它。
 */
export function ropeWrap(ctx, x, y, w, th, seed = 1) {
  const x0 = x - w / 2;
  ctx.fillStyle = hgrad(ctx, x0, x0 + w, y + th * 0.5, [
    [0, "#c3ab84"], [0.34, "#a8916b"], [1, "#6d5a3c"],
  ]);
  ctx.fillRect(x0, y, w, th);
  const n = Math.max(3, Math.round(w / (th * 0.8)));
  ctx.fillStyle = "rgba(58,42,22,.42)";
  for (let i = 0; i < n; i++) {
    const rx = x0 + i * (w / n);
    poly(ctx, [
      [rx, y], [rx + w / n * 0.52, y],
      [rx + w / n * 0.52 - th * 0.5, y + th], [rx - th * 0.5, y + th],
    ], ctx.fillStyle);
  }
  // 断头：一截毛边绳子垂下来，越往下越细
  const sx = x0 + w * (0.62 + hash2(seed, 3) * 0.2);
  ctx.fillStyle = "#8d7a58";
  poly(ctx, [[sx, y], [sx + th * 0.8, y], [sx + th * 0.5, y - th * 2.4], [sx + th * 0.1, y - th * 2.2]], ctx.fillStyle);
  ctx.strokeStyle = "#7a6845";
  ctx.lineWidth = Math.max(0.012, th * 0.22);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(sx + th * (0.2 + i * 0.22), y - th * 2.2);
    ctx.lineTo(sx + th * (0.1 + i * 0.3), y - th * 3.2);
    ctx.stroke();
  }
}

/** 骨头色：从左上的暖白到右下的灰黄，中间偏冷。牛头骨用它。 */
export const boneGrad = (ctx, x0, x1, y) => hgrad(ctx, x0, x1, y, [
  [0, "#f6f0df"], [0.34, "#e2dbc6"], [0.72, "#bdb39c"], [1, "#8e8674"],
]);

/**
 * 一个**雪团**：光源在左上，所以高光偏左上、右侧压一道冷蓝的暗边，
 * 最下面再补一条更深的接触影。三样齐了它才是一团雪，缺一样就是一张白饼。
 */
export function snowball(ctx, x, y, r, seed = 1) {
  const g = ctx.createRadialGradient(x - r * 0.42, y + r * 0.42, r * 0.1, x, y, r * 1.12);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.44, "#f2f6fb");
  g.addColorStop(0.78, "#dbe4ef");
  g.addColorStop(1, "#b3c2d4");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  // 右下的一道冷暗边：把球从"平面圆"变成"球"
  ctx.fillStyle = "rgba(140,162,190,.35)";
  ctx.beginPath();
  ctx.arc(x + r * 0.16, y - r * 0.14, r * 0.86, Math.PI * 1.82, Math.PI * 1.24);
  ctx.fill();
  // 底面接触影
  ctx.fillStyle = "rgba(120,142,170,.28)";
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.84, r * 0.8, r * 0.16, 0, 0, TAU);
  ctx.fill();
  // 压进去的几个小坑
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = "rgba(168,186,208,.3)";
    ctx.beginPath();
    ctx.ellipse(x + (hash2(seed, i) - 0.5) * r * 1.2, y + (hash2(seed, i + 7) - 0.4) * r,
      r * 0.1, r * 0.06, 0, 0, TAU);
    ctx.fill();
  }
}

/**
 * 一排**木板**：横向叠起来，缝里压暗、板面各自有一点色差。
 * 破船的船身、摊子的围板都是它——一块纯色的大板子最显"没画完"。
 */
export function plankLay(ctx, x, y, w, h, n, base, seed = 1) {
  const row = h / n;
  for (let i = 0; i < n; i++) {
    const k = hash2(seed, i) - 0.5;
    ctx.fillStyle = hgrad(ctx, x, x + w, y + (i + 0.5) * row, [
      [0, shade(base, 0.24 + k * 0.2)], [0.5, shade(base, k * 0.16)], [1, shade(base, -0.4 + k * 0.16)],
    ]);
    ctx.fillRect(x, y + i * row, w, row * 0.98);
    ctx.fillStyle = "rgba(26,16,8,.4)";
    ctx.fillRect(x, y + i * row - row * 0.06, w, row * 0.08);
  }
}

/** 几道**细裂缝**：石头、木头、骨头开久了都会裂。`dir` 摆向。 */
export function cracked(ctx, x, y, len, seed = 1, color = "rgba(22,14,8,.5)", dir = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.018;
  for (let i = 0; i < 3; i++) {
    const cx = x + (hash2(seed, i) - 0.5) * len * 0.7;
    const cy = y + (hash2(seed, i + 9) - 0.5) * len * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + dir * len * (0.06 + hash2(seed, i + 3) * 0.1), cy - len * 0.11);
    ctx.lineTo(cx + dir * len * (0.14 + hash2(seed, i + 5) * 0.12), cy - len * 0.04);
    ctx.stroke();
  }
}

/** 一块**苔**：几团深浅不一的绿点点在潮的地方。木头靠地那一截、石头背面。 */
export function mossy(ctx, x, y, w, h, seed = 1, k = 1) {
  for (let i = 0; i < 7; i++) {
    const mx = x + hash2(seed, i) * w;
    const my = y + hash2(seed, i + 17) * h;
    const r = Math.min(w, h) * (0.08 + hash2(seed, i + 31) * 0.12);
    ctx.fillStyle = i % 2 ? `rgba(74,116,58,${0.42 * k})` : `rgba(96,138,72,${0.34 * k})`;
    ctx.beginPath();
    ctx.ellipse(mx, my, r, r * 0.62, 0, 0, TAU);
    ctx.fill();
  }
}

/** 一层**沙/雪的堆积**：物件陷进去的那一片，边缘要散开。 */
export function drift(ctx, x, y, w, h, top, bottom, seed = 1) {
  ctx.fillStyle = vgrad(ctx, x, y, y + h, [[0, top], [1, bottom]]);
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.quadraticCurveTo(x - w * 0.3, y + h * (0.9 + hash2(seed, 1) * 0.2), x, y + h);
  ctx.quadraticCurveTo(x + w * 0.34, y + h * (0.94 + hash2(seed, 2) * 0.2), x + w / 2, y);
  ctx.closePath();
  ctx.fill();
}
