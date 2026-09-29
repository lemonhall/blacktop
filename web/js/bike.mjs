/**
 * 摩托车本体（后视）。画在**米**坐标系里（y 轴向上，原点在后轮接地点），
 * 所以"这台车一米高"在代码里就是"画一格"。
 *
 * 后视是最难画的角度：看不到车头，能看见的只有**尾段**——后轮、尾罩、尾灯、
 * 车牌、两根排气管、双减震。设计上就按这个顺序一层层压上去：
 *   影子（在 `sprites.mjs`）→ 后轮 → 摇臂/减震 → 排气 → 尾罩/尾灯/车牌 → 脚踏。
 *
 * `detail` 是"离相机多远"的代理（0 远 / 1 中 / 2 近）。远处只保留**轮廓**：
 * 一张 8 像素高的车画上辐条，只会变成一团泥。这条规矩让远处的车干净、近处的车
 * 有肉感——比无脑加细节重要得多。
 *
 * 尺寸全部来自真车：后胎直径 0.6 米、宽 0.23 米，座高 0.88 米，脚踏在 0.47 米。
 * 上一版把后胎画成 0.46 米宽、头盔画成 0.5 米宽，于是整台车看起来像个积木人。
 */

import {
  bloom, circle, fillRound, hgrad, mix, poly, ring, shade, speckle, tube,
} from "./art.mjs";

const TAU = Math.PI * 2;

/**
 * 骑手坐在哪。**这是 `bike.mjs` 与 `sprites.mjs` 之间唯一的契约**：
 * 车的座垫/脚踏/车把按它摆位，人的胯/膝/脚/手按它摆位。以前这些数字两边各写一份，
 * 于是改完一个另一个立刻穿帮（手悬在半空、脚踩不到脚踏）。
 */
export const RIDE = {
  hipX: 0.17, hipY: 0.88,
  kneeX: 0.275, kneeY: 0.62,
  footX: 0.3, footY: 0.45,
  shoulderY: 1.4, barY: 1,
};

const INK = "rgba(4,6,12,.92)";
const CHROME = "#c9d2e1";
/** 排气是**哑光钛**，不是镀铬：真车从后面看，管子是被尾罩压住的暗色。 */
const TITANIUM = "#5f6875";

/** 后胎：直径 0.6 米、宽 0.23 米。 */
const WHEEL = { w: 0.23, h: 0.6 };

/**
 * 尾罩最宽处（米，到中线的距离）。这是**"腿有没有露出来"的唯一判据**：
 * 膝盖和小腿必须在它外面，否则从正后方看骑手就是没有腿的。
 */
export const TAIL_HALF = 0.226;

/**
 * 脚踏杆：从车体侧面横支出来的一根短杆，末端一颗黑端盖。骑手的脚**踩在它的
 * 顶面上**——`riderlegs.mjs` 的靴底高度直接由这里算出来，所以两边不会各写一份。
 */
export const PEG = { inX: 0.17, outX: 0.335, r: 0.048, capX: 0.34, capR: 0.032 };

export function drawBike(ctx, { palette, detail = 2, wobble = 0 }) {
  rearWheel(ctx, detail);
  chain(ctx, detail);
  swingarm(ctx, detail);
  shocks(ctx, detail);
  exhausts(ctx, detail, wobble);
  tail(ctx, palette, detail);
  pegs(ctx, detail);
}

/**
 * 链条与链罩。后视角度里它是"这确实是一台摩托"最直接的证据，也很实用：
 * 车尾下半身本来是一大团黑（轮胎 + 摇臂 + 排气），有它才被切成两段。
 */
function chain(ctx, detail) {
  // 贴着后轮左前方的一段链罩：从轮子**里面**长出来，不是悬在旁边的另一件东西
  fillRound(ctx, -0.32, 0.196, 0.26, 0.078, 0.03, hgrad(ctx, -0.32, -0.06, 0.235, [
    [0, "#2f3641"], [0.44, "#1e232c"], [1, "#0d1016"],
  ]));
  ctx.fillStyle = "rgba(190,206,228,.16)";
  ctx.fillRect(-0.315, 0.262, 0.25, 0.012);
  if (detail < 2) return;
  ctx.fillStyle = "rgba(206,220,240,.38)";
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(-0.3 + i * 0.042, 0.19, 0.012, 0, TAU);
    ctx.fill();
  }
}

/** 后轮：从后面看到的是**胎面**，所以主体是一条竖着的圆角矩形，不是轮胎的侧面。 */
function rearWheel(ctx, detail) {
  const { w, h } = WHEEL;
  fillRound(ctx, -w / 2 - 0.028, -0.012, w + 0.056, h + 0.03, 0.1, INK);
  const g = hgrad(ctx, -w / 2, w / 2, 0.3, [
    [0, "#333943"], [0.26, "#1a1d25"], [0.62, "#0d0f15"], [1, "#07080c"],
  ]);
  fillRound(ctx, -w / 2, 0, w, h, 0.095, g);
  if (detail === 0) return;
  // 胎面：两道排水沟 + 中间那条磨平的亮带。轮胎的"圆"全靠这三条横线。
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(-w / 2, 0.09, w, 0.034);
  ctx.fillRect(-w / 2, 0.47, w, 0.034);
  ctx.fillStyle = "rgba(200,212,230,.1)";
  ctx.fillRect(-0.017, 0.05, 0.034, 0.5);
  if (detail >= 2) {
    // 左缘那一道细亮边：橡胶被灯照到的唯一说得通的证据
    ctx.fillStyle = "rgba(190,205,230,.18)";
    ctx.fillRect(-w / 2 + 0.012, 0.06, 0.015, 0.46);
    speckle(ctx, -w / 2, 0.02, w, 0.55, 10, "rgba(255,255,255,.05)", 3, 0.012);
  }
}

/** 摇臂：从轮心往前上方伸的两根短臂。少了它，后轮看起来是"挂"在车上的。 */
function swingarm(ctx, detail) {
  ctx.lineCap = "round";
  ctx.strokeStyle = "#262b36";
  ctx.lineWidth = 0.12;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 0.075, 0.26);
    ctx.lineTo(side * 0.175, 0.5);
    ctx.stroke();
  }
  if (detail < 1) return;
  ctx.strokeStyle = "rgba(255,255,255,.1)";
  ctx.lineWidth = 0.028;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 0.088, 0.28);
    ctx.lineTo(side * 0.166, 0.48);
    ctx.stroke();
  }
}

/** 双减震：弹簧是"一圈一圈的亮线"，这是全车最便宜也最像机械的一处。 */
function shocks(ctx, detail) {
  for (const side of [-1, 1]) {
    tube(ctx, side * 0.175, 0.5, side * 0.14, 0.88, 0.078, "#39414f", { bright: 0.34 });
    if (detail < 1) continue;
    ctx.strokeStyle = "rgba(232,240,252,.42)";
    ctx.lineWidth = 0.022;
    for (let i = 0; i < 4; i++) {
      const y = 0.57 + i * 0.075;
      ctx.beginPath();
      ctx.moveTo(side * 0.198, y);
      ctx.lineTo(side * 0.117, y + 0.024);
      ctx.stroke();
    }
  }
}

/**
 * 两根排气管：哑光钛管 + 朝我们张开的管口 + 一圈热变色。
 *
 * 上一版这里是**镀铬亮银色**，于是整台车最亮的东西成了两根管子，远看像两根白香肠
 * 架在轮子上。真车从这个角度看，管子是被尾罩压住的、偏暗的——所以这里改成钛灰。
 */
function exhausts(ctx, detail, wobble) {
  for (const side of [-1, 1]) {
    // 从轮胎**边上**横着伸出来，而不是从轮子中间穿过：管子压着胎面，
    // 一眼就看得出是"两台不同的东西各画各的"
    const tipX = side * (0.235 + wobble * 0.02), tipY = 0.33;
    tube(ctx, side * 0.13, 0.42, tipX, tipY, 0.088, TITANIUM, { bright: 0.34, edge: 0.02 });
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(side * 1.35);
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.032, 0.044, 0, 0, TAU);
    ctx.fillStyle = "#0a0c11";
    ctx.fill();
    ring(ctx, 0, 0, 0.04, 0.014, "rgba(215,228,246,.45)");
    ctx.restore();
    if (detail >= 2) {
      // 头段那一点点烤蓝：两笔就够，多一笔就变成霓虹灯
      ctx.globalAlpha = 0.4;
      poly(ctx, [
        [side * 0.175, 0.39], [side * 0.145, 0.43], [side * 0.125, 0.39], [side * 0.15, 0.35],
      ], "rgba(150,110,240,.45)");
      ctx.globalAlpha = 1;
      // 隔热罩：管子上面压一片深色，机械感立刻从"塑料管"变成"排气系统"
      ctx.save();
      ctx.translate(side * 0.178, 0.382);
      ctx.rotate(-side * 0.52);
      fillRound(ctx, -0.048, -0.045, 0.096, 0.09, 0.028, "rgba(24,28,38,.72)");
      ctx.restore();
    }
  }
}

/** 尾罩 + 尾灯 + 车牌。整台车的色块主体，也是"这台车是谁的"唯一出处。 */
function tail(ctx, p, detail) {
  // 尾罩是**背光面**，而且它的职责是当车手的背景板：比人还亮的话，人就被吃掉了。
  // 车漆的色相留着（一眼能认出这是哪套配色），明度整体压进暗调。
  const base = mix(p.bike, "#0e1219", 0.64);
  const g = hgrad(ctx, -0.21, 0.21, 0.75, [
    [0, shade(base, 0.4)], [0.3, base], [0.7, shade(base, -0.3)], [1, shade(base, -0.58)],
  ]);
  ctx.beginPath();
  ctx.moveTo(-0.2, 0.56);
  ctx.quadraticCurveTo(-TAIL_HALF, 0.72, -0.19, 0.84);
  ctx.quadraticCurveTo(-0.176, 0.93, -0.135, 0.95);
  ctx.lineTo(0.135, 0.95);
  ctx.quadraticCurveTo(0.176, 0.93, 0.19, 0.84);
  ctx.quadraticCurveTo(TAIL_HALF, 0.72, 0.2, 0.56);
  ctx.quadraticCurveTo(0, 0.51, -0.2, 0.56);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 0.03;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // 左上缘的轮廓光：尾罩压暗之后，靠它把车尾从夜色里"切"出来
  ctx.beginPath();
  ctx.moveTo(-0.2, 0.57);
  ctx.quadraticCurveTo(-(TAIL_HALF - 0.004), 0.72, -0.186, 0.84);
  ctx.strokeStyle = "rgba(190,214,246,.3)";
  ctx.lineWidth = 0.022;
  ctx.stroke();

  // 尾罩与轮胎的接缝：一道软阴影。伪 3D 里没有体积光，"压住"这件事只能靠接缝变暗
  ctx.fillStyle = "rgba(4,6,12,.5)";
  ctx.beginPath(); ctx.ellipse(0, 0.5, 0.2, 0.055, 0, 0, TAU); ctx.fill();

  // 尾灯：夜里唯一"我在发光"的东西。**远景也画**——它是两百米外认出前车的关键。
  // 面积要克制：0.29 米宽的一整块红，看着像给车穿了条红内裤。
  fillRound(ctx, -0.115, 0.715, 0.23, 0.09, 0.035, "rgba(46,5,11,.92)");
  fillRound(ctx, -0.1, 0.728, 0.2, 0.064, 0.026, hgrad(ctx, -0.1, 0.1, 0.76, [
    [0, "#ff9aa1"], [0.42, "#ff2c40"], [1, "#8f0f1e"],
  ]));
  bloom(ctx, 0, 0.76, 0.3, "rgba(255,64,76,.32)", 0.8);

  // 车牌：一块白牌子在夜里最显眼，所以远景也不省
  ctx.save();
  ctx.translate(0, 0.52);
  ctx.rotate(0.03);
  fillRound(ctx, -0.13, -0.045, 0.26, 0.09, 0.016, "#e9eef8");
  ctx.fillStyle = "rgba(24,72,150,.9)";
  ctx.fillRect(-0.13, -0.045, 0.036, 0.09);
  ctx.fillStyle = "rgba(18,24,38,.8)";
  ctx.fillRect(-0.082, 0.018, 0.2, 0.016);
  if (detail >= 1) {
    ctx.fillRect(-0.082, -0.016, 0.09, 0.014);
    ctx.fillRect(-0.082, -0.036, 0.13, 0.014);
  }
  ctx.restore();
  if (detail === 0) return;

  // 侧面的拉花：一道从腰线扫向车尾的亮条，把一块纯色切成"有钣金的车"
  poly(ctx, [[-0.19, 0.6], [-0.03, 0.6], [-0.08, 0.92], [-0.16, 0.92]], "rgba(255,255,255,.14)");
  // 座垫：尾罩顶上那条哑光带，骑手的屁股正好压在上面
  fillRound(ctx, -0.15, 0.86, 0.3, 0.1, 0.045, hgrad(ctx, -0.15, 0.15, 0.91, [
    [0, "#333a49"], [0.5, "#20242f"], [1, "#0e1119"],
  ]));
  ctx.fillStyle = "rgba(255,255,255,.12)";
  ctx.fillRect(-0.13, 0.945, 0.26, 0.018);
  ctx.fillStyle = "rgba(255,206,206,.45)";
  ctx.fillRect(-0.09, 0.795, 0.18, 0.011);
  for (const side of [-1, 1]) {
    circle(ctx, side * 0.196, 0.75, 0.032, "#ffab2e");
    if (detail >= 2) {
      circle(ctx, side * 0.196, 0.75, 0.019, "#fff0c8");
      bloom(ctx, side * 0.196, 0.75, 0.13, "rgba(255,171,46,.45)", 0.75);
    }
  }
  if (detail >= 2) speckle(ctx, -0.2, 0.56, 0.4, 0.4, 12, "rgba(255,255,255,.06)", 21, 0.014);
}

/** 脚踏：车尾下缘的两粒小零件，脚踩在上面才叫"骑车"。 */
function pegs(ctx, detail) {
  for (const side of [-1, 1]) {
    tube(ctx, side * PEG.inX, RIDE.footY, side * PEG.outX, RIDE.footY, PEG.r, "#98a2b3", { bright: 0.4 });
    circle(ctx, side * PEG.capX, RIDE.footY, PEG.capR, "#15181f");
  }
  if (detail < 1) return;
  for (const side of [-1, 1]) {
    // 脚踏支架：一根斜插向车体的短臂。上一版这里是两块悬空的黑色方块
    ctx.strokeStyle = "rgba(38,44,56,.95)";
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(side * (PEG.outX - 0.02), RIDE.footY - 0.01);
    ctx.lineTo(side * (PEG.inX + 0.01), 0.34);
    ctx.stroke();
  }
}
