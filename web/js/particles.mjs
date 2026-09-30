/**
 * 碎屑与烟：**粒子本身怎么画**。
 *
 * 两件小事，但它们决定了"撞车那一下"看起来像不像撞车：
 *
 *   - **烟是一团软边的云，不是一枚半透明的圆片**。上一版是实心圆 + 一个 alpha，
 *     好几团叠在一起就是一碗肥皂泡——能一颗一颗数出来。这里把烟预先烘成贴图
 *     （每种颜色三张，形状略有差别），画的时候一次 `drawImage`：边缘落在 alpha 0
 *     上，所以永远看不到硬边，也比每帧一次径向渐变便宜。
 *   - **火花是一道顺着自己速度往回拖的短划，不是屏幕上的小方块**。方块看着像撒了
 *     一地彩色纸屑；短划才有速度，而且"火星子往哪飞"这件事不用再猜。
 *
 * 贴图是**烘一次、用一整局**的：`puffSprite` 按颜色与形状号缓存，`drawPuff` 只
 * 负责缩放与浓淡。所以这里的成本是每团烟一次 `drawImage`，跟画一张图片一样。
 */

import { withAlpha } from "./art.mjs";
import { project } from "./road.mjs";

const PUFF_PX = 64;
/** 一张贴图里有几个球：三个球错开叠起来，才有"一团"的轮廓，不是一枚硬币。 */
const LOBES = [
  [[0.5, 0.5, 0.5], [0.34, 0.42, 0.34], [0.66, 0.6, 0.3]],
  [[0.46, 0.54, 0.48], [0.62, 0.4, 0.32], [0.36, 0.64, 0.28]],
  [[0.54, 0.46, 0.52], [0.38, 0.6, 0.3], [0.68, 0.56, 0.26]],
];

const puffs = new Map();

/** 一团烟的软边贴图。`v` 是形状号——同一颜色的烟也要有几种长相。 */
export function puffSprite(color, v = 0) {
  const key = `${color}|${v}`;
  const hit = puffs.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PUFF_PX;
  const g = canvas.getContext("2d");
  for (const [cx, cy, r] of LOBES[v % LOBES.length]) {
    const grad = g.createRadialGradient(cx * PUFF_PX, cy * PUFF_PX, 0, cx * PUFF_PX, cy * PUFF_PX, r * PUFF_PX * 0.62);
    // 从圆心就开始掉，边缘落在 0——和 `bloom()` 同一条规矩：有平台就是圆饼。
    grad.addColorStop(0, withAlpha(color, 1));
    grad.addColorStop(0.5, withAlpha(color, 0.55));
    grad.addColorStop(1, withAlpha(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, PUFF_PX, PUFF_PX);
  }
  puffs.set(key, canvas);
  return canvas;
}

/** 画一团烟。`x/y` 是屏幕坐标，`r` 是屏幕半径，`alpha` 是这一帧的浓淡。 */
export function drawPuff(ctx, x, y, r, color, alpha, v = 0) {
  if (r < 1) return;
  const sprite = puffSprite(color, v);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/** 这一团烟用哪张形状。按出生位置定，所以同一团烟每一帧长得一样。 */
export const variantOf = p => Math.abs(Math.round(p.x * 7 + p.z * 13)) % 3;

/** 尾巴拖多久。0.04 秒：六十迈的火星子拖出一道几十像素的划。 */
const TRAIL = 0.04;
/** 尾巴最长这么长（屏幕像素）。再长就不像火星子，像一根筷子。 */
const TAIL_MAX = 90;
/** 火星子的粗细上限（屏幕像素）。一厘米的铁屑**不**该画成一根三十像素宽的巧克力棒。 */
const WIDTH_MAX = 6;

/** 一层铁屑在屏幕上的粗细。上限的意义：别让近距离的一粒火星变成一根巧克力棒。 */
export const sparkWidth = (size, ppm) => Math.max(1, Math.min(WIDTH_MAX, size * ppm * 0.9));

/**
 * 画一粒火星：从它此刻的位置，往**它来的方向**拖一道短划。
 *
 * `hillAt` 是"这条路在某处多高"，粒子自己的 `y` 是离地高度——两者相加才是世界
 * 高度（`project` 要的是后者，见 `render.mjs` 里那段说明）。
 */
export function drawSpark(ctx, cam, tbl, hillAt, p) {
  const q = project(cam, tbl, p.x, hillAt(p.z) + p.y, p.z);
  // 屏幕外的不画：撞车那一瞬间，火星子会往两侧甩出去几十粒，其中一大半落在画面
  // 左右之外——以前它们照样要各画一笔，只是最后没落在屏幕上。
  if (!q || q.ppm < 0.25 || q.sx < -30 || q.sx > cam.W + 30 || q.sy < -30 || q.sy > cam.H + 30) return;
  const z2 = p.z - p.vz * TRAIL;
  const q2 = project(cam, tbl, p.x - p.vx * TRAIL, hillAt(z2) + p.y - p.vy * TRAIL, z2);
  const w = sparkWidth(p.size, q.ppm);
  // 尾巴：短于半个身位就当一个点（原地炸开的火星子是圆的，不是一根棍）；
  // 长了就按屏幕长度截断——近处那几粒本来会拖出一整条横跨半个屏幕的杠。
  let ex = q.sx, ey = q.sy;
  if (q2) {
    const dx = q2.sx - q.sx, dy = q2.sy - q.sy;
    const len = Math.hypot(dx, dy);
    if (len > w * 0.8) {
      const k = Math.min(1, TAIL_MAX / len);
      ex = q.sx + dx * k;
      ey = q.sy + dy * k;
    }
  }
  const a = Math.max(0, p.life / p.max);
  ctx.save();
  // **加色**：火星子是把夜路"点亮"的那一点火，不是刷在上面的颜料。用普通混合
  // 画，近处那一粒就是一坨糊在路面上的橙色牙膏；加色混合才有"烧红的铁"那种
  // 中心发白、外圈发暖的余晖。
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.strokeStyle = p.color;
  ctx.beginPath();
  ctx.moveTo(q.sx, q.sy);
  ctx.lineTo(ex, ey);
  // 底下先铺一道更粗更淡的**热晕**，再压上细而亮的一条芯。只有一条细线的话，
  // 夜里看着像一根针；只有晕没有芯，就是一坨雾。
  ctx.globalAlpha = a * 0.16;
  ctx.lineWidth = w * 2.4;
  ctx.stroke();
  ctx.globalAlpha = a;
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.restore();
}
