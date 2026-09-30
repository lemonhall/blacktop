/**
 * 天本身：星星、太阳、辉光、热浪、云、卷云。
 *
 * 这几层的共同点是**它们都不是"东西"，是气氛**——没有轮廓、没有落地点，
 * 只有亮度和颜色。所以它们可以画得奢侈一点（渐变、裁剪、叠加），
 * 反正一整局只画一次。
 *
 * `skyart.mjs` 把四张表拼成一张 `PAINT`：天上的、地形的、地平线剪影的、前景的。
 */

import { hash2 } from "../../sim/rng.mjs";
import { withAlpha } from "./art.mjs";

export const AIR = {
  stars: (p, ctx, w, h) => {
    for (let i = 0; i < (p.stars || 0); i++) {
      ctx.fillStyle = `rgba(255,255,255,${(0.1 + hash2(17, i) * 0.5).toFixed(2)})`;
      ctx.fillRect(hash2(11, i) * w, hash2(13, i) * h * 0.58, 1.6, 1.6);
    }
  },
  sun: (p, ctx, w, h) => {
    const s = p.sun;
    const cx = w * s.x, cy = h * s.y, r = h * s.r;
    /*
     * 太阳的辉光**从圆心就开始衰减**，而且要留够档位。
     *
     * 上一版只有 0（本色）和 0.4（halo）两档，中间那段近乎平的高亮在半径四百像素
     * 时铺开来就是一枚大圆盘——和 `bloom()` 栽的是同一个跟头：半径一大，"光"就
     * 变成了"饼"。这里补成四档，并且把最亮的那一档压到 0.12 半径以内。
     */
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3.2);
    glow.addColorStop(0, s.color);
    glow.addColorStop(0.12, withAlpha(s.halo, 1.5));
    glow.addColorStop(0.36, withAlpha(s.halo, 0.46));
    glow.addColorStop(0.68, withAlpha(s.halo, 0.12));
    glow.addColorStop(1, "rgba(255,120,80,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
  },
  glow: (p, ctx, w, h) => {
    const g = p.glow;
    const glow = ctx.createRadialGradient(w * g.x, h * g.y, 0, w * g.x, h * g.y, h * g.r * 2.4);
    glow.addColorStop(0, g.color);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  },
  heat: (p, ctx, w, h) => {
    // 热浪：地平线上几条几乎看不见的横向亮线，沙漠的"热"就是这么一笔
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(255,255,255,${(0.05 + hash2(19, i) * 0.05).toFixed(2)})`;
      ctx.fillRect(0, h * (0.72 + i * 0.05), w, 1.4);
    }
  },
  /**
   * 云。
   *
   * 上一版是"五个半透明椭圆排成一排、各自 fill 一次"，于是每一朵都叠出一串
   * 深浅不一的**同心圈**——远看像一条毛毛虫，近看像剪贴画。三处修好：
   *
   *   1. **一朵云只有一个路径、只填一次**。底下一条扁矩形（平底）+ 顶上几个
   *      大小不一的圆（蓬松），并集一次 `fill`，内部再没有接缝；
   *   2. 填完**顺着原路径 `clip` 一层竖直渐变**，把云底压暗——立体感来自这一笔，
   *      而不是来自"多画几个不同 alpha 的椭圆"；
   *   3. 底部对齐到同一条基线，云才有"坐着"的重量，而不是飘着的泡泡。
   */
  clouds: (p, ctx, w, h) => {
    const c = p.clouds;
    const y0 = c.y0 ?? 0.16, y1 = c.y1 ?? 0.42;
    const w0 = c.w0 ?? 0.08, w1 = c.w1 ?? 0.12;
    const flat = c.flat ?? 0.26;
    for (let i = 0; i < c.count; i++) {
      const cx = -w * 0.08 + hash2(3, i) * w * 1.16;
      const cy = h * (y0 + hash2(5, i) * y1);
      const cw = w * (w0 + hash2(7, i) * w1);
      const ch = cw * flat;
      const bottom = cy + ch * 0.42;
      ctx.beginPath();
      ctx.rect(cx - cw * 0.5, cy - ch * 0.1, cw, bottom - cy + ch * 0.1);
      for (let k = 0; k < 5; k++) {
        const t = k / 4;
        const bulge = 1 - Math.abs(t - 0.5) * 0.8;
        const rx = cw * (0.2 + hash2(i * 13 + 31, k) * 0.08);
        const ry = ch * (0.5 + hash2(i * 17 + 37, k) * 0.8) * bulge;
        const x = cx + (t - 0.5) * cw * 1.02;
        const y = cy + (hash2(i * 23 + 41, k) - 0.5) * ch * 0.2;
        ctx.moveTo(x + rx, y);
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      }
      ctx.globalAlpha = c.alpha + hash2(9, i) * (c.jitter ?? 0.2);
      ctx.fillStyle = `rgb(${c.color})`;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.clip();
      const g = ctx.createLinearGradient(0, cy - ch, 0, bottom);
      g.addColorStop(0, `rgba(${c.color},0)`);
      g.addColorStop(1, `rgba(${c.shade || "150,176,206"},${c.shadeA ?? 0.5})`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - cw, cy - ch * 2.2, cw * 2.4, bottom - cy + ch * 3);
      ctx.restore();
    }
  },
  /** 卷云：高处几条拉得很长的细丝，给"天有多高"一个交代。 */
  cirrus: (p, ctx, w, h) => {
    const c = p.cirrus;
    for (let i = 0; i < c.count; i++) {
      const y = h * c.y0 + hash2(c.seed, i) * h * c.span;
      const x = hash2(c.seed + 3, i) * w;
      const len = w * (0.08 + hash2(c.seed + 7, i) * 0.16);
      const a = c.alpha + hash2(c.seed + 9, i) * 0.12;
      const g = ctx.createLinearGradient(x - len, y, x + len, y);
      g.addColorStop(0, `rgba(${c.color},0)`);
      g.addColorStop(0.5, `rgba(${c.color},${a.toFixed(2)})`);
      g.addColorStop(1, `rgba(${c.color},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, len,
        Math.max(1, h * 0.004 + hash2(c.seed + 13, i) * h * 0.006), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};
