/**
 * 车手的两条腿和两只靴子（后视）。
 *
 * 单独一层，是因为这两条腿的**绘制次序**和别处不一样：它们画在车身**后面**。
 * 从正后方看一辆摩托，尾罩、尾灯、后胎离镜头最近，骑手是坐在它们前面的，
 * 所以大腿内侧天然被车身挡住，能露出来的只有外侧那一条和踩在脚踏上的脚。
 * 画在车身前面的话，腿就会变成两块挂着黑边的独立色块——看着像"手臂"。
 *
 * 颜色上踩过的坑记在这里：裤子跟着 `trim`（近黑）走，就和黑轮胎糊成一片，
 * 整条腿消失。所以它固定成**深蓝牛仔布**，和钛灰排气、黑橡胶差着一个色相。
 */

import { TAU } from "../../sim/constants.mjs";
import { INK, fillRound, hgrad, mix, shade } from "./art.mjs";
import { PEG, RIDE } from "./bike.mjs";

/** 深蓝牛仔布。跟配色无关——全世界的骑行裤都差不多是这个色。 */
export const PANTS = "#48577a";

/**
 * 一条腿的关键尺寸（米，一律取正值，`side` 决定左右）。
 *
 * 抽出来是因为**画法**和**契约**必须共用同一份数字：光看一串 `quadraticCurveTo`
 * 没法回答"膝盖到底在车宽外面多少米"，而这个问题一答错，腿就藏回车里去了。
 * `bootBottomY` 更是直接由脚踏杆算出来的——脚踩在杆上，不是浮在杆旁边。
 */
export const LEG = {
  hipX: 0.13, hipY: 0.952,
  kneeX: 0.306, kneeY: 0.7,
  ankleX: 0.256, ankleY: 0.6,
  bootInnerX: 0.246, bootOuterX: 0.334,
  bootTopY: 0.606,
  bootBottomY: RIDE.footY + PEG.r,
};

/**
 * 腿：胯 → 膝 → 踝。三条要求缺一条就退化成"挂在车两侧的两块灰垫子"：
 *   1. 胯压在夹克下摆底下，别从半空中起头；
 *   2. 膝盖顶到车宽外面（车后半身最宽 0.226 米，膝盖在 0.31 米上）；
 *   3. 靴子踩在脚踏杆上，脚底压着那根银灰色的杆。
 */
export function legs(ctx, p, detail) {
  const pants = mix(p.trim, PANTS, 0.72);
  const stripe = mix(p.jacket, "#141a28", 0.34);
  const { kneeX, kneeY, bootInnerX, bootOuterX, bootTopY, bootBottomY } = LEG;
  for (const side of [-1, 1]) {
    // 1) 剪影：胯、大腿、膝、小腿**一次成形**。分开画成几根各自发亮的管子，
    //    远看就是一坨灰——"先立剪影、再填明暗"。
    legPath(ctx, side);
    ctx.fillStyle = detail === 0 ? pants : hgrad(ctx, side * (kneeX + 0.024), side * 0.1, 0.72, [
      [0, shade(pants, side < 0 ? 0.52 : 0.24)],
      [0.3, shade(pants, 0.08)],
      [0.62, pants],
      [1, shade(pants, -0.44)],
    ]);
    ctx.fill();
    ctx.lineWidth = 0.026;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (detail === 0) continue;

    // 2) 剪影里的明暗。全部 `clip` 在这条腿里面，绝不会跑到车身上去。
    ctx.save();
    legPath(ctx, side);
    ctx.clip();
    // 外缘轮廓光：唯一把腿从黑轮胎上"切"出来的东西，宁可亮一点
    ctx.strokeStyle = "rgba(206,228,255,.34)";
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.moveTo(side * (LEG.hipX + 0.054), 0.9);
    ctx.quadraticCurveTo(side * (kneeX - 0.018), 0.79, side * (kneeX + 0.002), 0.68);
    ctx.stroke();
    // 裤缝：从胯走到膝的一道暗线，腿才有前后两面
    ctx.strokeStyle = "rgba(6,9,18,.5)";
    ctx.lineWidth = 0.016;
    ctx.beginPath();
    ctx.moveTo(side * (LEG.hipX + 0.062), 0.9);
    ctx.quadraticCurveTo(side * (kneeX - 0.05), 0.79, side * (kneeX - 0.034), 0.66);
    ctx.stroke();
    // 侧条：赛道皮衣顺着大腿外侧的那道配色条。有它，"这是一条腿"不用猜
    ctx.strokeStyle = stripe;
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.moveTo(side * (LEG.hipX + 0.026), 0.93);
    ctx.quadraticCurveTo(side * (kneeX - 0.04), 0.83, side * (kneeX - 0.006), 0.66);
    ctx.stroke();
    // 膝盖护具：膝盖是这条腿轮廓拐得最急的地方，在那里压一块更亮的护具，
    // 明暗一断，弯腿就成立了。
    ctx.beginPath();
    ctx.ellipse(side * (kneeX - 0.03), kneeY + 0.012, 0.062, 0.044, side * 0.3, 0, TAU);
    ctx.fillStyle = shade(pants, 0.3);
    ctx.fill();
    ctx.lineWidth = 0.016;
    ctx.strokeStyle = "rgba(6,9,18,.5)";
    ctx.stroke();
    // 靴筒：下半截交给 `boots()` 在车身**前面**补，脚才不会陷进车里
    const x0 = Math.min(side * bootInnerX, side * bootOuterX);
    fillRound(ctx, x0, bootBottomY - 0.01, bootOuterX - bootInnerX, bootTopY - bootBottomY + 0.01,
      0.03, shade(pants, -0.5));
    ctx.restore();
  }
}

/**
 * 靴子（画在车身前面）。脚踏杆从车上支出来，脚踩在上面，所以脚**必然**比车更靠近
 * 镜头。这一层只干一件事：把靴子从"一根暗柱子"变成"一只踩在杆上的脚"——
 * 亮一条鞋底、压一道靴筒接缝、点一颗搭扣。
 */
export function boots(ctx, detail) {
  if (detail === 0) return;
  const { bootInnerX, bootOuterX, bootTopY, bootBottomY } = LEG;
  const leather = "#2b3446";
  for (const side of [-1, 1]) {
    const g = hgrad(ctx, side * bootOuterX, side * bootInnerX, 0.54, [
      [0, shade(leather, 0.42)], [0.42, leather], [1, shade(leather, -0.5)],
    ]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(side * (bootInnerX + 0.006), bootTopY - 0.021);
    ctx.lineTo(side * (bootInnerX + 0.002), bootBottomY);
    ctx.quadraticCurveTo(side * (bootOuterX - 0.044), bootBottomY - 0.02, side * bootOuterX, bootBottomY + 0.004);
    ctx.lineTo(side * (bootOuterX - 0.004), bootTopY - 0.016);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 0.024;
    ctx.strokeStyle = INK;
    ctx.stroke();
    // 鞋底：一道横过去的亮边。它是"脚踩在脚踏杆上"的全部证据
    ctx.fillStyle = "#c9d6ea";
    ctx.globalAlpha = 0.62;
    ctx.beginPath();
    ctx.moveTo(side * bootInnerX, bootBottomY + 0.008);
    ctx.quadraticCurveTo(side * (bootOuterX - 0.044), bootBottomY - 0.014, side * (bootOuterX + 0.002), bootBottomY + 0.004);
    ctx.lineTo(side * (bootOuterX + 0.002), bootBottomY - 0.014);
    ctx.quadraticCurveTo(side * (bootOuterX - 0.044), bootBottomY - 0.032, side * bootInnerX, bootBottomY - 0.01);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    // 靴筒接缝 + 搭扣
    ctx.strokeStyle = "rgba(6,9,18,.5)";
    ctx.lineWidth = 0.016;
    ctx.beginPath();
    ctx.moveTo(side * (bootInnerX + 0.012), bootTopY - 0.028);
    ctx.lineTo(side * (bootOuterX - 0.006), bootTopY - 0.038);
    ctx.stroke();
    ctx.fillStyle = "rgba(226,238,255,.3)";
    const bx = side < 0 ? -(bootInnerX + 0.022) : bootInnerX + 0.022;
    ctx.fillRect(bx, bootBottomY + 0.026, 0.048, 0.014);
  }
}

/**
 * 一条腿的外轮廓。左右各调用一次，`side` 为 ±1。用一条闭合路径而不是几根管子，
 * 是因为**远距离只剩轮廓**——那时候唯一还管用的就是这条线。
 * 走法：从夹克底下的胯出发，沿内侧收到脚踝，横过鞋底，再沿外侧回到胯。
 */
function legPath(ctx, side) {
  const { hipX, hipY, kneeX, kneeY, ankleX, ankleY, bootInnerX, bootOuterX, bootTopY, bootBottomY } = LEG;
  ctx.beginPath();
  // 内侧：胯（藏在下摆里）→ 大腿内缘 → 膝内侧 → 脚踝
  ctx.moveTo(side * hipX, hipY);
  ctx.quadraticCurveTo(side * (hipX + 0.07), 0.86, side * (hipX + 0.1), 0.745);
  ctx.quadraticCurveTo(side * (ankleX - 0.01), (kneeY + ankleY) / 2, side * ankleX, ankleY);
  // 靴子：靴筒 → 鞋跟 → 鞋底（脚底压在脚踏杆上面）
  ctx.lineTo(side * (bootInnerX + 0.006), 0.575);
  ctx.lineTo(side * bootInnerX, bootBottomY);
  ctx.lineTo(side * bootOuterX, bootBottomY - 0.006);
  ctx.lineTo(side * bootOuterX, bootTopY - 0.006);
  // 外侧：小腿肚 → 膝 → 大腿外缘 → 胯
  ctx.quadraticCurveTo(side * (bootOuterX - 0.012), 0.665, side * kneeX, kneeY);
  ctx.quadraticCurveTo(side * (kneeX - 0.03), 0.83, side * (hipX + 0.048), hipY);
  ctx.closePath();
}
