/**
 * 天空与地平线：一张**离屏画布**，一局只画一次。
 *
 * 天空里几乎没有会动的东西，所以每帧重画它纯属浪费。真正每帧变的只有路和车。
 *
 * 八条赛道八种天，而且是**数据驱动**的：`PALETTES` 里一条一行，要画哪几层由
 * `layers` 说出来。加第九种天只需要加一张表，不用碰任何一段绘制代码——
 * 上一版是"城市走 dusk、荒野走 noon、别的都走 dusk"，于是第三条路就露馅了。
 */

import { hash2 } from "../../sim/rng.mjs";
import { BY_MODE, PALETTES } from "./skies.mjs";

const cache = new Map();

export const skyOf = key => (PALETTES[key] ? key : (BY_MODE[key] || "dusk"));
export const skyIds = () => Object.keys(PALETTES);

export function backdrop(key, w, h, horizon) {
  const id = skyOf(key);
  const cacheKey = `${id}:${w}x${h}:${Math.round(horizon)}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, w);
  canvas.height = Math.max(2, Math.round(horizon) + 2);
  const ctx = canvas.getContext("2d");
  paint(PALETTES[id], ctx, canvas.width, canvas.height);
  cache.set(cacheKey, canvas);
  if (cache.size > 6) cache.delete(cache.keys().next().value);
  return canvas;
}

function paint(p, ctx, w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  for (const [at, color] of p.sky) sky.addColorStop(at, color);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  for (const layer of p.layers) PAINT[layer](p, ctx, w, h);
}

/** 每一层怎么画。参数是同一种天的表，所以一层可以被多种天复用。 */
const PAINT = {
  stars: (p, ctx, w, h) => {
    for (let i = 0; i < (p.stars || 0); i++) {
      ctx.fillStyle = `rgba(255,255,255,${(0.1 + hash2(17, i) * 0.5).toFixed(2)})`;
      ctx.fillRect(hash2(11, i) * w, hash2(13, i) * h * 0.58, 1.6, 1.6);
    }
  },
  sun: (p, ctx, w, h) => {
    const s = p.sun;
    const cx = w * s.x, cy = h * s.y, r = h * s.r;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3.4);
    glow.addColorStop(0, s.color);
    glow.addColorStop(0.4, s.halo);
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
  clouds: (p, ctx, w, h) => {
    const c = p.clouds;
    for (let i = 0; i < c.count; i++) {
      const cx = hash2(3, i) * w, cy = h * (0.16 + hash2(5, i) * 0.42);
      const cw = w * (0.08 + hash2(7, i) * 0.12), ch = cw * 0.22;
      ctx.fillStyle = `${c.color}${(c.alpha + hash2(9, i) * 0.2).toFixed(2)})`;
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.ellipse(cx + (k - 2) * cw * 0.24, cy + (hash2(i + 31, k) - 0.5) * ch, cw * 0.34, ch, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },
  skyline: (p, ctx, w, h) => {
    for (const layer of p.skyline) {
      ctx.fillStyle = layer.color;
      const bw = w / layer.count;
      for (let i = 0; i < layer.count; i++) {
        const th = h * layer.tall * (0.35 + hash2(layer.seed, i) * 0.65);
        ctx.fillRect(i * bw, h - th, bw * 0.92, th);
        if (hash2(layer.seed + 5, i) > 0.6) {
          ctx.fillRect(i * bw + bw * 0.36, h - th - h * 0.06, bw * 0.12, h * 0.06);
        }
      }
    }
  },
  ridge: (p, ctx, w, h) => {
    for (const layer of p.ridge) {
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += layer.step) {
        ctx.lineTo(x, h - h * 0.1 - hash2(layer.seed, Math.round(x / layer.step)) * h * layer.tall * 0.62);
      }
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    }
  },
  peaks: (p, ctx, w, h) => {
    for (const layer of p.peaks) {
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += layer.step) {
        const peak = h * layer.tall * (0.4 + hash2(layer.seed, Math.round(x / layer.step)) * 0.6);
        // 山脊要有尖：斜着上去、斜着下来，而不是一串方波
        ctx.lineTo(x, h - peak * 0.6);
        ctx.lineTo(x + layer.step * 0.5, h - peak);
        ctx.lineTo(x + layer.step, h - peak * 0.55);
      }
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    }
  },
  dunes: (p, ctx, w, h) => {
    for (const layer of p.dunes) {
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w + 40; x += 40) {
        ctx.lineTo(x, h - h * layer.tall * (0.4 + hash2(layer.seed, Math.round(x / 40)) * 0.6));
      }
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    }
  },
  seaband: (p, ctx, w, h) => {
    ctx.fillStyle = p.seaband;
    ctx.fillRect(0, h - Math.max(3, h * 0.06), w, Math.max(3, h * 0.06));
  },
  waves: (p, ctx, w, h) => {
    const y = h - Math.max(3, h * 0.06);
    ctx.fillStyle = p.waves;
    for (let x = 0; x < w; x += 9) ctx.fillRect(x, y + 1, 3.5, 1);
  },
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
          ctx.fillRect(x - tw * 0.4, h * (0.1 + hash2(layer.seed + 7, i) * 0.5), tw * 1.8, Math.max(1.2, h * 0.006));
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
    // 再叠两层更窄、更淡的：雾不是一条平直的带子
    for (let i = 0; i < 3; i++) {
      const y = h * (0.82 + i * 0.05);
      ctx.fillStyle = m.mid;
      ctx.fillRect(0, y, w, Math.max(1, h * 0.012));
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
  snowfall: (p, ctx, w, h) => {
    for (let i = 0; i < 130; i++) {
      ctx.fillStyle = `rgba(255,255,255,${(0.16 + hash2(97, i) * 0.5).toFixed(2)})`;
      ctx.fillRect(hash2(93, i) * w, hash2(95, i) * h, 1.7, 1.7);
    }
  },
};
