/**
 * 大车那一组：厢货、重卡、公交、集装箱半挂（油罐与搅拌车在 `vehicletank.mjs`）。
 *
 * 这四台是"路上真正的障碍"：它们占满一条车道、追尾必摔、踹飞了够爽一整天。
 * 所以画法的第一原则是**先让人认出有多大**——六个轮子、两层楼高的车头、后面
 * 还拖着一串东西。第二原则才是好看，而好看在这类车上就是**细节密度**：
 *
 *   - 厢货：一整个方箱子，顶上有个通风口，尾门两扇、中间一道加固条；
 *   - 重卡：比厢货高一头，顶上一排琥珀示廓灯、车尾一根防钻护杠；
 *   - 公交：一长条车窗带 + 车顶空调机 + 尾部那块发光的路线牌；
 *   - 半挂：拖头与挂车之间那道缝 + 竖楞箱体 + 尾门四根锁杆。
 */

import { bloom, hgrad, shade, sheen, vgrad } from "./art.mjs";
import {
  GLASS, INK, damagePass, lamp, plate, roundRect, shatter, tornBumper, wheel,
} from "./vehicleparts.mjs";
import { chassis, driver, flap, grime, lockRods, markers } from "./vehiclechrome.mjs";

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
  dualWheel(ctx, -W2 - 0.06, 0.06, 0.66, 0.28);
  dualWheel(ctx, W2 - 0.26, 0.06, 0.66, 0.28);
  chassis(ctx, w, 0.2, 0.34);
  ctx.fillStyle = INK;
  roundRect(ctx, -W2 - 0.06, 0.2, w + 0.12, h * 0.92, 0.12);
  ctx.fillStyle = vgrad(ctx, 0, 0.26, h * 0.95, [
    [0, shade(paint, -0.44)], [0.4, paint], [1, shade(paint, 0.2)],
  ]);
  roundRect(ctx, -W2, 0.26, w, h * 0.84, 0.1);
  grime(ctx, w, h, 1.25);
  ctx.fillStyle = hgrad(ctx, -W2, W2, h * 0.6, [
    [0, "rgba(255,255,255,.2)"], [0.4, "rgba(255,255,255,0)"], [1, "rgba(0,0,0,.3)"],
  ]);
  roundRect(ctx, -W2, 0.26, w, h * 0.84, 0.1);
  ctx.fillStyle = "rgba(255,255,255,.16)";
  ctx.fillRect(-W2, h * 0.98, w, h * 0.05);
  if (tall) {
    // 重卡：顶上一排出风筒 + 一排示廓灯，夜里老远就知道"前面是个大家伙"
    ctx.fillStyle = "rgba(10,14,22,.55)";
    for (let i = -1; i <= 1; i++) roundRect(ctx, i * w * 0.26 - 0.1, h * 1.03, 0.2, 0.08, 0.02);
    markers(ctx, w * 0.82, h * 1.22);
  } else {
    // 厢货：顶上一台通风/空调机，箱体是整块的、没有那一排灯
    ctx.fillStyle = "rgba(14,18,26,.55)";
    roundRect(ctx, -w * 0.18, h * 1.02, w * 0.36, 0.09, 0.03);
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.fillRect(-w * 0.16, h * 1.04, w * 0.32, 0.02);
  }
  if (oncoming) {
    ctx.fillStyle = GLASS;
    roundRect(ctx, -w * 0.36, h * 0.62, w * 0.72, h * 0.26, 0.06);
    if (dmg > 0.4) shatter(ctx, -w * 0.36, h * 0.62, w * 0.72, h * 0.26);
    else {
      driver(ctx, -w * 0.06, h * 0.64, w * 0.4, h * 0.22, 0.8);
      // 雨刷：货车风挡上永远有两根，这是"玻璃是玻璃"的证据
      ctx.strokeStyle = "rgba(14,18,26,.75)";
      ctx.lineWidth = 0.022;
      for (const x of [-w * 0.2, 0]) {
        ctx.beginPath();
        ctx.moveTo(x, h * 0.66);
        ctx.lineTo(x + w * 0.2, h * 0.78);
        ctx.stroke();
      }
      sheen(ctx, -w * 0.36, h * 0.62, w * 0.72, h * 0.26, 0.14);
    }
    // 格栅：大车迎面那一块是三分之二的车头高，省掉它就不像货车了
    ctx.fillStyle = "rgba(12,16,24,.9)";
    roundRect(ctx, -w * 0.34, h * 0.36, w * 0.68, h * 0.2, 0.04);
    ctx.fillStyle = "#8b93a3";
    for (let i = 0; i < 3; i++) ctx.fillRect(-w * 0.31, h * 0.39 + i * h * 0.05, w * 0.62, 0.02);
  } else {
    // 尾门：中缝 + 两侧铰链 + 两根竖加固条
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
    if (tall) {
      // 防钻护杠：重卡屁股上那根横杠，也是"离它远点"的提示
      ctx.fillStyle = "rgba(20,24,32,.9)";
      roundRect(ctx, -w * 0.44, 0.14, w * 0.88, 0.09, 0.03);
    }
  }
  flap(ctx, -W2 - 0.06, 0.02, 0.34, 0.34);
  flap(ctx, W2 - 0.26, 0.02, 0.34, 0.34);
  damagePass(ctx, w, h, dmg);
  if (dmg > 0.5) tornBumper(ctx, w, 0.3, dmg);
  else plate(ctx, 0.42, 0.24);
  for (const side of [-1, 1]) {
    lamp(ctx, side * w * 0.42, 0.56, 0.28, 0.17, dir);
    bloom(ctx, side * w * 0.42, 0.64, oncoming ? 0.95 : 0.6,
      oncoming ? "rgba(255,246,207,.45)" : "rgba(255,74,90,.3)", 0.8);
  }
}

/**
 * 公交车：一条 11.5 米长的车厢，侧面一整排车窗。
 * 迎面看是两块大玻璃 + 腰线；同向看是后窗和尾部那块路线牌。
 */
export function drawBus(ctx, w, h, paint, dir, dmg) {
  const W2 = w / 2, oncoming = dir < 0;
  dualWheel(ctx, -W2 - 0.08, 0.05, 0.7, 0.26);
  dualWheel(ctx, W2 - 0.2, 0.05, 0.7, 0.26);
  chassis(ctx, w, 0.18, 0.36);
  ctx.fillStyle = INK;
  roundRect(ctx, -W2 - 0.06, 0.18, w + 0.12, h * 0.94, 0.1);
  ctx.fillStyle = vgrad(ctx, 0, 0.24, h * 0.94, [
    [0, shade(paint, -0.42)], [0.42, paint], [1, shade(paint, 0.22)],
  ]);
  roundRect(ctx, -W2, 0.24, w, h * 0.86, 0.08);
  grime(ctx, w, h, 1.4);
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
  else {
    // 靠窗坐着的乘客：一条车窗带上坐着几个人，这车才不是空的
    driver(ctx, -w * 0.19, h * 0.64, w * 0.14, h * 0.2, 0.75);
    driver(ctx, 0, h * 0.64, w * 0.14, h * 0.2, 0.6);
    driver(ctx, w * 0.19, h * 0.64, w * 0.14, h * 0.2, 0.75);
    if (oncoming) driver(ctx, -w * 0.12, h * 0.64, w * 0.24, h * 0.22, 1);
    sheen(ctx, -w * 0.4, h * 0.6, w * 0.8, h * 0.28, 0.12);
  }
  // 车顶空调机：公交车顶上那几个凸起，是它和集装箱的区别
  ctx.fillStyle = "rgba(12,16,24,.5)";
  roundRect(ctx, -w * 0.26, h * 1.0, w * 0.5, 0.1, 0.03);
  ctx.fillStyle = "rgba(255,255,255,.1)";
  ctx.fillRect(-w * 0.24, h * 1.05, w * 0.46, 0.025);
  if (!oncoming) {
    // 尾部路线牌：同向时唯一能读出"这是几路车"的地方
    ctx.fillStyle = "rgba(18,22,30,.9)";
    roundRect(ctx, -w * 0.16, h * 0.9, w * 0.32, 0.12, 0.02);
    ctx.fillStyle = "#ffb648";
    ctx.fillRect(-w * 0.12, h * 0.925, w * 0.24, 0.055);
  }
  flap(ctx, -W2 - 0.08, 0.02, 0.36, 0.36);
  flap(ctx, W2 - 0.2, 0.02, 0.36, 0.36);
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
 * 箱子是竖楞的，比拖头高出半米，尾门挂着四根锁杆和两块反光板。
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
  // 箱顶压条 + 几道顺墙流下来的锈痕：铁皮箱子在雨里泡了几年就是这个样子
  ctx.fillStyle = "rgba(255,255,255,.16)";
  ctx.fillRect(-W2, h * 1.1, w, 0.03);
  ctx.fillStyle = "rgba(126,84,52,.16)";
  for (let i = 0; i < 4; i++) {
    const x = -W2 + 0.3 + i * (w - 0.6) / 4;
    ctx.fillRect(x, h * (0.4 + (i % 2) * 0.34), 0.09, h * 0.3);
  }
  grime(ctx, w, h, 1.3);
  // 拖头：画在箱子前面（迎面时看得见，同向时只露出一点）
  ctx.fillStyle = vgrad(ctx, 0, 0.26, h * 0.6, [
    [0, shade(paint, -0.44)], [0.42, paint], [1, shade(paint, 0.2)],
  ]);
  if (oncoming) {
    roundRect(ctx, -w * 0.44, 0.3, w * 0.88, h * 0.62, 0.08);
    ctx.fillStyle = GLASS;
    roundRect(ctx, -w * 0.36, h * 0.6, w * 0.72, h * 0.24, 0.05);
    if (dmg > 0.4) shatter(ctx, -w * 0.36, h * 0.6, w * 0.72, h * 0.24);
    else {
      driver(ctx, -w * 0.06, h * 0.62, w * 0.38, h * 0.2, 0.85);
      sheen(ctx, -w * 0.36, h * 0.6, w * 0.72, h * 0.24, 0.16);
    }
    ctx.fillStyle = "rgba(12,16,24,.9)";
    roundRect(ctx, -w * 0.3, h * 0.34, w * 0.6, h * 0.2, 0.03);
    ctx.fillStyle = "#b9c2d0";
    for (let i = 0; i < 3; i++) ctx.fillRect(-w * 0.27, h * 0.37 + i * h * 0.05, w * 0.54, 0.02);
    // 拖头顶上的导流罩：空载的半挂都翘着这么一块
    ctx.fillStyle = shade(paint, 0.18);
    roundRect(ctx, -w * 0.4, h * 0.9, w * 0.8, 0.14, 0.04);
  } else {
    // 尾门四根锁杆 + 两道反光板：夜里跟在一台半挂后面，这是唯一的提示
    lockRods(ctx, w, h * 0.34, h * 1.06);
    ctx.fillStyle = "rgba(255,80,80,.75)";
    for (const side of [-1, 1]) roundRect(ctx, side * w * 0.36 - 0.12, h * 0.3, 0.24, 0.1, 0.02);
    ctx.fillStyle = "rgba(255,255,255,.7)";
    for (const side of [-1, 1]) roundRect(ctx, side * w * 0.36 - 0.12, h * 0.24, 0.24, 0.05, 0.015);
  }
  damagePass(ctx, w, h, dmg);
  for (const side of [-1, 1]) lamp(ctx, side * w * 0.42, 0.52, 0.28, 0.16, dir);
  plate(ctx, 0.4, 0.26);
}
