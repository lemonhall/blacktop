/**
 * 天空与地平线：一张**离屏画布**，一局只画一次。
 *
 * 天空里几乎没有会动的东西，所以每帧重画它纯属浪费。真正每帧变的只有路和车。
 *
 * 八条赛道八种天，而且是**数据驱动**的：`PALETTES` 里一条一行，要画哪几层由
 * `layers` 说出来。加第九种天只需要加一张表，不用碰任何一段绘制代码——
 * 上一版是"城市走 dusk、荒野走 noon、别的都走 dusk"，于是第三条路就露馅了。
 */

import { BY_MODE, PALETTES } from "./skies.mjs";
import { PAINT } from "./skyart.mjs";

const cache = new Map();

export const skyOf = key => (PALETTES[key] ? key : (BY_MODE[key] || "dusk"));
export const skyIds = () => Object.keys(PALETTES);
export { PAINT };

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
