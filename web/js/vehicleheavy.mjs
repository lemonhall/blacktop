/**
 * 大车那一组：厢货、重卡、公交、集装箱半挂、油罐车、搅拌车。
 *
 * 这六台是"路上真正的障碍"：它们占满一条车道、追尾必摔、踹飞了够爽一整天。
 * 所以画法的第一原则是**先让人认出有多大**——六个轮子、两层楼高的车头、
 * 后面还拖着一串东西。第二原则才是好看。
 *
 * 每一台都必须能说出它和旁边那台的区别，这是这一步的全部工作量：
 *   - 厢货：一整个方箱子，同向看到两扇门；
 *   - 重卡：箱子上还有一排铰链和加固条，比厢货高一头；
 *   - 公交：一长条车窗带，车顶有通风口；
 *   - 半挂：底盘和箱子之间**有一道缝**（那是拖头和挂车），箱子是竖楞的；
 *   - 油罐：圆筒 + 一道箍 + 尾部锥形的卸料口，最危险的一台；
 *   - 搅拌车：后面背着一个斜着的圆罐，罐口朝后。
 */

import { bloom, hgrad, shade, sheen, vgrad } from "./art.mjs";
import {
  GLASS, INK, circle, damagePass, lamp, plate, roundRect, shatter, tornBumper, wheel,
} from "./vehicleparts.mjs";

/** 一排竖楞（集装箱的侧壁）。 */
function ribs(ctx, x0, x1, y0, y1, step = 0.4) {
  ctx.fillStyle = "rgba(12,16,26,.24)";
  for (let x = x0; x < x1; x += step) ctx.fillRect(x, y0, 0.05, y1 - y0);
  ctx.fillStyle = "rgba(255,255,255,.12)";
  for (let x = x0 + 0.14; x < x1; x += step) ctx.fillRect(x, y0, 0.02, y1 - y0);
}

/** 双联后轮：大车"重"的全部证据。它比任何尺寸数字都直观。 */
function dualWheel(ctx, x, y, hh, ww) {
  wheel(ctx, x, y, hh, ww);
  wheel(ctx, x + ww * 1.15, y, hh, ww);
}

/**
 * 厢货 / 重卡。同向：两扇箱门 + 铰链 + 加固条；迎面：风挡 + 雨刷 + 格栅。
 * `tall` 是重卡与厢货的唯一区别——它比厢货高一截，顶上多一排出风筒。
 */
export function drawBox(ctx, w, h, paint, dir, dmg, tall) {
  const W2 = w / 2, oncoming = dir < 0;
  wheel(ctx, -W2 - 0.06, 0.06, 0.66, 0.28);
  wheel(ctx, W2 + 0.06, 0.06, 0.66, 0.28);
  ctx.fillStyle = INK;
  roundRect(ctx, -W2 - 0.06, 0.2, w + 0.12, h * 0.92, 0.12);
  ctx.fillStyle = vgrad(ctx, 0, 0.26, h * 0.95, [
    [0, shade(paint, -0.44)], [0.4, paint], [1, shade(paint, 0.2)],
  ]);
  roundRect(ctx, -W2, 0.26, w, h * 0.84, 0.1);
  ctx.fillStyle = hgrad(ctx, -W2, W2, h * 0.6, [
    [0, "rgba(255,255,255,.2)"], [0.4, "rgba(255,255,255,0)"], [1, "rgba(0,0,0,.3)"],
  ]);
  roundRect(ctx, -W2, 0.26, w, h * 0.84, 0.1);
  ctx.fillStyle = "rgba(255,255,255,.16)";
  ctx.fillRect(-W2, h * 0.98, w, h * 0.05);
  if (tall) {
    ctx.fillStyle = "rgba(10,14,22,.55)";
    for (let i = -1; i <= 1; i++) roundRect(ctx, i * w * 0.26 - 0.1, h * 1.03, 0.2, 0.08, 0.02);
  }
  if (oncoming) {
    ctx.fillStyle = GLASS;
    roundRect(ctx, -w * 0.36, h * 0.62, w * 0.72, h * 0.26, 0.06);
    if (dmg > 0.4) shatter(ctx, -w * 0.36, h * 0.62, w * 0.72, h * 0.26);
    else sheen(ctx, -w * 0.36, h * 0.62, w * 0.72, h * 0.26, 0.14);
    // 格栅：大车迎面那一块是三分之二的车头高，省掉它就不像货车了
    ctx.fillStyle = "rgba(12,16,24,.9)";
    roundRect(ctx, -w * 0.34, h * 0.36, w * 0.68, h * 0.2, 0.04);
    ctx.fillStyle = "#8b93a3";
    for (let i = 0; i < 3; i++) ctx.fillRect(-w * 0.31, h * 0.39 + i * h * 0.05, w * 0.62, 0.02);
  } else {
    ctx.fillStyle = "rgba(6,9,16,.55)";
    ctx.fillRect(-0.035, h * 0.34, 0.07, h * 0.54);
    ctx.fillStyle = "rgba(6,9,16,.32)";
    for (const x of [-w * 0.4, w * 0.4]) ctx.fillRect(x, h * 0.34, 0.06, h * 0.54);
    ctx.fillStyle = "#8b93a3";
    for (const side of [-1, 1]) {
      ctx.fillRect(side * w * 0.09 - 0.035, h * 0.5, 0.07, 0.22);
      ctx.fillRect(side * w * 0.13 - 0.05, h * 0.42, 0.1, 0.06);
      ctx.fillRect(side * w * 0.13 - 0.05, h * 0.76, 0.1, 0.06);
    }
    ctx.fillStyle = "rgba(6,9,16,.4)";
    ctx.fillRect(-W2, h * 0.3, w, 0.05);
  }
  damagePass(ctx, w, h, dmg);
  if (dmg > 0.5) tornBumper(ctx, w, 0.3, dmg);
  else { ctx.save(); ctx.translate(0, 0); plate(ctx, 0.42, 0.24); ctx.restore(); }
  for (const side of [-1, 1]) {
    lamp(ctx, side * w * 0.42, 0.56, 0.28, 0.17, dir);
    bloom(ctx, side * w * 0.42, 0.64, oncoming ? 0.95 : 0.6,
      oncoming ? "rgba(255,246,207,.45)" : "rgba(255,74,90,.3)", 0.8);
  }
}

/**
 * 公交车：一条 11.5 米长的车厢，侧面一整排车窗。
 * 迎面看是两块大玻璃 + 腰线；同向看是后窗和两扇对开的门。
 */
export function drawBus(ctx, w, h, paint, dir, dmg) {
  const W2 = w / 2, oncoming = dir < 0;
  dualWheel(ctx, -W2 - 0.08, 0.05, 0.7, 0.26);
  dualWheel(ctx, W2 - 0.2, 0.05, 0.7, 0.26);
  ctx.fillStyle = INK;
  roundRect(ctx, -W2 - 0.06, 0.18, w + 0.12, h * 0.94, 0.1);
  ctx.fillStyle = vgrad(ctx, 0, 0.24, h * 0.94, [
    [0, shade(paint, -0.42)], [0.42, paint], [1, shade(paint, 0.22)],
  ]);
  roundRect(ctx, -W2, 0.24, w, h * 0.86, 0.08);
  // 腰线：中国公交那一身"上浅下深"，一笔就把"这是公交车"说清楚了
  ctx.fillStyle = shade(paint, -0.3);
  roundRect(ctx, -W2, 0.24, w, h * 0.3, 0.06);
  ctx.fillStyle = "rgba(255,255,255,.5)";
  ctx.fillRect(-W2, h * 0.52, w, 0.035);
  // 车窗带
  ctx.fillStyle = oncoming ? "rgba(150,190,230,.5)" : GLASS;
  for (let i = -2; i <= 2; i++) {
    const x = i * w * 0.185 - w * 0.075;
    roundRect(ctx, x, h * 0.62, w * 0.15, h * 0.26, 0.03);
  }
  if (dmg > 0.4) shatter(ctx, -w * 0.4, h * 0.62, w * 0.8, h * 0.26);
  else sheen(ctx, -w * 0.4, h * 0.6, w * 0.8, h * 0.28, 0.12);
  // 车顶通风口：公交车顶上那几个凸起，是它和集装箱的区别
  ctx.fillStyle = "rgba(12,16,24,.5)";
  for (const x of [-w * 0.24, 0.06 * w, w * 0.3]) roundRect(ctx, x, h * 1.0, w * 0.14, 0.07, 0.02);
  damagePass(ctx, w, h, dmg);
  plate(ctx, 0.4, 0.26);
  for (const side of [-1, 1]) {
    lamp(ctx, side * w * 0.42, 0.54, 0.3, 0.16, dir);
    bloom(ctx, side * w * 0.42, 0.62, oncoming ? 1 : 0.55,
      oncoming ? "rgba(255,246,207,.42)" : "rgba(255,74,90,.28)", 0.75);
  }
}

/**
 * 集装箱半挂：**拖头与挂车之间那道缝**是它唯一的身份证明。
 * 箱子是竖楞的，比拖头高出半米，尾部挂着两块反光板。
 */
export function drawContainer(ctx, w, h, paint, dir, dmg) {
  const W2 = w / 2, oncoming = dir < 0;
  dualWheel(ctx, -W2 - 0.08, 0.05, 0.78, 0.28);
  dualWheel(ctx, -W2 + 0.5, 0.05, 0.7, 0.26);
  dualWheel(ctx, W2 - 0.3, 0.05, 0.7, 0.26);
  // 挂车箱体
  const boxTop = h * 0.9;
  ctx.fillStyle = INK;
  roundRect(ctx, -W2 - 0.06, h * 0.24, w + 0.12, boxTop, 0.06);
  ctx.fillStyle = hgrad(ctx, -W2, W2, h * 0.6, [
    [0, "#9aa6b8"], [0.42, "#7c8798"], [1, "#525c69"],
  ]);
  roundRect(ctx, -W2 - 0.02, h * 0.28, w + 0.04, boxTop - 0.05, 0.05);
  ribs(ctx, -W2 + 0.2, W2 - 0.2, h * 0.32, h * 1.02, 0.44);
  ctx.fillStyle = "rgba(255,255,255,.16)";
  ctx.fillRect(-W2, h * 1.1, w, 0.03);
  // 拖头：画在箱子前面（迎面时看得见，同向时只露出一点）
  ctx.fillStyle = vgrad(ctx, 0, 0.26, h * 0.6, [
    [0, shade(paint, -0.44)], [0.42, paint], [1, shade(paint, 0.2)],
  ]);
  if (oncoming) {
    roundRect(ctx, -w * 0.44, 0.3, w * 0.88, h * 0.62, 0.08);
    ctx.fillStyle = GLASS;
    roundRect(ctx, -w * 0.36, h * 0.6, w * 0.72, h * 0.24, 0.05);
    if (dmg > 0.4) shatter(ctx, -w * 0.36, h * 0.6, w * 0.72, h * 0.24);
    else sheen(ctx, -w * 0.36, h * 0.6, w * 0.72, h * 0.24, 0.16);
    ctx.fillStyle = "rgba(12,16,24,.9)";
    roundRect(ctx, -w * 0.3, h * 0.34, w * 0.6, h * 0.2, 0.03);
    ctx.fillStyle = "#b9c2d0";
    for (let i = 0; i < 3; i++) ctx.fillRect(-w * 0.27, h * 0.37 + i * h * 0.05, w * 0.54, 0.02);
  } else {
    // 两道反光板 + 尾门竖楞：夜里跟在一台半挂后面，这是唯一的提示
    ctx.fillStyle = "rgba(255,80,80,.75)";
    for (const side of [-1, 1]) roundRect(ctx, side * w * 0.36 - 0.12, h * 0.3, 0.24, 0.1, 0.02);
  }
  damagePass(ctx, w, h, dmg);
  for (const side of [-1, 1]) lamp(ctx, side * w * 0.42, 0.52, 0.28, 0.16, dir);
  plate(ctx, 0.4, 0.26);
}

/**
 * 油罐车：一个躺着的圆筒 + 两道箍 + 尾部锥形卸料口。
 * 它是最该被踹的一台（`boom: 1.7`）——踹飞它，表现层会放一朵比别的车大一圈的火。
 */
export function drawTanker(ctx, w, h, paint, dir, dmg) {
  const W2 = w / 2, oncoming = dir < 0;
  dualWheel(ctx, -W2 - 0.06, 0.05, 0.68, 0.26);
  dualWheel(ctx, W2 - 0.4, 0.05, 0.68, 0.26);
  // 筒体：用一个超长的圆角矩形 + 顶部高光带当作圆柱
  const tank = h * 0.62, ty = h * 0.34;
  ctx.fillStyle = INK;
  roundRect(ctx, -W2 - 0.06, ty - 0.03, w + 0.12, tank + 0.06, tank * 0.42);
  ctx.fillStyle = vgrad(ctx, 0, ty, ty + tank, [
    [0, shade(paint, 0.26)], [0.3, paint], [0.72, shade(paint, -0.36)], [1, shade(paint, -0.5)],
  ]);
  roundRect(ctx, -W2, ty, w, tank, tank * 0.4);
  ctx.fillStyle = hgrad(ctx, -W2, W2, ty + tank * 0.5, [
    [0, "rgba(255,255,255,.26)"], [0.4, "rgba(255,255,255,0)"], [1, "rgba(0,0,0,.3)"],
  ]);
  roundRect(ctx, -W2, ty, w, tank, tank * 0.4);
  // 两道箍 + 顶上的检修口
  ctx.fillStyle = "rgba(16,20,28,.5)";
  for (const x of [-w * 0.26, w * 0.26]) ctx.fillRect(x, ty, 0.06, tank);
  ctx.fillStyle = "#5c6572";
  roundRect(ctx, -0.18, ty + tank - 0.02, 0.36, 0.08, 0.02);
  // 底盘 + 卸料口
  ctx.fillStyle = shade(paint, -0.4);
  roundRect(ctx, -W2, 0.24, w, h * 0.16, 0.04);
  ctx.fillStyle = "#4b5460";
  roundRect(ctx, (oncoming ? -1 : 1) * (W2 - 0.3), 0.26, 0.5, 0.22, 0.04);
  damagePass(ctx, w, h, dmg);
  plate(ctx, 0.42, 0.26);
  for (const side of [-1, 1]) lamp(ctx, side * w * 0.42, 0.5, 0.26, 0.15, dir);
  if (dmg > 0.6) {
    // 罐体被踹漏了：一道黑口子 + 一点火光，这是"最该离远点的一台"的说明书
    ctx.fillStyle = "rgba(255,140,50,.6)";
    ctx.fillRect(-0.2, ty + tank * 0.4, 0.4, 0.08);
  }
}

/** 搅拌车：车尾背着一个斜着的圆罐，罐口朝后。同向看到的是那个转着的屁股。 */
export function drawMixer(ctx, w, h, paint, dir, dmg) {
  const W2 = w / 2, oncoming = dir < 0;
  dualWheel(ctx, -W2 - 0.06, 0.05, 0.72, 0.28);
  dualWheel(ctx, W2 - 0.34, 0.05, 0.72, 0.28);
  ctx.fillStyle = INK;
  roundRect(ctx, -W2 - 0.06, 0.22, w + 0.12, h * 0.92, 0.08);
  // 驾驶室
  ctx.fillStyle = vgrad(ctx, 0, 0.28, h * 0.9, [[0, shade(paint, -0.44)], [1, shade(paint, 0.16)]]);
  roundRect(ctx, -W2, 0.28, w * 0.5, h * 0.62, 0.06);
  // 搅拌罐：一个斜着的圆角矩形（顶朝驾驶室那边倾），后面一个圆形的罐口
  ctx.fillStyle = shade(paint, -0.1);
  roundRect(ctx, -w * 0.06, h * 0.28, w * 0.5, h * 0.68, h * 0.3);
  ctx.fillStyle = "rgba(255,255,255,.18)";
  roundRect(ctx, -w * 0.02, h * 0.34, w * 0.1, h * 0.56, 0.08);
  ctx.fillStyle = "#4b5460";
  circle(ctx, w * 0.3, h * 0.62, h * 0.2);
  ctx.fillStyle = "#20242c";
  circle(ctx, w * 0.3, h * 0.62, h * 0.12);
  // 尾部溜槽
  ctx.fillStyle = "#6b7480";
  roundRect(ctx, w * 0.34, h * 0.34, w * 0.16, 0.1, 0.03);
  if (oncoming) {
    ctx.fillStyle = GLASS;
    roundRect(ctx, -w * 0.36, h * 0.6, w * 0.56, h * 0.22, 0.05);
    if (dmg > 0.4) shatter(ctx, -w * 0.36, h * 0.6, w * 0.56, h * 0.22);
  }
  damagePass(ctx, w, h, dmg);
  plate(ctx, 0.42, 0.24);
  for (const side of [-1, 1]) lamp(ctx, side * w * 0.42, 0.52, 0.26, 0.15, dir);
}
