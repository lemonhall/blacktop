/**
 * 车流的**零件库**：车身高度表、车漆、轮胎、保险杠、车牌、灯。
 *
 * 为什么单独一层：轿车、厢货、重卡、大运四种车身长相差得很远，但它们脚下的东西
 * 是同一套——而且"像不像一辆车"有八成压在这套东西上：**轮胎要压在路面上、车牌要
 * 有边框、灯要有灯碗**。以前这些零件和车身挤在一个文件里，改一个轮胎要在四百行里
 * 翻半天；现在零件住这儿，车身各画各的。
 *
 * 所有坐标都是**米**、y 轴向上、原点在车轮接地点，和 `bike.mjs` 同一套。
 */

import { TAU } from "../../sim/constants.mjs";
import { hgrad } from "./art.mjs";

/** 车身高度（米）。`traffic.mjs` 只定义长宽（碰撞只需要那两个），高度是纯画面的事。 */
export const HEIGHT = {
  car: 1.42, oncom: 1.42, police: 1.5, pickup: 1.62, trike: 1.25, tractor: 2.2,
  van: 1.95, truck: 3.2, bus: 3.1, tanker: 3.3, mixer: 3.3, container: 3.9,
  dayun: 3.95,
};

/** 一辆车的颜色由它的 id 定死：同一辆车在两帧之间不会变色。 */
export const PAINT = ["#c8d5e8", "#93a6c2", "#e3e6f0", "#46536e", "#b6c4d8", "#8a7a86", "#63748c", "#d9ccb9"];
export const paintOf = id => PAINT[(id | 0) % PAINT.length];

export const INK = "rgba(6,8,14,.9)";
export const RUBBER = "#14161c";
export const GLASS = "rgba(26,38,58,.92)";
/** 大运驾驶室那身橙漆——这一台车不需要按 id 换色，它是全场唯一的一台。 */
export const CAB = "#dc6a1e";

/** 大灯与尾灯。**这两个色值是契约**：`web-world-art.test.mjs` 按它验朝向。 */
export const HEAD_LAMP = "#fff6cf";
export const TAIL_LAMP = "#ff4a5a";

/** 被踹瘪之后露出来的断面：一块亮着的金属边 + 一片黑洞。 */
export const TORN = "#cfd6e4";

export const circle = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };

/**
 * 圆角长方体：**建路径并立刻填充**，用的是调用方刚设好的 `fillStyle`。
 *
 * 这个函数刻意做成"填"而不是"只建路径"——因为整套车身画法都是
 * `ctx.fillStyle = 某色; roundRect(...)` 这个节奏（一辆车三十几块板）。
 * 上一版它只建路径不填，症状是**所有车体、车灯、车牌全部消失**，路上只剩几个
 * 轮子和几根装饰线；而这种"代码没报错、画面缺了一大块"的毛病极难靠肉眼定位。
 * 需要一条不填充的路径时，用 `pathRound`（它只建路径，给 `clip()` 之类用）。
 */
export function roundRect(ctx, x, y, w, h, r) {
  pathRound(ctx, x, y, w, h, r);
  ctx.fill();
}

/** 只建路径、不填充。给 `clip()` 和需要自己描边的场合用。 */
export function pathRound(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/**
 * 一个轮胎（从后面/正面看，看到的是**胎面**）。
 *
 * 一条黑圆角矩形不叫轮胎，叫一块黑。让它立起来的是三样东西：**胎侧的排水沟
 * （两道横线）**、**左上被灯照到的一线亮边**、以及**底下压住路面的那一小块黑影**。
 * 这三笔加起来不到十个指令，却是"这车真的压在地上"的全部证据。
 */
export function wheel(ctx, x, y, hh, ww = 0.24) {
  // 接地阴影：轮子底下那一点点灰，比整车的影子更能说明"它压在地上"
  ctx.fillStyle = "rgba(0,0,0,.5)";
  ctx.beginPath();
  ctx.ellipse(x, y + 0.03, ww * 0.72, 0.07, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = INK;
  roundRect(ctx, x - ww / 2 - 0.022, y, ww + 0.044, hh + 0.044, 0.05);
  ctx.fillStyle = hgrad(ctx, x - ww / 2, x + ww / 2, y + hh * 0.5, [
    [0, "#2b3038"], [0.34, RUBBER], [0.8, "#0b0d12"], [1, "#06070a"],
  ]);
  roundRect(ctx, x - ww / 2, y, ww, hh, 0.045);
  // 胎面：两道排水沟 + 中间磨平的亮带
  ctx.fillStyle = "rgba(0,0,0,.5)";
  ctx.fillRect(x - ww / 2, y + hh * 0.24, ww, hh * 0.075);
  ctx.fillRect(x - ww / 2, y + hh * 0.58, ww, hh * 0.075);
  ctx.fillStyle = "rgba(196,210,232,.09)";
  ctx.fillRect(x - ww * 0.1, y + hh * 0.06, ww * 0.2, hh * 0.86);
  // 被灯照到的左缘
  ctx.fillStyle = "rgba(190,205,230,.16)";
  ctx.fillRect(x - ww / 2 + 0.012, y + hh * 0.1, 0.016, hh * 0.78);
}

/** 保险杠：车尾下缘那一块。上下两段 + 一道反光条，它比一整块灰塑料像保险杠。 */
export function bumper(ctx, w, y, h) {
  ctx.fillStyle = INK;
  roundRect(ctx, -w / 2 - 0.028, y, w + 0.056, h + 0.02, 0.05);
  ctx.fillStyle = hgrad(ctx, -w / 2, w / 2, y + h / 2, [
    [0, "#3a4049"], [0.4, "#22262f"], [1, "#14171d"],
  ]);
  roundRect(ctx, -w / 2, y, w, h, 0.045);
  ctx.fillStyle = "rgba(255,255,255,.1)";
  ctx.fillRect(-w / 2, y + h - 0.022, w, 0.022);
  // 反光条：真车保险杠上一定有，夜里它是"前面有台车"的最后一层保险
  ctx.fillStyle = "rgba(255,110,110,.5)";
  ctx.fillRect(-w / 2 + 0.08, y + h * 0.34, w - 0.16, 0.026);
}

/** 车牌。夜里一块白牌子比什么都显眼，所以它是远景也不省的一件。 */
export function plate(ctx, y, halfW = 0.24) {
  ctx.save();
  ctx.translate(0, y);
  ctx.rotate(0.02);
  ctx.fillStyle = "rgba(6,9,16,.75)";
  roundRect(ctx, -halfW - 0.014, -0.069, halfW * 2 + 0.028, 0.138, 0.022);
  ctx.fillStyle = "#e9eef8";
  roundRect(ctx, -halfW, -0.055, halfW * 2, 0.11, 0.018);
  ctx.fillStyle = "rgba(24,72,150,.9)";
  ctx.fillRect(-halfW, -0.055, 0.05, 0.11);
  ctx.fillStyle = "rgba(18,24,38,.75)";
  ctx.fillRect(-halfW + 0.08, -0.022, halfW * 2 - 0.16, 0.014);
  ctx.fillRect(-halfW + 0.08, 0.002, halfW * 1.4, 0.012);
  ctx.restore();
}

/** 车灯：灯碗 + 灯芯 + 灯罩。`dir < 0`（迎面）是暖白大灯，否则是红尾灯。 */
export function lamp(ctx, x, y, w, h, dir) {
  const oncoming = dir < 0;
  ctx.fillStyle = "rgba(6,9,16,.85)";
  roundRect(ctx, x - w / 2 - 0.022, y - 0.022, w + 0.044, h + 0.044, 0.04);
  ctx.fillStyle = oncoming ? "#fff6cf" : TAIL_LAMP;
  roundRect(ctx, x - w / 2, y, w, h, 0.035);
  // 灯罩里那一道横向反光：灯是"玻璃",不是一块贴纸
  ctx.fillStyle = oncoming ? "rgba(255,255,255,.85)" : "rgba(255,214,220,.55)";
  roundRect(ctx, x - w * 0.36, y + h * 0.5, w * 0.72, h * 0.22, 0.02);
}

/*
 * ============================================================ 被踹瘪的那一套
 *
 * 一脚踹飞一台车，光"它飞出去了"是不够的：**踹飞的过程本身就该看得见**——
 * 金属被踹进去一块、玻璃碎成星形、保险杠耷拉下来、车顶塌一个角。
 *
 * 这一套画法的规矩只有一条：**所有变形都由 `dmg`（0 = 崭新，1 = 彻底瘪了）驱动**，
 * 每个零件负责自己那一块。所以同一台车在起飞、翻滚、落地着火这几帧上，身上的伤
 * 是"长"出来的，而不是三张不同的贴图。
 *
 * `dmg` 由服务端算（`traffic.mjs` 里被踹飞之后每一格涨一点），跟着快照发过来。
 * 客户端不许自己算——不然两台机器上的同一台车会瘪得不一样。
 */

/** 褶皱：几道横着的锯齿。金属被挤过之后就是这个样子。 */
export function wrinkles(ctx, x0, x1, y0, y1, n = 4, k = 1) {
  if (!(k > 0.05)) return;
  const span = x1 - x0;
  const amp = Math.min(0.1, (y1 - y0) * 0.16) * Math.min(1.4, k);
  ctx.strokeStyle = "rgba(8,11,18,.5)";
  ctx.lineWidth = 0.028;
  for (let i = 0; i < n; i++) {
    const y = y0 + (y1 - y0) * ((i + 0.5) / n);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    const seg = 6;
    for (let s = 1; s <= seg; s++) {
      ctx.lineTo(x0 + span * (s / seg), y + (s % 2 ? amp : -amp) * (0.6 + k * 0.4));
    }
    ctx.stroke();
  }
  // 受光的一侧压一道亮线：褶皱只有"一暗一亮"才算凹凸，只有暗线就是一块脏。
  ctx.strokeStyle = "rgba(255,255,255,.12)";
  ctx.beginPath();
  ctx.moveTo(x0, y0 + (y1 - y0) * 0.28 + amp);
  ctx.lineTo(x0 + span * 0.5, y0 + (y1 - y0) * 0.28 - amp);
  ctx.stroke();
}

/** 被踹进去的那一块：一个三角凹坑 + 一圈翻起来的亮边 + 几道褶皱。 */
export function dent(ctx, x, y, w, h, depth = 0.5) {
  if (!(depth > 0.02)) return;
  const d = Math.min(1, depth) * Math.min(w, h) * 0.55;
  ctx.fillStyle = "rgba(6,9,16,.55)";
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y + h / 2);
  ctx.lineTo(x, y + h / 2 - d);
  ctx.lineTo(x + w / 2, y + h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.22)";
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y + h / 2);
  ctx.lineTo(x, y + h / 2 - d);
  ctx.lineTo(x - w * 0.1, y + h / 2 + h * 0.06);
  ctx.closePath();
  ctx.fill();
  wrinkles(ctx, x - w / 2, x + w / 2, y, y + h, 2, depth);
}

/** 撕开的一道口子：亮边 + 黑洞 +（着火时）里面一点火光。 */
export function gash(ctx, x, y, len, ang = 0, fire = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = TORN;
  roundRect(ctx, -len / 2 - 0.02, -0.055, len + 0.04, 0.11, 0.03);
  ctx.fillStyle = "#08090d";
  roundRect(ctx, -len / 2, -0.036, len, 0.072, 0.02);
  if (fire) {
    ctx.fillStyle = "rgba(255,150,60,.65)";
    roundRect(ctx, -len * 0.34, -0.02, len * 0.68, 0.04, 0.02);
  }
  ctx.restore();
}

/** 玻璃碎了：一片蛛网。只能挂在"平的那块窗"上，所以调用方给的是窗的框。 */
export function shatter(ctx, x, y, w, h) {
  const cx = x + w * 0.42, cy = y + h * 0.44;
  ctx.strokeStyle = "rgba(232,240,252,.62)";
  ctx.lineWidth = 0.022;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * w * 0.5, cy + Math.sin(a) * h * 0.55);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(w, h) * 0.3, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = "rgba(8,11,18,.5)";
  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(w, h) * 0.13, 0, TAU);
  ctx.fill();
}

/** 耷拉下来的保险杠 + 挂在上面的车牌：撞过之后这东西一定不在原位。 */
export function tornBumper(ctx, w, y, dmg = 0) {
  const drop = Math.min(1, dmg) * 0.22;
  ctx.save();
  ctx.translate(0, y - drop);
  ctx.rotate(Math.min(0.5, dmg * 0.55));
  bumper(ctx, w * (1 - dmg * 0.12), 0, 0.2);
  plate(ctx, 0.12, 0.19);
  ctx.restore();
}

/**
 * 一台车最后一道工序：把伤叠上去。
 *
 * 顺序是"先褶皱、再凹坑、最后撕口"——由浅到深。反过来画的话，最重的那道口子
 * 会被后面的褶皱盖住一半，看上去反倒像伤得轻了。
 */
export function damagePass(ctx, w, h, dmg) {
  if (!(dmg > 0.05)) return;
  const k = Math.min(1, dmg);
  wrinkles(ctx, -w * 0.44, w * 0.44, h * 0.3, h * 0.78, Math.round(2 + k * 4), k);
  dent(ctx, -w * 0.3, h * 0.34, w * 0.34, h * 0.3, k * 0.9);
  dent(ctx, w * 0.3, h * 0.52, w * 0.3, h * 0.26, k * 0.7);
  if (k > 0.45) gash(ctx, 0, h * 0.62, w * 0.42, -0.14, k > 0.75);
}
