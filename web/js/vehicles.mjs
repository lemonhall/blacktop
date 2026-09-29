/**
 * 路上的车：同向的慢车（用来超）、对向来车（用来躲），以及那一辆**大运**。
 *
 * 车流是这个世界里"不属于任何玩家"的东西——同一间房里所有人看到的是同一批车。
 * 所以它们的画法必须一眼能读出三件事：**多大、朝哪、要不要躲**。
 * 尺寸取 `sim/traffic.mjs` 里那份碰撞表，画出来的宽度就是判定的宽度：
 * 玩家撞上时不会觉得"明明还有空隙"。这比画面好看重要。
 */

import { VEHICLES } from "/sim/traffic.mjs";
import { TAU } from "/sim/constants.mjs";
import { shade } from "./sprites.mjs";

/** 车身高度（米）。`traffic.mjs` 只定义长宽（碰撞只需要那两个），高度是纯画面的事。 */
const HEIGHT = { car: 1.42, van: 1.95, truck: 3.2, oncom: 1.42, dayun: 3.95 };

/** 一辆车的颜色由它的 id 定死：同一辆车在两帧之间不会变色。 */
const PAINT = ["#c8d5e8", "#93a6c2", "#e3e6f0", "#46536e", "#b6c4d8", "#8a7a86", "#63748c", "#d9ccb9"];
const paintOf = id => PAINT[(id | 0) % PAINT.length];

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

/**
 * 画一辆车。`dir` 是它的行驶方向：**+1 = 和我们同向（看到的是车尾）**，
 * -1 = 迎面（看到的是车头）。`air` 是被踢飞后的离地高度（米）。
 */
export function drawVehicle(ctx, o) {
  const s = o.s;
  if (!(s > 0.04)) return;
  const info = VEHICLES[o.kind] || VEHICLES.car;
  const h = HEIGHT[o.kind] || 1.5;
  const w = info.wid;
  ctx.save();
  ctx.translate(o.cx, o.baseY - (o.air || 0) * s);
  if (o.spin) ctx.rotate(o.spin);
  ctx.scale(s, -s);
  ctx.lineJoin = "round";

  if (!o.air) {
    ctx.fillStyle = "rgba(0,0,0,.34)";
    ctx.beginPath(); ctx.ellipse(0, 0.03, w * 0.62, 0.22, 0, 0, TAU); ctx.fill();
  }
  const paint = paintOf(o.id);
  if (o.kind === "dayun") drawDayun(ctx, w, h, paint);
  else if (o.kind === "truck" || o.kind === "van") drawBoxTruck(ctx, w, h, paint, o.dir);
  else drawCar(ctx, w, h, paint, o.dir, o.kind === "oncom");
  ctx.restore();
}

/** 轿车 / 面包车：低矮、宽、有尾灯或大灯。 */
function drawCar(ctx, w, h, paint, dir, oncoming) {
  const dark = "rgba(6,8,14,.88)";
  const bodyH = h * 0.62;
  ctx.fillStyle = dark;
  roundRect(ctx, -w / 2 - 0.06, 0.14, w + 0.12, bodyH, 0.16);
  const g = ctx.createLinearGradient(0, 0.16, 0, h);
  g.addColorStop(0, shade(paint, -0.34));
  g.addColorStop(0.55, paint);
  g.addColorStop(1, shade(paint, 0.25));
  ctx.fillStyle = g;
  roundRect(ctx, -w / 2, 0.2, w, bodyH, 0.14);
  // 车顶 / 驾驶舱
  ctx.fillStyle = shade(paint, 0.12);
  roundRect(ctx, -w * 0.4, h * 0.68, w * 0.8, h * 0.32, 0.12);
  ctx.fillStyle = oncoming ? "rgba(150,190,230,.5)" : "rgba(30,42,64,.85)";
  roundRect(ctx, -w * 0.33, h * 0.72, w * 0.66, h * 0.24, 0.08);
  // 轮胎
  ctx.fillStyle = dark;
  roundRect(ctx, -w / 2 - 0.12, 0.1, 0.24, 0.5, 0.06);
  roundRect(ctx, w / 2 - 0.12, 0.1, 0.24, 0.5, 0.06);
  if (oncoming) {
    ctx.fillStyle = "#fff6cf";
    roundRect(ctx, -w * 0.44, bodyH * 0.52, 0.34, 0.18, 0.06);
    roundRect(ctx, w * 0.44 - 0.34, bodyH * 0.52, 0.34, 0.18, 0.06);
    glow(ctx, -w * 0.44 + 0.17, bodyH * 0.6, 0.7, "rgba(255,244,200,.4)");
    glow(ctx, w * 0.44 - 0.17, bodyH * 0.6, 0.7, "rgba(255,244,200,.4)");
  } else {
    ctx.fillStyle = "#ff4a5a";
    roundRect(ctx, -w * 0.46, bodyH * 0.62, 0.36, 0.2, 0.06);
    roundRect(ctx, w * 0.46 - 0.36, bodyH * 0.62, 0.36, 0.2, 0.06);
  }
}

/** 厢式车 / 重卡：方箱子，同向看到的是箱门。 */
function drawBoxTruck(ctx, w, h, paint, dir) {
  const dark = "rgba(6,8,14,.88)";
  ctx.fillStyle = dark;
  roundRect(ctx, -w / 2 - 0.07, 0.16, w + 0.14, h, 0.14);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, shade(paint, -0.4));
  g.addColorStop(1, shade(paint, 0.22));
  ctx.fillStyle = g;
  roundRect(ctx, -w / 2, 0.22, w, h - 0.06, 0.12);
  ctx.fillStyle = shade(paint, -0.5);
  roundRect(ctx, -0.05, 0.3, 0.1, h - 0.2, 0.03);
  ctx.strokeStyle = "rgba(0,0,0,.28)"; ctx.lineWidth = 0.05;
  ctx.beginPath(); ctx.moveTo(-w / 2 + 0.12, 0.5); ctx.lineTo(w / 2 - 0.12, 0.5); ctx.stroke();
  ctx.fillStyle = dark;
  roundRect(ctx, -w / 2 - 0.14, 0.08, 0.26, 0.62, 0.06);
  roundRect(ctx, w / 2 - 0.12, 0.08, 0.26, 0.62, 0.06);
  if (dir < 0) {
    ctx.fillStyle = "#fff6cf";
    roundRect(ctx, -w * 0.42, 0.62, 0.3, 0.2, 0.06);
    roundRect(ctx, w * 0.42 - 0.3, 0.62, 0.3, 0.2, 0.06);
  } else {
    ctx.fillStyle = "#ff4a5a";
    roundRect(ctx, -w * 0.44, 0.6, 0.3, 0.18, 0.06);
    roundRect(ctx, w * 0.44 - 0.3, 0.6, 0.3, 0.18, 0.06);
  }
}

/** 大运重卡：又长又宽，车尾是黄黑斜纹。整个游戏的笑点都压在这一台车上。 */
function drawDayun(ctx, w, h, paint) {
  const dark = "rgba(5,7,12,.9)";
  ctx.fillStyle = dark;
  roundRect(ctx, -w / 2 - 0.09, 0.18, w + 0.18, h, 0.12);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#6f7b90");
  g.addColorStop(0.5, "#9aa6ba");
  g.addColorStop(1, "#d3dae6");
  ctx.fillStyle = g;
  roundRect(ctx, -w / 2, 0.24, w, h - 0.08, 0.1);
  // 集装箱尾门 + 黄黑斜纹（危险品涂装）
  ctx.save();
  ctx.beginPath(); roundRect(ctx, -w / 2 + 0.16, 0.5, w - 0.32, h - 0.7, 0.08);
  ctx.clip();
  ctx.fillStyle = "#ffd23f";
  ctx.fillRect(-w / 2, 0.5, w, h - 0.7);
  ctx.fillStyle = "#16181f";
  for (let i = -6; i < 14; i++) {
    ctx.beginPath();
    const x0 = -w / 2 + i * 0.5;
    ctx.moveTo(x0, 0.5); ctx.lineTo(x0 + 0.25, 0.5);
    ctx.lineTo(x0 + 0.25 + h, h - 0.2); ctx.lineTo(x0 + h, h - 0.2);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = "rgba(10,14,22,.9)";
  roundRect(ctx, -w / 2 + 0.16, 0.5, w - 0.32, 0.16, 0.04);
  ctx.fillStyle = "#e8edf7";
  roundRect(ctx, -0.75, h * 0.52, 1.5, 0.4, 0.06);
  // 双排轮
  ctx.fillStyle = dark;
  roundRect(ctx, -w / 2 - 0.18, 0.1, 0.3, 0.8, 0.06);
  roundRect(ctx, w / 2 - 0.12, 0.1, 0.3, 0.8, 0.06);
  ctx.fillStyle = "#ff4a5a";
  roundRect(ctx, -w * 0.46, 0.4, 0.34, 0.18, 0.05);
  roundRect(ctx, w * 0.46 - 0.34, 0.4, 0.34, 0.18, 0.05);
  void paint;
}

/** 灯光的光晕：画在车身上是一片亮斑，但足够让夜里那辆车"在发光"。 */
function glow(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  circle(ctx, x, y, r);
}
