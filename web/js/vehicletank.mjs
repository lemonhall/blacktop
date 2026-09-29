/**
 * 两辆"背上驮着东西跑"的车：油罐车和搅拌车。
 *
 * 把它们从大车那一组里单拎出来，是因为这两台身上最有辨识度的部分**不是车厢**，
 * 而是那个罐子——一个躺着的圆筒、一个斜站着的搅拌罐。共同的要求只有一条：
 * **一眼看出里面装着东西**。箍、检修口、阀门、软管、溜槽、危险品菱形牌，全部
 * 为这一条服务；再往下一层才是"踹飞了会怎样"（`boom` 1.7，全场最大的那朵火）。
 */

import { bloom, hgrad, shade, sheen, vgrad } from "./art.mjs";
import {
  GLASS, INK, circle, damagePass, lamp, plate, roundRect, shatter, wheel,
} from "./vehicleparts.mjs";
import { chassis, driver, flap, grime, placard } from "./vehiclechrome.mjs";

/** 双联后轮：大车"重"的全部证据。 */
function dualWheel(ctx, x, y, hh, ww) {
  wheel(ctx, x, y, hh, ww);
  wheel(ctx, x + ww * 1.15, y, hh, ww);
}

/**
 * 油罐车：一个躺着的圆筒 + 两道箍 + 尾部锥形卸料口。
 * 它是最该被踹的一台（`boom: 1.7`）——踹飞它，表现层会放一朵比别的车大一圈的火。
 */
export function drawTanker(ctx, w, h, paint, dir, dmg) {
  const W2 = w / 2, oncoming = dir < 0;
  dualWheel(ctx, -W2 - 0.06, 0.05, 0.68, 0.26);
  dualWheel(ctx, W2 - 0.4, 0.05, 0.68, 0.26);
  chassis(ctx, w, 0.2, 0.3);
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
  grime(ctx, w, h * 1.5, 1.1);
  // 两道箍 + 顶上的检修口
  ctx.fillStyle = "rgba(16,20,28,.5)";
  for (const x of [-w * 0.26, w * 0.26]) ctx.fillRect(x, ty, 0.06, tank);
  ctx.fillStyle = "#5c6572";
  roundRect(ctx, -0.18, ty + tank - 0.02, 0.36, 0.08, 0.02);
  // 罐顶的阀门组 + 一条顺着罐身垂下来的软管：油罐车最像"危险品"的两笔
  ctx.fillStyle = "#7b8492";
  roundRect(ctx, w * 0.14, ty + tank + 0.01, 0.1, 0.14, 0.02);
  roundRect(ctx, w * 0.3, ty + tank + 0.01, 0.08, 0.1, 0.02);
  ctx.strokeStyle = "rgba(20,24,32,.85)";
  ctx.lineWidth = 0.045;
  ctx.beginPath();
  ctx.moveTo(w * 0.19, ty + tank + 0.02);
  ctx.quadraticCurveTo(w * 0.42, ty + tank * 0.5, w * 0.36, ty + 0.06);
  ctx.stroke();
  // 底盘 + 卸料口
  ctx.fillStyle = shade(paint, -0.4);
  roundRect(ctx, -W2, 0.24, w, h * 0.16, 0.04);
  ctx.fillStyle = "#4b5460";
  roundRect(ctx, (oncoming ? -1 : 1) * (W2 - 0.3), 0.26, 0.5, 0.22, 0.04);
  // 危险品菱形牌：一块黄牌挂在罐尾，比什么细节都显眼
  placard(ctx, -W2 + 0.28, ty + tank * 0.44, 0.34);
  if (oncoming) {
    ctx.fillStyle = GLASS;
    roundRect(ctx, -w * 0.4, h * 0.3, w * 0.34, h * 0.24, 0.04);
    driver(ctx, -w * 0.24, h * 0.32, w * 0.28, h * 0.2, 0.8);
  }
  flap(ctx, -W2 - 0.06, 0.02, 0.32, 0.32);
  flap(ctx, W2 - 0.4, 0.02, 0.32, 0.32);
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
  chassis(ctx, w, 0.2, 0.34);
  ctx.fillStyle = INK;
  roundRect(ctx, -W2 - 0.06, 0.22, w + 0.12, h * 0.92, 0.08);
  // 驾驶室
  ctx.fillStyle = vgrad(ctx, 0, 0.28, h * 0.9, [[0, shade(paint, -0.44)], [1, shade(paint, 0.16)]]);
  roundRect(ctx, -W2, 0.28, w * 0.5, h * 0.62, 0.06);
  grime(ctx, w, h, 1.5);
  // 搅拌罐：一个斜着的圆角矩形（顶朝驾驶室那边倾），后面一个圆形的罐口
  ctx.fillStyle = shade(paint, -0.1);
  roundRect(ctx, -w * 0.06, h * 0.28, w * 0.5, h * 0.68, h * 0.3);
  // 罐身上的螺旋叶片：三道跟着罐身斜下去的浅槽，是它一圈一圈转起来的证据
  ctx.strokeStyle = "rgba(255,255,255,.16)";
  ctx.lineWidth = 0.045;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-w * 0.04 + i * w * 0.02, h * (0.34 + i * 0.2));
    ctx.quadraticCurveTo(w * 0.14, h * (0.42 + i * 0.2), w * 0.4, h * (0.3 + i * 0.2));
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,.18)";
  roundRect(ctx, -w * 0.02, h * 0.34, w * 0.1, h * 0.56, 0.08);
  // 罐口 + 罐口的圆环：一个白亮的圈，说明"这里能倒出来"
  ctx.fillStyle = "#4b5460";
  circle(ctx, w * 0.3, h * 0.62, h * 0.2);
  ctx.fillStyle = "#20242c";
  circle(ctx, w * 0.3, h * 0.62, h * 0.12);
  ctx.strokeStyle = "rgba(214,224,240,.5)";
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  ctx.arc(w * 0.3, h * 0.62, h * 0.16, 0, Math.PI * 2);
  ctx.stroke();
  // 尾部溜槽 + 挂在车边的一根水管：工地上的车都挂着一根
  ctx.fillStyle = "#6b7480";
  roundRect(ctx, w * 0.34, h * 0.34, w * 0.16, 0.1, 0.03);
  ctx.strokeStyle = "rgba(24,28,36,.75)";
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.moveTo(-w * 0.34, h * 0.34);
  ctx.quadraticCurveTo(-w * 0.42, h * 0.2, -w * 0.3, 0.1);
  ctx.stroke();
  placard(ctx, W2 - 0.26, h * 0.5, 0.3);
  if (oncoming) {
    ctx.fillStyle = GLASS;
    roundRect(ctx, -w * 0.36, h * 0.6, w * 0.56, h * 0.22, 0.05);
    if (dmg > 0.4) shatter(ctx, -w * 0.36, h * 0.6, w * 0.56, h * 0.22);
    else {
      driver(ctx, -w * 0.2, h * 0.62, w * 0.3, h * 0.18, 0.85);
      sheen(ctx, -w * 0.36, h * 0.6, w * 0.56, h * 0.22, 0.14);
    }
  }
  flap(ctx, -W2 - 0.06, 0.02, 0.34, 0.34);
  flap(ctx, W2 - 0.34, 0.02, 0.34, 0.34);
  damagePass(ctx, w, h, dmg);
  plate(ctx, 0.42, 0.24);
  for (const side of [-1, 1]) lamp(ctx, side * w * 0.42, 0.52, 0.26, 0.15, dir);
}
