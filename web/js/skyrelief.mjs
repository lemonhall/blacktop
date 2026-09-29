/**
 * 地势：楼群剪影、山脊、尖峰、雪山、沙丘、海面、浪。
 *
 * 这几层的共同点是**它们在地平线上**——画的是"远处有什么"，尺度和高度都按
 * 地平线高度 `h` 的比例算，所以地平线一动，它们跟着动。
 *
 * 光是同一个方向：一律**从左上来**。八条路摆在一起时，"所有的山都是同一束光
 * 照出来的"这件事，比每一座山画得多细都重要。
 */

import { hash2 } from "../../sim/rng.mjs";

/** 一条锯齿山脊的"齿"：顶点与两侧谷底，都按世界 x 定死，所以每一帧长得一样。 */
function teeth(layer, w, h, step) {
  const out = [];
  for (let i = 0; i * step <= w + step; i++) {
    const apex = h - h * layer.tall * (0.34 + hash2(layer.seed, i) * 0.66);
    // 谷底**不许高过相邻的峰**，否则山脊会自己咬掉自己
    const dip = h - h * layer.tall * (0.1 + hash2(layer.seed + 11, i) * 0.5);
    out.push({ x: i * step, apex, dip: Math.max(dip, apex + h * 0.015) });
  }
  return out;
}

export const RELIEF = {
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
  /**
   * 雪山：**有明暗面的山**，不是一排三角形纸片。
   *
   * 三笔一层：整条山脊填底色 → 每座山的**背光面**压一道暗 → 山顶扣一顶锯齿状的雪。
   * 上一版两层纯色三角形，看着像一排剪纸；问题不在形状，在"没有一面是暗的"。
   */
  snowridge: (p, ctx, w, h) => {
    for (const layer of p.snowridge) {
      const step = layer.step;
      const ts = teeth(layer, w, h, step);
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (const t of ts) {
        ctx.lineTo(t.x, t.dip);
        ctx.lineTo(t.x + step * 0.5, t.apex);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      if (layer.shade) {
        ctx.fillStyle = layer.shade;
        for (let i = 0; i < ts.length - 1; i++) {
          const ax = ts[i].x + step * 0.5;
          ctx.beginPath();
          ctx.moveTo(ax, h);
          ctx.lineTo(ax, ts[i].apex);
          ctx.lineTo(ax + step * 0.5, ts[i + 1].dip);
          ctx.lineTo(ax + step * 0.5, h);
          ctx.closePath();
          ctx.fill();
        }
      }
      if (layer.cap) {
        ctx.fillStyle = layer.cap;
        for (let i = 0; i < ts.length - 1; i++) {
          const t = ts[i];
          const ax = t.x + step * 0.5;
          // 雪线沿**两侧山坡**各往下走一段：`f` 是"从山顶往下走了几分之几"。
          // 上一版的雪顶是一块横着的宽帽子，看着像插在山尖上的一把伞——
          // 山顶的雪必须顺坡走，才是长在山上的。
          const f = layer.capAt ?? 0.55;
          const lx = ax - step * 0.5 * f, ly = t.apex + (t.dip - t.apex) * f;
          const rx = ax + step * 0.5 * f, ry = t.apex + (ts[i + 1].dip - t.apex) * f;
          ctx.beginPath();
          ctx.moveTo(ax, t.apex);
          ctx.lineTo(lx, ly);
          // 底边是锯齿：雪线本来就不是一条直边
          ctx.lineTo(lx + (ax - lx) * 0.34, ly - (ly - t.apex) * 0.2);
          ctx.lineTo((lx + rx) / 2, (ly + ry) / 2 + (ry - t.apex) * 0.22);
          ctx.lineTo(rx - (rx - ax) * 0.34, ry - (ry - t.apex) * 0.2);
          ctx.lineTo(rx, ry);
          ctx.closePath();
          ctx.fill();
        }
      }
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
};
