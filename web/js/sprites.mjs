/**
 * 精灵：车手、车辆。全部用 Canvas 路径现画，**不下载任何图片**。
 *
 * 为什么不上三个维度：1991～1996 那几代《暴力摩托》本身就是"**2D 精灵 +
 * 投影伪 3D 路面**"——车手是一张画片，路面是一条带条。这条路当年跑得动，
 * 今天当然跑得动，而且它有一个现代 3D 给不了的好处：**每一台车的轮廓都锋利、
 * 一眼分得清车型**，而这对 15 台车挤在一条路上是刚需。
 *
 * 画法约定：所有函数都在一个"米"坐标系里画（y 轴向上），调用方先把原点移到
 * 车辆接地点、再 `scale(s, -s)`，`s` 的物理含义是**像素/米**。于是"这台车两米
 * 高"在代码里就是"画两格"，不需要为每种距离单独调尺寸。
 */

import { PALETTES } from "/sim/data.mjs";
import { TAU } from "/sim/constants.mjs";

const circle = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fill();
}

function poly(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

/** 深色描边：伪 3D 里远近靠对比度而不是靠模糊，描边能让车从路面上"跳出来"。 */
const ink = "rgba(6,8,14,.86)";

/**
 * 一台摩托 + 车手（后视）。
 *
 * `swing` 是出拳/飞踢的剩余时间（秒，从 0.3 递减）；`wreck` 是摔倒剩余时间。
 * `swingBack` 把这一拳镜像到另一边——回身打身后的人，手臂朝车尾甩过去，
 * 而不是越过车头。`me` 只是让"我"多一圈高亮，判定上没有任何区别。
 */
export function drawRider(ctx, o) {
  const s = o.s;
  if (!(s > 0.04)) return;
  const p = PALETTES[(o.palette | 0) & 7] || PALETTES[0];
  ctx.save();
  ctx.translate(o.cx, o.baseY);
  ctx.rotate((o.lean || 0) * 0.36);
  if (o.wreck > 0) {
    // 摔倒：整车绕接地点倒下去，压得越低越像"人车分离"。
    ctx.rotate(-1.32 * Math.min(1, o.wreck / 0.5));
  }
  ctx.scale(s, -s);
  ctx.lineJoin = "round";

  ctx.fillStyle = "rgba(0,0,0,.36)";
  ctx.beginPath(); ctx.ellipse(0, 0.03, 0.72, 0.2, 0, 0, TAU); ctx.fill();

  // 后轮
  ctx.fillStyle = ink; circle(ctx, 0, 0.34, 0.36);
  ctx.fillStyle = "#171b26"; circle(ctx, 0, 0.34, 0.29);
  ctx.fillStyle = p.bike; circle(ctx, 0, 0.34, 0.15);
  ctx.fillStyle = "#dfe6f5"; circle(ctx, 0, 0.34, 0.06);

  // 排气管
  ctx.fillStyle = "#b9c3d6";
  roundRect(ctx, -0.42, 0.3, 0.34, 0.14, 0.06);
  roundRect(ctx, 0.08, 0.3, 0.34, 0.14, 0.06);
  ctx.fillStyle = "#5b6478";
  roundRect(ctx, -0.44, 0.29, 0.1, 0.16, 0.04);
  roundRect(ctx, 0.34, 0.29, 0.1, 0.16, 0.04);

  // 车身与尾罩
  const body = ctx.createLinearGradient(0, 0.4, 0, 1.05);
  body.addColorStop(0, shade(p.bike, -0.35));
  body.addColorStop(0.45, p.bike);
  body.addColorStop(1, shade(p.bike, 0.22));
  ctx.fillStyle = body;
  roundRect(ctx, -0.36, 0.42, 0.72, 0.62, 0.16);
  ctx.fillStyle = ink;
  roundRect(ctx, -0.4, 0.5, 0.8, 0.09, 0.04);
  // 尾灯
  ctx.fillStyle = "#ff3d52";
  roundRect(ctx, -0.2, 0.93, 0.4, 0.1, 0.05);
  ctx.fillStyle = "rgba(255,90,110,.35)";
  roundRect(ctx, -0.26, 0.9, 0.52, 0.17, 0.08);
  // 车牌
  ctx.fillStyle = "#f2f5ff";
  roundRect(ctx, -0.16, 0.68, 0.32, 0.17, 0.03);

  // 腿
  ctx.strokeStyle = shade(p.trim, 0.2);
  ctx.lineWidth = 0.19; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-0.14, 1.0); ctx.lineTo(-0.34, 0.56); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0.14, 1.0); ctx.lineTo(0.34, 0.56); ctx.stroke();

  // 躯干
  const jacket = ctx.createLinearGradient(-0.34, 0, 0.34, 0);
  jacket.addColorStop(0, shade(p.jacket, -0.4));
  jacket.addColorStop(0.42, p.jacket);
  jacket.addColorStop(1, shade(p.jacket, 0.3));
  ctx.fillStyle = jacket;
  roundRect(ctx, -0.34, 1.0, 0.68, 0.74, 0.2);
  ctx.fillStyle = shade(p.jacket, -0.55);
  roundRect(ctx, -0.1, 1.02, 0.2, 0.7, 0.06);
  ctx.fillStyle = shade(p.jacket, 0.45);
  roundRect(ctx, -0.3, 1.58, 0.6, 0.1, 0.04);

  // 手臂（伸向车把）
  ctx.strokeStyle = shade(p.jacket, -0.15);
  ctx.lineWidth = 0.16;
  ctx.beginPath(); ctx.moveTo(-0.3, 1.6); ctx.lineTo(-0.38, 1.1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0.3, 1.6); ctx.lineTo(0.38, 1.1); ctx.stroke();

  // 头盔
  ctx.fillStyle = ink; circle(ctx, 0, 1.86, 0.245);
  const helm = ctx.createLinearGradient(-0.22, 0, 0.22, 0);
  helm.addColorStop(0, shade(p.helmet, -0.3));
  helm.addColorStop(0.5, p.helmet);
  helm.addColorStop(1, shade(p.helmet, 0.15));
  ctx.fillStyle = helm;
  circle(ctx, 0, 1.86, 0.215);
  ctx.fillStyle = "rgba(10,14,24,.55)";
  roundRect(ctx, -0.23, 1.82, 0.46, 0.075, 0.03);

  if (o.swing > 0) drawSwing(ctx, o.swing, p, o.swingBack);
  if (o.nitro) drawNitro(ctx, o.flameSeed || 0);
  ctx.restore();
}

/**
 * 出拳 / 飞踢：一条"伸出去又收回来"的曲线，命中感全靠这一下。
 *
 * 回身打就是把同一条轨迹**镜像**到另一侧、再压低一点：画片时代就是这么干的——
 * 一张图翻一下就多了一个方向的动作，而不是重画一套帧。
 */
function drawSwing(ctx, swing, p, back) {
  const k = Math.sin(Math.min(1, 1 - swing / 0.3) * Math.PI);
  ctx.save();
  ctx.translate(back ? -0.3 : 0.3, back ? 1.3 : 1.42);
  if (back) ctx.scale(-1, 1);
  // 回身那一拳再多压下去一点：从车尾看过去，"往后甩"和"往旁边伸"的区别，
  // 全在这点角度上。
  ctx.rotate(-1.05 - 0.5 * k - (back ? 0.62 : 0));
  const reach = (back ? 0.56 : 0.5) + k * 0.32;
  ctx.strokeStyle = shade(p.jacket, 0.15);
  ctx.lineWidth = 0.17; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(reach, 0.16); ctx.stroke();
  ctx.fillStyle = shade(p.helmet, 0.1);
  roundRect(ctx, reach - 0.08, 0.06, 0.24, 0.2, 0.07);
  ctx.restore();
}

/** 氮气：排气口喷两口白热火焰，位置与长度用一条极便宜的伪随机流抖动。 */
function drawNitro(ctx, seed) {
  const t = performance.now() / 90 + seed;
  for (const side of [-0.27, 0.27]) {
    const len = 0.7 + Math.sin(t * 2.3 + side) * 0.28;
    const g = ctx.createLinearGradient(0, 0.36, 0, 0.36 - len);
    g.addColorStop(0, "rgba(255,255,255,.95)");
    g.addColorStop(0.35, "rgba(120,220,255,.85)");
    g.addColorStop(1, "rgba(60,110,255,0)");
    ctx.fillStyle = g;
    poly(ctx, [[side - 0.14, 0.4], [side + 0.14, 0.4], [side + 0.05, 0.36 - len], [side - 0.05, 0.36 - len]]);
  }
}

/** 把颜色往亮/暗推一点：伪 3D 里没有光照模型，靠它造体积。 */
export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = c => Math.max(0, Math.min(255, Math.round(c + (amount > 0 ? (255 - c) : c) * amount)));
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `rgb(${r},${g},${b})`;
}
