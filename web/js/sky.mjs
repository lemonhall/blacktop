/**
 * 天空与地平线：一张**离屏画布**，一局只画一次。
 *
 * 天空里没有任何会动的东西，所以每帧重画它纯属浪费。真正每帧变的只有路和车。
 * 城市是黄昏（楼群剪影 + 星点），荒野是正午（远山 + 薄云）——这两套配色决定了
 * 整条赛道的情绪，所以它们写在数据里（`sim/data.mjs` 的 `sky`/`ground`）。
 */

import { hash2 } from "/sim/rng.mjs";

const cache = new Map();

export function backdrop(mode, w, h, horizon) {
  const key = `${mode}:${w}x${h}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, w);
  canvas.height = Math.max(2, Math.round(horizon) + 2);
  const ctx = canvas.getContext("2d");
  if (mode === "wild") noon(ctx, canvas.width, canvas.height);
  else dusk(ctx, canvas.width, canvas.height);
  cache.set(key, canvas);
  if (cache.size > 4) cache.delete(cache.keys().next().value);
  return canvas;
}

/** 黄昏：上深下橙，一颗压在地平线上的太阳，楼群是一排锯齿剪影。 */
function dusk(ctx, w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#080b1c");
  sky.addColorStop(0.42, "#221a44");
  sky.addColorStop(0.72, "#6b3560");
  sky.addColorStop(0.9, "#d1704f");
  sky.addColorStop(1, "#f2a866");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    const x = hash2(11, i) * w, y = hash2(13, i) * h * 0.55;
    ctx.fillStyle = `rgba(255,255,255,${0.1 + hash2(17, i) * 0.5})`;
    ctx.fillRect(x, y, 1.6, 1.6);
  }
  const sunX = w * 0.68, sunY = h * 0.86, r = h * 0.22;
  const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, r * 3.4);
  glow.addColorStop(0, "rgba(255,206,138,.85)");
  glow.addColorStop(0.4, "rgba(255,140,90,.28)");
  glow.addColorStop(1, "rgba(255,120,80,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  skyline(ctx, w, h, "#120d22", 0.52, 16, 21);
  skyline(ctx, w, h, "#1d1633", 0.34, 27, 43);
}

/** 一层楼群剪影：底边贴地平线，高度按种子抖。 */
function skyline(ctx, w, h, color, tall, seed, count) {
  ctx.fillStyle = color;
  const bw = w / count;
  for (let i = 0; i < count; i++) {
    const th = h * tall * (0.35 + hash2(seed, i) * 0.65);
    ctx.fillRect(i * bw, h - th, bw * 0.92, th);
    if (hash2(seed + 5, i) > 0.6) ctx.fillRect(i * bw + bw * 0.36, h - th - h * 0.06, bw * 0.12, h * 0.06);
  }
}

/** 正午：亮蓝色天空、几片薄云、一排远山。 */
function noon(ctx, w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#2f6fc4");
  sky.addColorStop(0.6, "#7fb2e0");
  sky.addColorStop(1, "#cfe2ee");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 7; i++) {
    const cx = hash2(3, i) * w, cy = h * (0.16 + hash2(5, i) * 0.42);
    const cw = w * (0.08 + hash2(7, i) * 0.12), ch = cw * 0.22;
    ctx.fillStyle = `rgba(255,255,255,${0.16 + hash2(9, i) * 0.2})`;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.ellipse(cx + (k - 2) * cw * 0.24, cy + (hash2(i + 31, k) - 0.5) * ch, cw * 0.34, ch, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = "rgba(120,150,170,.75)";
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 18) {
    ctx.lineTo(x, h - h * 0.1 - hash2(23, Math.round(x / 18)) * h * 0.16);
  }
  ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(90,120,140,.8)";
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 26) {
    ctx.lineTo(x, h - h * 0.04 - hash2(29, Math.round(x / 26)) * h * 0.08);
  }
  ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
}
