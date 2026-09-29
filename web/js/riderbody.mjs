/**
 * 车手的上半身：夹克、手臂、头盔，加上背后那块号牌。
 *
 * 全是**先立剪影、再填明暗、最后才加细节**的顺序，细节由 `detail` 决定要不要画
 * ——屏幕上的对手常常只有十几像素高，给他画拉链只会糊成一团泥。
 *
 * 三条线决定"这是个人"还是"一坨颜色"：腰必须比肩窄（否则是一件毛衣）、下摆必须
 * 压在座垫上（否则人浮着）、头盔必须只有壳和下沿（后视根本看不到面罩）。
 */

import { TAU } from "../../sim/constants.mjs";
import { INK, circle, fillRound, hgrad, mix, poly, shade, sheen, speckle, tube } from "./art.mjs";
import { RIDE } from "./bike.mjs";

/** 上身：夹克的剪影。肩宽、腋下、收腰、下摆——这四条线就是"人"的形状。 */
export function torso(ctx, p, detail, number) {
  const jacket = p.jacket;
  const body = hgrad(ctx, -0.24, 0.24, 1.2, [
    [0, shade(jacket, 0.38)], [0.24, shade(jacket, 0.1)], [0.55, jacket],
    [0.8, shade(jacket, -0.34)], [1, shade(jacket, -0.62)],
  ]);
  torsoPath(ctx);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 0.026;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // 皮衣的质地：一层极淡的噪点 + 一道斜光。整块纯色是"贴纸感"最大的来源，
  // 而这两笔加起来只有几十条指令，比换一张贴图便宜得多。
  if (detail >= 2) {
    ctx.save();
    torsoPath(ctx);
    ctx.clip();
    speckle(ctx, -0.24, 0.8, 0.48, 0.68, 26, "rgba(255,255,255,.05)", 9, 0.009);
    speckle(ctx, -0.24, 0.8, 0.48, 0.68, 18, "rgba(0,0,0,.16)", 15, 0.011);
    sheen(ctx, -0.26, 0.84, 0.5, 0.62, 0.1);
    ctx.restore();
  }

  // 领口：一圈深色。它同时干两件事——把脖子交代清楚、把头盔托住
  ctx.beginPath(); ctx.ellipse(0, 1.41, 0.115, 0.075, 0, 0, TAU);
  ctx.fillStyle = "rgba(10,13,21,.85)"; ctx.fill();
  if (detail === 0) return;

  // 夹克下摆压在座垫上那道更深的阴影：人"坐进去"的最后一道证据
  ctx.fillStyle = "rgba(4,6,12,.34)";
  ctx.beginPath(); ctx.ellipse(0, 0.845, 0.19, 0.045, 0, 0, TAU); ctx.fill();

  // 拉链与背缝：两道竖直的暗线，把一块色斑切成"有结构的衣服"
  ctx.fillStyle = "rgba(6,9,16,.42)";
  ctx.fillRect(-0.017, 0.88, 0.034, 0.52);
  ctx.fillStyle = "rgba(0,0,0,.2)";
  ctx.fillRect(-0.115, 0.9, 0.028, 0.46);
  // 后背的号牌：白底数字。远处是一粒亮点，近处是"几号车"
  const bib = mix("#e9eefc", jacket, 0.06);
  ctx.save();
  ctx.translate(0.015, 1.16);
  ctx.rotate(-0.03);
  fillRound(ctx, -0.13, -0.155, 0.26, 0.31, 0.035, bib);
  ctx.fillStyle = "rgba(12,16,26,.42)";
  ctx.fillRect(-0.13, -0.155, 0.05, 0.31);
  ctx.restore();
  if (detail >= 2) numberPlate(ctx, number, 1.16);
  // 肩线的高光：一道从左上扫到肩头的亮边
  ctx.strokeStyle = "rgba(255,255,255,.2)";
  ctx.lineWidth = 0.022;
  ctx.beginPath();
  ctx.moveTo(-0.225, 1.35);
  ctx.quadraticCurveTo(-0.15, 1.45, 0.02, 1.455);
  ctx.stroke();
}

/** 夹克的轮廓。单独一条路径，是因为质感和剪影要共用它（一个填、一个裁）。 */
function torsoPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(-0.235, 1.36);
  ctx.quadraticCurveTo(-0.16, 1.47, 0, 1.47);
  ctx.quadraticCurveTo(0.16, 1.47, 0.235, 1.36);
  ctx.quadraticCurveTo(0.245, 1.24, 0.2, 1.14);
  ctx.lineTo(0.175, 1.0);
  ctx.quadraticCurveTo(0.19, 0.9, 0.185, 0.85);
  ctx.quadraticCurveTo(0, 0.81, -0.185, 0.85);
  ctx.quadraticCurveTo(-0.19, 0.9, -0.175, 1.0);
  ctx.lineTo(-0.2, 1.14);
  ctx.quadraticCurveTo(-0.245, 1.24, -0.235, 1.36);
  ctx.closePath();
}

/** 号牌上的数字。canvas 的文字在 y 轴翻转的坐标系里是倒的，所以这里翻回来。 */
function numberPlate(ctx, number, y) {
  ctx.save();
  ctx.translate(0.015, y);
  ctx.scale(1, -1);
  ctx.font = "700 0.22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(14,18,30,.88)";
  ctx.fillText(String(number), 0, 0);
  ctx.restore();
}

/**
 * 手臂：肩 → 肘 → 前臂 → 手套。肘往外拐，才有"握着车把在用力"的感觉。
 *
 * 肘关节用**暗色**而不是亮色：上一版在这里填了一个比袖子更亮的圆，远看像两颗
 * 白球挂在肩膀上（也就是"肩甲"）。关节是转折处，转折处永远比两侧暗。
 */
export function arms(ctx, p, detail) {
  const sleeve = shade(p.jacket, -0.06);
  const glove = mix(p.trim, "#2f3849", 0.55);
  for (const side of [-1, 1]) {
    tube(ctx, side * 0.2, RIDE.shoulderY - 0.02, side * 0.285, 1.16, 0.132, sleeve,
      { bright: 0.24, edge: 0.022 });
    if (detail >= 1) circle(ctx, side * 0.285, 1.155, 0.058, shade(sleeve, -0.34));
    tube(ctx, side * 0.285, 1.14, side * 0.262, RIDE.barY + 0.04, 0.102, shade(sleeve, -0.2),
      { bright: 0.18, edge: 0.022 });
    const gy = RIDE.barY - 0.02;
    fillRound(ctx, side * 0.262 - 0.058, gy - 0.052, 0.116, 0.105, 0.042, glove);
    if (detail >= 1) {
      ctx.fillStyle = "rgba(255,255,255,.18)";
      ctx.fillRect(side * 0.262 - 0.046, gy + 0.006, 0.092, 0.016);
    }
  }
}

/**
 * 头盔。**全盔的后脑勺**：一整颗蛋形壳、下面一圈颈托。
 *
 * 上一次画坏的地方值得记一句：那版在壳的中间横了一道黑条，于是每个车手都顶着一张
 * 笑脸。后视角度根本看不到面罩，能看到的只有**壳**和**下沿**——这就是为什么颈托
 * 必须压在壳的最下方，而不是中间。
 */
export function helmet(ctx, p, detail) {
  const shell = p.helmet;
  ctx.save();
  ctx.translate(0, 1.62);
  // 颈托：壳下面那一圈深色，把人脖子和头盔的关系交代清楚
  ctx.beginPath(); ctx.ellipse(0, -0.138, 0.108, 0.046, 0, 0, TAU);
  ctx.fillStyle = "rgba(11,14,22,.92)"; ctx.fill();
  // 尾翼：压在壳的最下沿，和后颈连成一片（**不是**横在壳中间）
  poly(ctx, [[-0.075, -0.112], [0.075, -0.112], [0.05, -0.16], [-0.05, -0.16]], shade(shell, -0.55));

  const g = hgrad(ctx, -0.135, 0.135, 0, [
    [0, shade(shell, 0.44)], [0.24, shade(shell, 0.16)], [0.56, shell],
    [0.82, shade(shell, -0.36)], [1, shade(shell, -0.64)],
  ]);
  ctx.beginPath(); ctx.ellipse(0, 0, 0.135, 0.156, 0, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 0.026;
  ctx.strokeStyle = INK;
  ctx.stroke();
  if (detail === 0) { ctx.restore(); return; }

  ctx.save();
  ctx.beginPath(); ctx.ellipse(0, 0, 0.135, 0.156, 0, 0, TAU); ctx.clip();
  // 左上那道月牙反光：它是"球形"的唯一线索，比任何花纹都值钱
  ctx.beginPath(); ctx.ellipse(-0.052, 0.052, 0.095, 0.074, -0.45, 0, TAU);
  ctx.fillStyle = "rgba(255,255,255,.24)"; ctx.fill();
  // 下半必然比上半暗：壳是球面，光从上面来
  ctx.beginPath(); ctx.ellipse(0.018, -0.098, 0.145, 0.092, 0, 0, TAU);
  ctx.fillStyle = "rgba(6,9,18,.28)"; ctx.fill();
  ctx.restore();

  // 中缝：一道从顶贯到底的浅色棱线。它和后颈的那道深色横线一起，把"后脑勺"讲清楚。
  // （上一版这里是两块对称的深色小方块，画在壳的中间——读出来就是两只眼睛。）
  ctx.fillStyle = "rgba(255,255,255,.16)";
  ctx.fillRect(-0.008, -0.12, 0.016, 0.24);
  ctx.fillStyle = "rgba(8,11,20,.34)";
  ctx.fillRect(-0.014, -0.13, 0.006, 0.2);
  if (detail >= 2) {
    // 右侧的轮廓光：夜里把人和黑路面分开的那一线亮边
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.132, 0.153, 0, -0.5, 1.15);
    ctx.lineWidth = 0.02;
    ctx.strokeStyle = "rgba(198,228,255,.55)";
    ctx.stroke();
  }
  ctx.restore();
}
