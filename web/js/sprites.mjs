/**
 * 车手：一台车 + 一个人，从**后面**看过去。
 *
 * 1991～1996 那几代《暴力摩托》用的是"2D 画片 + 投影伪 3D 路面"，这条路今天依然
 * 是划算的：车手永远只有后视一个角度，所以不需要 3D 模型、不需要骨骼，需要的只是
 * **一张画得足够好的画片**。摩托车的部分在 `bike.mjs`，这里只管人。
 *
 * 画人的难点从来不是细节，而是**比例与轮廓**。屏幕上的对手常常只有十几像素高，
 * 那时候头盔、肩膀、手肘、车尾四条外形线就决定了"这是个人在骑车"还是"一坨颜色"。
 * 所以这里所有形状都按"先立剪影、再填明暗、最后才加细节"的顺序画，细节由
 * `detail` 决定要不要画——远处的对手不该被胎纹糊成一团泥。
 *
 * 身体各处的坐标来自 `bike.mjs` 的 `RIDE`：胯坐在座垫上、脚踩在脚踏上、手搭在
 * 车把上。这三个点一旦在两边各写一份，人手就会悬在半空。
 *
 * 坐标：**米**，y 轴向上，原点在后轮接地点。调用方先 `translate(cx, baseY)`、
 * 再 `scale(s, -s)`，于是"头盔一米六高"就是"画到 y = 1.6"。
 */

import { TAU } from "../../sim/constants.mjs";
import { PALETTES } from "../../sim/data.mjs";
import { bloom, circle, fillRound, hgrad, mix, poly, shade, sheen, speckle, tube } from "./art.mjs";
import { RIDE, drawBike } from "./bike.mjs";
import { drawHeld } from "./weaponsart.mjs";

/** 描边色。伪 3D 里"从路面上跳出来"靠的是它，不是模糊。 */
const INK = "rgba(4,6,12,.9)";

/**
 * 画一台车和它的骑手。
 *
 * `swing` 是出拳/飞踢的剩余时间（从 0.3 秒递减）；`wreck` 是摔倒剩余时间。
 * `swingBack` 把这一下镜像到另一侧——回身打身后的人，手臂朝车尾甩过去。
 * `weapon` 是手里那件家伙的编号（空串 = 空手）。`number` 是车背后的号牌数字：
 * 十五台车挤在一起的时候，"几号车"比配色更好认。
 */
export function drawRider(ctx, o) {
  const s = o.s;
  if (!(s > 0.04)) return;
  const p = PALETTES[(o.palette | 0) & 7] || PALETTES[0];
  // 距离决定细节层级：0 = 只看轮廓，1 = 有明暗，2 = 全套
  const detail = s < 12 ? 0 : s < 28 ? 1 : 2;
  const number = o.number === undefined ? (o.palette | 0) * 3 + 1 : o.number;

  ctx.save();
  ctx.translate(o.cx, o.baseY);
  ctx.rotate((o.lean || 0) * 0.34);
  if (o.wreck > 0) ctx.rotate(-1.3 * Math.min(1, o.wreck / 0.5));
  ctx.scale(s, -s);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  groundShadow(ctx, detail);
  drawBike(ctx, { palette: p, detail, wobble: o.wobble || 0 });
  seatShadow(ctx);
  legs(ctx, p, detail);
  torso(ctx, p, detail, number);
  arms(ctx, p, detail);
  helmet(ctx, p, detail);
  if (o.swing > 0) swing(ctx, o.swing, p, o.swingBack, o.weapon);
  else if (o.weapon) idleWeapon(ctx, o.weapon);
  if (o.nitro) nitroFlame(ctx, o.flameSeed || 0);
  ctx.restore();
}

/** 影子：三层椭圆，边缘一层比一层淡，车才像"贴"在路上而不是"浮"在路上。 */
function groundShadow(ctx, detail) {
  ctx.fillStyle = "rgba(0,0,0,.18)";
  ctx.beginPath(); ctx.ellipse(0, 0.04, 0.88, 0.2, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,.26)";
  ctx.beginPath(); ctx.ellipse(0, 0.04, 0.56, 0.13, 0, 0, TAU); ctx.fill();
  if (detail < 1) return;
  ctx.fillStyle = "rgba(0,0,0,.3)";
  ctx.beginPath(); ctx.ellipse(0, 0.05, 0.32, 0.075, 0, 0, TAU); ctx.fill();
}

/**
 * 座垫上那道"人已经坐上去了"的阴影。
 *
 * 这是伪 3D 里最便宜的一招，也是"贴纸感"和"坐进车里"的分界线：人画在车上、
 * 底下却一点影子都没有，眼睛立刻判定这是两张不相关的图片叠在一起。
 */
function seatShadow(ctx) {
  ctx.fillStyle = "rgba(4,6,12,.42)";
  ctx.beginPath(); ctx.ellipse(0, 0.862, 0.216, 0.058, 0, 0, TAU); ctx.fill();
}

/**
 * 腿：胯 → 膝 → 踝 → 靴子。四段式让"人骑在车上"这件事第一次成立。
 *
 * 裤子的颜色是个陷阱：跟着 `trim`（近黑）走的话，大腿和黑轮胎糊成一片，
 * 整条腿就消失了。所以这里把它往蓝灰上提，让腿从车上"分"出来。
 */
function legs(ctx, p, detail) {
  const pants = mix(p.trim, "#333c52", 0.58);
  for (const side of [-1, 1]) {
    // 1) 剪影：**一条腿连靴子一次成形**。
    //    上一版把大腿、小腿、靴子画成三根各自发亮的管子，它们之间没有共同轮廓，
    //    远看就是一坨灰——"先立剪影、再填明暗"这句话当时只写在注释里。
    legPath(ctx, side);
    ctx.fillStyle = detail === 0 ? pants : hgrad(ctx, side * 0.36, side * 0.09, 0.7, [
      [0, shade(pants, side < 0 ? 0.34 : 0.16)],
      [0.45, pants],
      [1, shade(pants, -0.42)],
    ]);
    ctx.fill();
    ctx.lineWidth = 0.026;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (detail === 0) continue;

    // 2) 剪影内的明暗：膝盖护具、裤缝、靴面。全部夹在这条腿里面，
    //    绝不会跑到车身上去。
    ctx.save();
    legPath(ctx, side);
    ctx.clip();
    // 外缘的轮廓光：把腿从黑轮胎上"切"出来
    ctx.strokeStyle = "rgba(206,228,255,.22)";
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.moveTo(side * 0.108, 0.93);
    ctx.quadraticCurveTo(side * 0.27, 0.8, side * 0.306, 0.64);
    ctx.stroke();
    // 膝盖护具：偏在外侧的一块，做弯腿的关节
    ctx.beginPath();
    ctx.ellipse(side * (RIDE.kneeX - 0.018), RIDE.kneeY + 0.015, 0.066, 0.045, side * 0.34, 0, TAU);
    ctx.fillStyle = shade(pants, 0.3);
    ctx.fill();
    ctx.lineWidth = 0.016;
    ctx.strokeStyle = "rgba(8,11,20,.45)";
    ctx.stroke();
    // 裤缝：膝盖内外各一道暗线，腿才有前后两面
    ctx.strokeStyle = "rgba(8,11,20,.42)";
    ctx.lineWidth = 0.015;
    ctx.beginPath();
    ctx.moveTo(side * 0.225, 0.87);
    ctx.quadraticCurveTo(side * 0.275, 0.73, side * 0.286, 0.58);
    ctx.moveTo(side * 0.106, 0.9);
    ctx.quadraticCurveTo(side * 0.148, 0.77, side * 0.174, 0.62);
    ctx.stroke();
    // 靴面：踩在脚踏上那一小块，比裤子深、比轮胎亮
    fillRound(ctx, side * (RIDE.footX - 0.05), RIDE.footY - 0.03, 0.106, 0.075, 0.02,
      shade(pants, -0.42));
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.fillRect(side * (RIDE.footX - 0.045), RIDE.footY + 0.028, 0.096, 0.014);
    ctx.restore();
  }
}

/**
 * 一条腿的外轮廓（含靴子）。左右各调用一次，`side` 为 ±1。
 * 用一条闭合路径而不是几根管子，是因为**远距离只剩轮廓**——那时候唯一还有用的
 * 就是这条线。
 *
 * 整条腿是**贴着车身**的。上一版把膝盖顶到车宽外面 0.37 米，于是两条腿看起来
 * 像挂在车两侧的两块灰垫子——真正的骑手，大腿内侧是压在座垫上的。
 */
function legPath(ctx, side) {
  ctx.beginPath();
  // 大腿到膝盖那一段接近竖直：骑跑车的人**不是**把腿横着支出去的，
  // 大腿朝前下方伸（也就是朝着画面里），从后面能看见的只有外侧窄窄的一条。
  ctx.moveTo(side * 0.112, 0.93);
  ctx.quadraticCurveTo(side * 0.252, 0.86, side * 0.29, 0.7);
  ctx.quadraticCurveTo(side * 0.312, 0.6, side * 0.32, 0.5);
  ctx.lineTo(side * 0.346, 0.43);
  ctx.lineTo(side * 0.222, 0.425);
  ctx.lineTo(side * 0.222, 0.52);
  ctx.quadraticCurveTo(side * 0.208, 0.62, side * 0.205, 0.72);
  ctx.quadraticCurveTo(side * 0.19, 0.83, side * 0.112, 0.93);
  ctx.closePath();
}

/**
 * 上身：夹克的剪影。肩宽、腋下、收腰、下摆——这四条线就是"人"的形状。
 * 腰必须比肩窄，否则画出来是一件毛衣；下摆必须压在座垫上，否则人像浮着。
 */
function torso(ctx, p, detail, number) {
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
function arms(ctx, p, detail) {
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
function helmet(ctx, p, detail) {
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

/**
 * 出拳 / 抡家伙：一条"伸出去又收回来"的曲线，命中感全靠这一下。
 * 回身打就是把同一条轨迹**镜像**到另一侧、再压低一点：画片时代就是这么干的。
 * 手里有家伙时画出家伙本身，多出来的那一截正好对上 `sim/weapons.mjs` 的 `reach`。
 */
function swing(ctx, remaining, p, back, weapon) {
  const k = Math.sin(Math.min(1, 1 - remaining / 0.3) * Math.PI);
  const dir = back ? -1 : 1;
  ctx.save();
  ctx.translate(dir * 0.2, RIDE.shoulderY - 0.03);
  if (back) ctx.scale(-1, 1);
  ctx.rotate((back ? -0.16 : 0.24) - (back ? -0.5 : 0.66) * k);
  const arm = 0.34 + 0.2 * k;
  // 挥出去的残影：三道递减的弧，比任何粒子都便宜，也比任何粒子都有效
  ctx.strokeStyle = `rgba(255,255,255,${0.15 * k})`;
  ctx.lineWidth = 0.05;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, arm * (0.75 + i * 0.28), -0.42 - 0.1 * i, 0.06);
    ctx.stroke();
  }
  tube(ctx, 0, 0, arm, 0.045, 0.16, shade(p.jacket, 0.12), { bright: 0.3 });
  circle(ctx, arm, 0.05, 0.072, shade(p.jacket, 0.22));
  ctx.translate(arm + 0.02, 0.05);
  if (weapon) {
    ctx.rotate(-0.16 - 0.3 * k);
    drawHeld(ctx, weapon, k);
  } else {
    fillRound(ctx, -0.055, -0.075, 0.2, 0.17, 0.06, shade(p.helmet, 0.1));
    ctx.fillStyle = "rgba(255,255,255,.26)";
    ctx.fillRect(-0.02, 0.02, 0.14, 0.026);
  }
  ctx.restore();
}

/** 不打的时候也举在手里：斜斜地翘在右肩上方，一眼能看出这台车带家伙。 */
function idleWeapon(ctx, weapon) {
  ctx.save();
  ctx.translate(0.26, RIDE.barY - 0.03);
  ctx.rotate(0.66);
  drawHeld(ctx, weapon, 0);
  ctx.restore();
}

/** 氮气：排气口喷两口白热火焰，位置与长度用一条极便宜的伪随机流抖动。 */
function nitroFlame(ctx, seed) {
  const t = performance.now() / 90 + seed;
  for (const side of [-1, 1]) {
    const x = side * 0.26, y = 0.32;
    const len = 0.72 + Math.sin(t * 2.3 + side) * 0.28;
    const g = ctx.createLinearGradient(x, y, x, y - len);
    g.addColorStop(0, "rgba(255,255,255,.95)");
    g.addColorStop(0.3, "rgba(150,225,255,.8)");
    g.addColorStop(0.7, "rgba(90,130,255,.35)");
    g.addColorStop(1, "rgba(60,110,255,0)");
    poly(ctx, [
      [x - 0.14, y], [x + 0.14, y],
      [x + 0.045, y - len], [x - 0.045, y - len],
    ], g);
    bloom(ctx, x, y, 0.34, "rgba(140,210,255,.32)", 0.8);
  }
}
