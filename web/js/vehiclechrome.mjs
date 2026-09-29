/**
 * 车上的**小东西**：玻璃后面的司机、车底那道黑、轮子后面的挡泥板、车身上的泥。
 *
 * 为什么值得单独一间：十三台车的车身长得天差地别，但"像不像一台有人开的真车"
 * 有八成压在同一批零件上。上一版每一台都是"一个方盒子 + 一块玻璃"——比例没错，
 * 可它看起来像刚出厂的模型，不像在路上跑了一天的车。三件事补上，整队车的下限
 * 就抬起来了：
 *
 *   1. **玻璃后面得有人**。一块纯色的窗是空的；一个头肩剪影立刻变成"有人在开"。
 *   2. **车底不能是空的**。轮子之间有底盘、轮子后面有挡泥板，车才压在路上。
 *   3. **车一定脏**。轮子甩上来的泥积在下缘，越靠下越重——顺便把"贴纸感"抹掉。
 *
 * 坐标和 `vehicleparts.mjs` 一致：米，y 向上，原点在车轮接地点。
 */

import { TAU } from "../../sim/constants.mjs";
import { INK, roundRect } from "./vehicleparts.mjs";

/**
 * 玻璃后面的一个**头肩剪影**。`k` 是浓淡（迎面时玻璃亮，剪影就该淡一点）。
 *
 * 为什么不画五官：这个尺寸下一辆车只有几十个像素宽，一个头两个肩膀就是全部
 * 能表达的东西；画多了反而像贴了一张脸上去。
 */
export function driver(ctx, x, y, w, h, k = 1) {
  const a = Math.max(0, Math.min(1, k));
  const cw = Math.min(w * 0.5, h * 0.86);
  ctx.fillStyle = `rgba(9,13,21,${(0.7 * a).toFixed(3)})`;
  // 肩膀：比头宽，坐在窗框下沿
  roundRect(ctx, x - cw / 2, y, cw, h * 0.46, 0.05);
  // 头：一个圆，稍稍偏向驾驶位那一侧
  ctx.beginPath();
  ctx.arc(x + cw * 0.08, y + h * 0.56, cw * 0.26, 0, TAU);
  ctx.fill();
  // 后脑勺的一线光：没有它，这团黑和窗框糊在一起
  ctx.fillStyle = `rgba(196,212,236,${(0.2 * a).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(x + cw * 0.08, y + h * 0.58, cw * 0.25, 2.1, 3.5);
  ctx.lineTo(x + cw * 0.08 - cw * 0.1, y + h * 0.5);
  ctx.fill();
}

/**
 * 车底那一整条黑：轮子之间的底盘与桥。
 * 少了它，车是"浮"在两只轮子上的；有了它，车坐在自己的悬挂上。
 */
export function chassis(ctx, w, y = 0.2, h = 0.28) {
  ctx.fillStyle = INK;
  roundRect(ctx, -w / 2 - 0.04, y, w + 0.08, h, 0.05);
  ctx.fillStyle = "rgba(86,96,112,.5)";
  ctx.fillRect(-w * 0.34, y + h * 0.34, w * 0.68, 0.035);
}

/** 挡泥板：轮子后面那块垂下来的胶皮，下沿有两道褶。 */
export function flap(ctx, x, y, w = 0.3, h = 0.34) {
  ctx.fillStyle = "rgba(12,15,21,.92)";
  roundRect(ctx, x - w / 2, y, w, h, 0.03);
  ctx.fillStyle = "rgba(180,190,205,.14)";
  ctx.fillRect(x - w / 2, y + h - 0.02, w, 0.02);
  for (let i = 0; i < 2; i++) {
    ctx.fillStyle = "rgba(0,0,0,.6)";
    ctx.fillRect(x - w * 0.36, y + h * (0.3 + i * 0.34), w * 0.72, 0.012);
  }
}

/**
 * 车身下缘的**泥**：一层从下往上淡出的脏，外加几点甩上去的泥星子。
 *
 * 位置刻意压在 `h*0.1 ~ h*0.5` 之间：再高就盖住车灯和车牌，再低就看不出来。
 * `k` 给大车调浓一些——十八轮的轮子甩得比轿车狠。
 */
export function grime(ctx, w, h, k = 1) {
  const lo = h * 0.1, hi = h * 0.52, a = Math.min(1.2, k);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-w * 0.48, lo, w * 0.96, hi - lo);
  ctx.clip();
  ctx.fillStyle = "rgba(92,78,58,.36)";
  ctx.fillRect(-w * 0.48, lo, w * 0.96, (hi - lo) * 0.34);
  ctx.fillStyle = "rgba(74,62,46,.22)";
  ctx.fillRect(-w * 0.48, lo + (hi - lo) * 0.3, w * 0.96, (hi - lo) * 0.3);
  ctx.globalAlpha = Math.min(1, a);
  ctx.fillStyle = "rgba(70,58,42,.5)";
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    const x = -w * 0.4 + w * 0.8 * ((t * 1.7) % 1);
    const y = lo + (hi - lo) * (0.2 + ((i * 37) % 10) / 14);
    ctx.beginPath();
    ctx.ellipse(x, y, 0.03 + (i % 3) * 0.016, 0.02 + (i % 2) * 0.012, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** 车顶那几个**琥珀色示廓灯**：大车夜里最好认的一处标志，也是"它比轿车高"的提示。 */
export function markers(ctx, w, y) {
  for (const t of [-0.28, 0, 0.28]) {
    ctx.fillStyle = "rgba(10,13,20,.8)";
    roundRect(ctx, t * w - 0.055, y - 0.02, 0.11, 0.06, 0.02);
    ctx.fillStyle = "#ffb648";
    roundRect(ctx, t * w - 0.04, y, 0.08, 0.04, 0.015);
  }
}

/**
 * 危险品**菱形黄牌**：油罐车、搅拌车这种"踹飞它到底会怎样"的车挂的那一块。
 * 夜里的黄菱牌比车本身还亮，所以它同时也是远处识别车型的一件线索。
 */
export function placard(ctx, x, y, s = 0.3) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(8,10,16,.7)";
  ctx.beginPath();
  ctx.moveTo(0, s * 0.56); ctx.lineTo(s * 0.56, 0); ctx.lineTo(0, -s * 0.56);
  ctx.lineTo(-s * 0.56, 0); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f2c330";
  ctx.beginPath();
  ctx.moveTo(0, s * 0.46); ctx.lineTo(s * 0.46, 0); ctx.lineTo(0, -s * 0.46);
  ctx.lineTo(-s * 0.46, 0); ctx.closePath();
  ctx.fill();
  // 牌面上那个黑色标记（抽象成一段折线），只求"有东西"，不求画清
  ctx.strokeStyle = "rgba(18,16,12,.85)";
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.moveTo(-s * 0.2, -s * 0.12);
  ctx.lineTo(s * 0.14, -s * 0.02);
  ctx.lineTo(-s * 0.08, s * 0.12);
  ctx.stroke();
  ctx.restore();
}

/** 集装箱尾门那四根**锁杆**：半挂与普通货车最后的区别就在这四根竖着的铁管上。 */
export function lockRods(ctx, w, y0, y1) {
  for (const t of [-0.62, -0.22, 0.22, 0.62]) {
    const x = t * w * 0.5;
    ctx.fillStyle = "rgba(12,16,24,.55)";
    ctx.fillRect(x - 0.035, y0, 0.07, y1 - y0);
    ctx.fillStyle = "rgba(214,224,240,.34)";
    ctx.fillRect(x - 0.035, y0, 0.02, y1 - y0);
    ctx.fillStyle = "rgba(10,14,22,.8)";
    roundRect(ctx, x - 0.06, y0 + (y1 - y0) * 0.42, 0.12, 0.07, 0.02);
  }
}
