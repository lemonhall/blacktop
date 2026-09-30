/**
 * 轻车那一组：轿车、皮卡、警车、三轮车、拖拉机。
 *
 * 它们共用一条"从上往下的读法"：**轮胎压地 → 车体 → 玻璃 → 保险杠与车牌 → 灯**。
 * 换车型只是换这几块的形状与比例，所以五种车摆在一起时，玩家一眼能分出
 * "哪个是能一脚踹飞的小车、哪个是踹完自己也会摔的大家伙"。
 *
 * 所有函数最后都调一次 `damagePass`：被踹飞的车身上会长出褶皱、凹坑和撕口。
 * 那不是特效，是**这台车刚才挨了一脚**的说明书。
 */

import { bloom, hgrad, shade, sheen, vgrad } from "./art.mjs";
import {
  GLASS, INK, circle, damagePass, lamp, plate, roundRect, shatter, wheel,
} from "./vehicleparts.mjs";
import { chassis, driver, flap, grime, markers } from "./vehiclechrome.mjs";

/** 轿车：低矮、宽，有车窗、后备箱缝、灯和车牌。 */
export function drawCar(ctx, w, h, paint, dir, dmg) {
  const oncoming = dir < 0, W2 = w / 2;
  wheel(ctx, -W2 - 0.06, 0.06, 0.56);
  wheel(ctx, W2 + 0.06, 0.06, 0.56);
  chassis(ctx, w);
  ctx.fillStyle = INK;
  roundRect(ctx, -W2 - 0.05, 0.22, w + 0.1, h * 0.76, 0.14);
  ctx.fillStyle = vgrad(ctx, 0, 0.26, h * 0.56, [
    [0, shade(paint, -0.46)], [0.42, paint], [1, shade(paint, 0.16)],
  ]);
  roundRect(ctx, -W2, 0.28, w, h * 0.64, 0.12);
  grime(ctx, w, h, 0.9);
  ctx.fillStyle = hgrad(ctx, -W2, W2, h * 0.5, [
    [0, "rgba(255,255,255,.22)"], [0.42, "rgba(255,255,255,0)"], [1, "rgba(0,0,0,.34)"],
  ]);
  roundRect(ctx, -W2, 0.28, w, h * 0.64, 0.12);
  ctx.fillStyle = "rgba(6,9,16,.5)";
  ctx.fillRect(-w * 0.46, 0.66, w * 0.92, 0.03);
  // 驾驶舱
  ctx.fillStyle = INK;
  roundRect(ctx, -w * 0.42, h * 0.62, w * 0.84, h * 0.42, 0.13);
  ctx.fillStyle = oncoming ? "rgba(150,190,230,.55)" : GLASS;
  roundRect(ctx, -w * 0.33, h * 0.7, w * 0.66, h * 0.26, 0.08);
  if (dmg > 0.4) shatter(ctx, -w * 0.33, h * 0.7, w * 0.66, h * 0.26);
  else {
    driver(ctx, 0, h * 0.72, w * 0.66, h * 0.22, oncoming ? 0.7 : 1);
    sheen(ctx, -w * 0.33, h * 0.7, w * 0.66, h * 0.26, 0.16);
  }
  // 高位刹车灯：后窗上沿那一条细红灯，跟在一台轿车后面时最显眼的一笔
  if (!oncoming) {
    ctx.fillStyle = "rgba(255,74,90,.5)";
    ctx.fillRect(-w * 0.16, h * 0.94, w * 0.32, 0.026);
  } else {
    // 迎面：车顶那根细天线，远远就能把它和厢货分开
    ctx.fillStyle = "rgba(18,22,30,.85)";
    ctx.fillRect(w * 0.3, h * 1.02, 0.025, 0.34);
  }
  flap(ctx, -W2 - 0.06, 0.02, 0.3, 0.3);
  flap(ctx, W2 + 0.06, 0.02, 0.3, 0.3);
  damagePass(ctx, w, h, dmg);
  for (const side of [-1, 1]) {
    lamp(ctx, side * w * 0.4, 0.5, 0.34, 0.19, dir);
    bloom(ctx, side * w * 0.4, 0.6, oncoming ? 0.55 : 0.44,
      oncoming ? "rgba(255,246,207,.5)" : "rgba(255,74,90,.34)", 0.85);
  }
  plate(ctx, 0.4, 0.19);
}

/** 皮卡：一半轿车、一半货厢。中国路上最多的一种车，也是最容易被忽略的一种。 */
export function drawPickup(ctx, w, h, paint, dir, dmg) {
  const oncoming = dir < 0, W2 = w / 2;
  wheel(ctx, -W2 - 0.05, 0.06, 0.62, 0.28);
  wheel(ctx, W2 + 0.05, 0.06, 0.62, 0.28);
  chassis(ctx, w, 0.2, 0.34);
  ctx.fillStyle = INK;
  roundRect(ctx, -W2 - 0.05, 0.22, w + 0.1, h * 0.78, 0.1);
  ctx.fillStyle = vgrad(ctx, 0, 0.26, h * 0.7, [
    [0, shade(paint, -0.44)], [0.44, paint], [1, shade(paint, 0.18)],
  ]);
  roundRect(ctx, -W2, 0.28, w, h * 0.68, 0.08);
  grime(ctx, w, h, 1.15);
  // 货厢：一块矮下去的平板 + 两侧挡板，比轿车多出来的那截就是它
  ctx.fillStyle = shade(paint, -0.24);
  roundRect(ctx, -w * 0.46, h * 0.5, w * 0.92, h * 0.2, 0.05);
  ctx.fillStyle = "rgba(8,11,18,.45)";
  ctx.fillRect(-w * 0.42, h * 0.52, w * 0.84, 0.03);
  ctx.fillStyle = shade(paint, 0.1);
  for (const side of [-1, 1]) roundRect(ctx, side * w * 0.42 - 0.05, h * 0.56, 0.1, h * 0.16, 0.03);
  // 货厢里拉的东西：两只捆着的箱子压低了重心，一眼就能看出"这车是干活的"
  if (!oncoming) {
    for (const [bx, bw] of [[-w * 0.24, w * 0.3], [w * 0.16, w * 0.26]]) {
      ctx.fillStyle = "rgba(14,18,26,.75)";
      roundRect(ctx, bx - bw / 2, h * 0.68, bw, h * 0.16, 0.03);
      ctx.fillStyle = "rgba(196,176,132,.35)";
      ctx.fillRect(bx - bw / 2, h * 0.72, bw, 0.025);
    }
    // 尾门把手 + 两侧的铰链
    ctx.fillStyle = "rgba(220,228,240,.4)";
    ctx.fillRect(-0.06, h * 0.56, 0.12, 0.05);
  }
  // 驾驶室
  ctx.fillStyle = INK;
  roundRect(ctx, -w * 0.4, h * 0.66, w * 0.8, h * 0.4, 0.1);
  ctx.fillStyle = oncoming ? "rgba(150,190,230,.55)" : GLASS;
  roundRect(ctx, -w * 0.31, h * 0.72, w * 0.62, h * 0.24, 0.07);
  if (dmg > 0.4) shatter(ctx, -w * 0.31, h * 0.72, w * 0.62, h * 0.24);
  else {
    driver(ctx, 0, h * 0.74, w * 0.62, h * 0.2, oncoming ? 0.7 : 1);
    sheen(ctx, -w * 0.31, h * 0.72, w * 0.62, h * 0.24, 0.14);
  }
  flap(ctx, -W2 - 0.05, 0.02, 0.32, 0.32);
  flap(ctx, W2 + 0.05, 0.02, 0.32, 0.32);
  damagePass(ctx, w, h, dmg);
  for (const side of [-1, 1]) lamp(ctx, side * w * 0.4, 0.46, 0.3, 0.2, dir);
  plate(ctx, 0.36, 0.2);
}

/**
 * 警车：**车顶那排灯就是它的全部意义**。
 *
 * 它跑得比谁都快（`VEHICLES.police` 的 vmax 是 34），迎面冲过来的那两秒里，
 * 玩家需要一眼认出"这是个会追上我的东西"。所以红蓝爆闪画在车顶正中间，
 * 而不是像别的车那样把预算花在格栅上。
 */
export function drawPolice(ctx, w, h, paint, dir, dmg) {
  drawCar(ctx, w, h, paint, dir, dmg);
  const W2 = w / 2;
  // 车顶灯排：底座 + 左红右蓝（`dir < 0` 时是迎面，灯排更靠上）
  ctx.fillStyle = INK;
  roundRect(ctx, -w * 0.3, h * 0.98, w * 0.6, 0.14, 0.03);
  ctx.fillStyle = "#ff3b4e";
  roundRect(ctx, -w * 0.28, h * 1.0, w * 0.26, 0.1, 0.02);
  ctx.fillStyle = "#3b8bff";
  roundRect(ctx, w * 0.02, h * 1.0, w * 0.26, 0.1, 0.02);
  bloom(ctx, -w * 0.16, h * 1.06, 0.5, "rgba(255,59,78,.55)", 1.1);
  bloom(ctx, w * 0.16, h * 1.06, 0.5, "rgba(59,139,255,.55)", 1.1);
  // 侧面的条纹：远处看不出灯的时候，靠这两道白杠认它
  ctx.fillStyle = "rgba(240,246,255,.85)";
  for (const side of [-1, 1]) ctx.fillRect(side * W2 - (side > 0 ? 0.12 : 0), h * 0.36, 0.12, h * 0.34);
  // 尾部那道"POLICE"横条 + 侧窗上的探照灯：追你的时候最容易被记住的两处
  ctx.fillStyle = "rgba(30,42,66,.85)";
  roundRect(ctx, -w * 0.3, h * 0.56, w * 0.6, 0.11, 0.02);
  ctx.fillStyle = "rgba(226,238,255,.9)";
  ctx.fillRect(-w * 0.26, h * 0.585, w * 0.52, 0.045);
  ctx.fillStyle = "#e8eef8";
  circle(ctx, -W2 + 0.16, h * 1.06, 0.055);
  ctx.fillStyle = "rgba(12,16,24,.6)";
  roundRect(ctx, -W2 + 0.1, h * 1.02, 0.12, 0.07, 0.02);
  // 前杠的推车杠：警车侧面那道黑杠在夜里比警灯先被看见
  if (dir < 0) {
    ctx.fillStyle = "rgba(14,18,26,.8)";
    roundRect(ctx, -w * 0.5, 0.3, w, 0.1, 0.03);
  }
  markers(ctx, w * 0.9, h * 1.16);
}

/**
 * 三轮车：夜市的灵魂。窄、矮、慢，前面一个小篷子。
 * 它是最容易被一脚踹上天的一台（`fly: 1.35`），所以画得也最轻佻。
 */
export function drawTrike(ctx, w, h, paint, dir, dmg) {
  const oncoming = dir < 0, W2 = w / 2;
  wheel(ctx, -W2 - 0.05, 0.05, 0.44, 0.18);
  wheel(ctx, W2 + 0.05, 0.05, 0.44, 0.18);
  wheel(ctx, 0, 0.05, 0.4, 0.16);
  ctx.fillStyle = INK;
  roundRect(ctx, -W2 - 0.04, 0.24, w + 0.08, h * 0.8, 0.07);
  ctx.fillStyle = vgrad(ctx, 0, 0.28, h * 0.9, [[0, shade(paint, -0.4)], [1, paint]]);
  roundRect(ctx, -W2, 0.3, w, h * 0.7, 0.06);
  grime(ctx, w, h, 1.3);
  // 篷子：一块帆布 + 三根支柱，这是"三轮车"三个字最省事的写法
  ctx.fillStyle = "#2f3b4c";
  roundRect(ctx, -w * 0.34, h * 0.86, w * 0.68, h * 0.3, 0.06);
  ctx.fillStyle = "rgba(255,255,255,.14)";
  ctx.fillRect(-w * 0.3, h * 0.9, w * 0.6, 0.03);
  // 篷子的荷叶边 + 侧面挂着的小招牌：夜市那台车最招人认的两笔
  ctx.fillStyle = "rgba(214,86,74,.8)";
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.arc(i * w * 0.13, h * 0.86, w * 0.07, Math.PI, 0);
    ctx.fill();
  }
  if (!oncoming) {
    ctx.fillStyle = "rgba(240,206,120,.85)";
    roundRect(ctx, -w * 0.42, h * 0.5, w * 0.16, h * 0.2, 0.02);
    ctx.fillStyle = "rgba(40,30,18,.7)";
    ctx.fillRect(-w * 0.4, h * 0.58, w * 0.12, 0.022);
  }
  ctx.fillStyle = "rgba(8,11,18,.6)";
  for (const x of [-w * 0.28, 0, w * 0.28]) ctx.fillRect(x, h * 0.66, 0.045, h * 0.24);
  if (oncoming) {
    ctx.fillStyle = GLASS;
    roundRect(ctx, -w * 0.26, h * 0.5, w * 0.52, h * 0.22, 0.04);
    driver(ctx, 0, h * 0.52, w * 0.5, h * 0.18, 0.65);
  }
  flap(ctx, -W2 - 0.05, 0.02, 0.2, 0.24);
  flap(ctx, W2 + 0.05, 0.02, 0.2, 0.24);
  damagePass(ctx, w, h, dmg);
  lamp(ctx, 0, h * 0.42, 0.22, 0.14, dir);
  plate(ctx, 0.34, 0.14);
}

/** 拖拉机：一个巨大的后轮 + 一个小的前轮，慢得像一个笑话。 */
export function drawTractor(ctx, w, h, paint, dir, dmg) {
  const W2 = w / 2;
  wheel(ctx, -W2 - 0.02, 0.05, 0.86, 0.36);
  wheel(ctx, W2 + 0.02, 0.05, 0.86, 0.36);
  wheel(ctx, -0.5, 0.05, 0.5, 0.22);
  wheel(ctx, 0.5, 0.05, 0.5, 0.22);
  ctx.fillStyle = shade(paint, -0.2);
  roundRect(ctx, -w * 0.2, h * 0.3, w * 0.4, h * 0.4, 0.06);
  ctx.fillStyle = vgrad(ctx, 0, h * 0.62, h * 1.1, [[0, shade(paint, -0.34)], [1, paint]]);
  roundRect(ctx, -w * 0.42, h * 0.6, w * 0.84, h * 0.46, 0.07);
  grime(ctx, w, h, 1.5);
  // 驾驶棚：四根柱子 + 一块顶，中间是空的
  ctx.fillStyle = "rgba(8,11,18,.65)";
  for (const x of [-w * 0.3, w * 0.3]) ctx.fillRect(x - 0.03, h * 1.0, 0.06, h * 0.34);
  ctx.fillStyle = "#3a4453";
  roundRect(ctx, -w * 0.38, h * 1.3, w * 0.76, 0.1, 0.03);
  // 座椅靠背 + 方向盘：敞篷的棚子不画这两件，就是一个空架子
  ctx.fillStyle = "rgba(14,18,26,.85)";
  roundRect(ctx, -w * 0.1, h * 0.8, w * 0.24, h * 0.3, 0.04);
  ctx.fillStyle = "rgba(20,26,36,.9)";
  ctx.beginPath();
  ctx.arc(w * 0.06, h * 1.06, 0.13, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(20,26,36,.9)";
  ctx.lineWidth = 0.045;
  ctx.stroke();
  // 后挂的农具：一台拖拉机在路上一半是去地里，一半是拖着东西回村
  if (!dir || dir > 0) {
    ctx.fillStyle = "rgba(96,104,118,.85)";
    roundRect(ctx, -w * 0.3, 0.3, w * 0.6, 0.1, 0.03);
    ctx.fillStyle = "rgba(30,36,46,.8)";
    for (const x of [-w * 0.24, 0, w * 0.24]) ctx.fillRect(x - 0.03, 0.36, 0.06, 0.26);
  }
  // 排气管：一根朝天的细管，拖拉机最像拖拉机的一笔
  ctx.fillStyle = "#8b93a3";
  ctx.fillRect(-w * 0.34, h * 0.86, 0.08, h * 0.66);
  ctx.fillStyle = "#20242c";
  ctx.fillRect(-w * 0.36, h * 1.5, 0.12, 0.06);
  damagePass(ctx, w, h, dmg);
  lamp(ctx, -w * 0.04, h * 0.72, 0.24, 0.16, dir);
  plate(ctx, 0.42, 0.2);
}
