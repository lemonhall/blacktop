/**
 * 地平线上的**剪影**：林子的光柱、树干、树冠、贴地雾、飘雪，
 * 以及工业区的吊车、废气，夜市地平线上那一排霓虹。
 *
 * 和 `skyrelief.mjs`（地势）的分界线是**有没有细节**：山只看轮廓，
 * 这几层近到看得见"一根一根"。所以它们一律画在最后，压在山和天上面。
 */

import { hash2 } from "../../sim/rng.mjs";

export const SILHOUETTE = {
  shafts: (p, ctx, w, h) => {
    // 林间光柱：光从树冠的缝里漏下来，落在地上最亮。
    //
    // 三条硬规矩，都是上一版踩出来的：**每一条自己带一层竖直渐变**（两头淡、脚下
    // 亮），**窄**（宽的就不是光柱，是纸），**少**（十一条粗的叠在一起，整个林子
    // 就蒙上了一层米黄色的塑料布——试过，很难看）。
    for (let i = 0; i < p.shafts.count; i++) {
      const x = hash2(53, i) * w;
      const a = p.shafts.alpha + hash2(59, i) * 0.1;
      const topW = w * 0.016, botW = w * 0.05;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `${p.shafts.color}0)`);
      g.addColorStop(0.3, `${p.shafts.color}${(a * 0.4).toFixed(2)})`);
      g.addColorStop(0.82, `${p.shafts.color}${a.toFixed(2)})`);
      g.addColorStop(1, `${p.shafts.color}${(a * 0.5).toFixed(2)})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + topW, 0);
      ctx.lineTo(x + botW, h);
      ctx.lineTo(x + botW - topW, h);
      ctx.closePath();
      ctx.fill();
    }
  },
  standing: (p, ctx, w, h) => {
    // 贴得很近的树干：一整排黑柱子，这就是"看不见出口的林道"
    for (const layer of p.standing) {
      ctx.fillStyle = layer.color;
      const bw = w / layer.count;
      for (let i = 0; i < layer.count; i++) {
        const x = i * bw + hash2(layer.seed, i) * bw * 0.4;
        const tw = w * layer.w * (0.5 + hash2(layer.seed + 3, i));
        // 树干上粗下细，底下还压一圈暗色——不然就是一排等宽的竖条
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + tw, 0);
        ctx.lineTo(x + tw * 1.35, h);
        ctx.lineTo(x - tw * 0.35, h);
        ctx.closePath();
        ctx.fill();
        if (layer.branch) {
          ctx.fillRect(x - tw * 0.4, h * (0.1 + hash2(layer.seed + 7, i) * 0.5),
            tw * 1.8, Math.max(1.2, h * 0.006));
        }
      }
      if (layer.shade) {
        ctx.fillStyle = layer.shade;
        ctx.fillRect(0, h * 0.88, w, h * 0.12);
      }
    }
  },
  canopy: (p, ctx, w, h) => {
    // 头顶的树叶：**两排**压得很低的圆叶，天只剩下缝——红杉林道就是这个感觉。
    // 上一版只有一排、全是最深的那个绿，画出来是一片黑的横带（"一堵墙"）。
    // 两排 + 每片叶子朝下的一圈透光边，才有"头顶是活的树冠"这回事。
    const c = p.canopy;
    for (const [row, yAt, scale, color] of [
      [0, 0.06, 1.0, c.color], [1, 0.2, 0.72, c.color2],
    ]) {
      const n = Math.round(c.count * (row ? 1.5 : 1));
      for (let i = 0; i < n; i++) {
        const x = hash2(c.seed + row * 31, i) * w * 1.14 - w * 0.07;
        const r = h * (0.075 + hash2(c.seed + 1 + row * 17, i) * 0.15) * scale;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(x, h * yAt - r * 0.4, r * 1.7, r, 0, 0, Math.PI * 2);
        ctx.fill();
        // 背光边：光柱里的亮绿擦过叶缘，低头看是一片黑，抬头看才是活的
        ctx.strokeStyle = c.rim;
        ctx.lineWidth = Math.max(1, r * 0.16);
        ctx.beginPath();
        ctx.ellipse(x, h * yAt - r * 0.4, r * 1.6, r * 0.9, 0, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      }
    }
  },
  mist: (p, ctx, w, h) => {
    // 贴地的雾带：**靠地平线最浓、往上化掉**。没有它，林子就是一堵绿墙
    const m = p.mist;
    const g = ctx.createLinearGradient(0, h * (1 - m.depth), 0, h);
    g.addColorStop(0, m.none);
    g.addColorStop(0.55, m.mid);
    g.addColorStop(1, m.bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, h * (1 - m.depth), w, h * m.depth);
    // 再叠几层更窄、更淡的：雾不是一条平直的带子。
    // 条数可配——林子要三条（雾被树干切成几层），雪原一条都不能要：
    // 那三条落在山腰上会变成三条横杠，远看像图纸上的等高线。
    for (let i = 0; i < (m.bands ?? 3); i++) {
      const y = h * (0.82 + i * 0.05);
      ctx.fillStyle = m.mid;
      ctx.fillRect(0, y, w, Math.max(1, h * 0.012));
    }
  },
  snowfall: (p, ctx, w, h) => {
    for (let i = 0; i < 130; i++) {
      ctx.fillStyle = `rgba(255,255,255,${(0.16 + hash2(97, i) * 0.5).toFixed(2)})`;
      ctx.fillRect(hash2(93, i) * w, hash2(95, i) * h, 1.7, 1.7);
    }
  },
  cranes: (p, ctx, w, h) => {
    ctx.fillStyle = p.cranes.color;
    ctx.strokeStyle = p.cranes.color;
    ctx.lineWidth = 2;
    for (let i = 0; i < p.cranes.count; i++) {
      const x = hash2(p.cranes.seed, i) * w;
      const tall = h * (0.2 + hash2(p.cranes.seed + 1, i) * 0.6);
      ctx.fillRect(x, h - tall, 2.4, tall);
      // 桁架吊臂：一根横梁 + 一根斜撑，工业区最有辨识度的剪影
      ctx.fillRect(x - w * 0.03, h - tall, w * 0.09, 2);
      ctx.beginPath();
      ctx.moveTo(x, h - tall * 0.6);
      ctx.lineTo(x - w * 0.03, h - tall);
      ctx.stroke();
    }
  },
  plume: (p, ctx, w, h) => {
    // 废气：一格一格的椭圆，往上飘、越来越淡
    for (let i = 0; i < 9; i++) {
      const t = i / 9;
      ctx.fillStyle = p.plume.color.replace(/[\d.]+\)$/u, `${(0.5 - t * 0.42).toFixed(2)})`);
      ctx.beginPath();
      ctx.ellipse(w * p.plume.x + t * w * 0.08, h * 0.9 - t * h * 0.72,
        5 + t * 16, 3 + t * 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  neon: (p, ctx, w, h) => {
    for (const n of p.neon) {
      const x = n.x * w;
      ctx.fillStyle = n.color;
      ctx.fillRect(x - 1.6, h * 0.72, 3.2, h * 0.28);
      const glow = ctx.createRadialGradient(x, h * 0.85, 0, x, h * 0.85, h * 0.3);
      glow.addColorStop(0, n.color);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - h * 0.3, h * 0.55, h * 0.6, h * 0.45);
    }
  },
};
