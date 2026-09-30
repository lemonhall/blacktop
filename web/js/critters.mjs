/**
 * 路上的畜生：牛、羊、鹿、野猪、狗、鹅。侧视、四足、左亮右暗。
 *
 * 1991～1993 那三代《暴力摩托》里最有名的一个彩蛋就是"一头牛站在路中间"。
 * 画它们有两条硬要求：
 *   1. **一眼认出是什么**——在 60 公里的时速下你只有半秒。所以每个品种都保留
 *      它最扎眼的那一件：牛的斑、羊的毛、鹿的角、猪的獠牙、狗的翘尾巴、鹅的长脖子。
 *   2. **体型要准**——判定用的是 `sim/critters.mjs` 里的长宽，画出来的东西
 *      不能比判定胖也不能比它瘦。撞上一头"看着能躲过去"的牛最让人生气。
 *
 * 画法分在两层：**解剖零件**（两段腿 + 蹄、贝塞尔躯干、锥形脖子、五官）
 * 住在 `critterparts.mjs`；这里只写"每种动物长什么样"。上一版六种动物共用
 * 一套方块零件，画出来像盖了黑补丁的白桌子——这次每一件都按自己的骨架画。
 *
 * 被踹飞之后按 `spin` 旋转（和车流同一套处理），落地就不再画了。
 */

import { TAU } from "../../sim/constants.mjs";
import { hgrad, poly, vgrad } from "./art.mjs";
import { barrel, disc, ear, eye, legs, neckHead, ovalPath, patch, stick, tail } from "./critterparts.mjs";

/** 牛：花斑白身 + 短角垂耳 + 一撮尾巴。世界纪录里最经典的那一头。 */
export function drawCow(ctx, w, h) {
  legs(ctx, w, h, "#efece4", {
    top: 0.6, len: 0.42, th: 0.075,
    // 后腿的飞节朝后、前腿的膝朝前，四条腿之间差这一点点角度就够了
    list: [[-0.34, true, 0.15], [-0.23, false, 0.11], [0.13, true, -0.14], [0.25, false, -0.1]],
  });
  barrel(ctx, w, h, "#f2efe8", { x0: -0.48, x1: 0.3, y: 0.98, depth: 0.42, hump: 0.04 });
  // 三块花斑：都压在躯干里侧，边缘不进肚子线，远看才有"斑点"的疏密
  patch(ctx, w, h, [[-0.42, 0.9], [-0.24, 0.93], [-0.17, 0.74], [-0.36, 0.66]], "#2c2823");
  patch(ctx, w, h, [[-0.06, 0.93], [0.12, 0.95], [0.06, 0.74], [-0.12, 0.8]], "#2c2823");
  patch(ctx, w, h, [[0.16, 0.66], [0.26, 0.7], [0.24, 0.62], [0.17, 0.6]], "#332e28");
  tail(ctx, w, h, "#efece4", { x: -0.48, y: 0.88, len: 0.3 });
  neckHead(ctx, w, h, "#e9e5db", {
    from: [0.26, 0.82], to: [0.42, 0.78], th: 0.15, headRx: 0.1, headRy: 0.088, tilt: -0.1,
    face: (c, W, H) => {
      // 鼻子：一块带粉的圆吻，比整张脸往前探出去一点，牛的味道全在这块嘴上
      ovalPath(c, W * 0.075, -H * 0.045, W * 0.062, H * 0.048, -0.22);
      c.fillStyle = hgrad(c, W * 0.01, W * 0.16, -H * 0.045,
        [[0, "#efd0c6"], [0.55, "#dcae9f"], [1, "#b98476"]]);
      c.fill();
      disc(c, W * 0.062, -H * 0.028, W * 0.013, "#8d6259");
      disc(c, W * 0.098, -H * 0.058, W * 0.013, "#8d6259");
      // 犄角：两截，第二截往上翘，短的才像牛，长的就成羊了
      for (const [x, sx] of [[-W * 0.005, -1], [W * 0.03, 1]]) {
        stick(c, x, H * 0.07, x + sx * W * 0.045, H * 0.115, W * 0.016, "#cbbf9e");
        stick(c, x + sx * W * 0.045, H * 0.115, x + sx * W * 0.03, H * 0.155, W * 0.013, "#cbbf9e");
      }
      ear(c, -W * 0.055, H * 0.055, W * 0.085, 2.7, "#ded8cc", { drop: 0.5 });
      ear(c, W * 0.045, H * 0.062, W * 0.075, 0.5, "#ded8cc", { drop: 0.5 });
      eye(c, -W * 0.005, H * 0.022, W * 0.017);
    },
  });
}

/** 羊：一团毛 + 一张黑脸 + 四根细腿。 */
export function drawSheep(ctx, w, h) {
  legs(ctx, w, h, "#4d4842", {
    top: 0.46, len: 0.34, th: 0.05, hoof: "#241f1b",
    list: [[-0.26, true, 0.1], [-0.15, false, 0.07], [0.12, true, -0.08], [0.22, false, -0.06]],
  });
  // 羊毛：十二团叠在一起，外圈亮、内圈暗，看上去才是"一坨"而不是"一个球"
  const puff = [[-0.3, 0.62, 0.19], [-0.14, 0.72, 0.2], [0.04, 0.74, 0.19], [0.2, 0.68, 0.18],
    [-0.36, 0.48, 0.17], [-0.18, 0.44, 0.19], [0.02, 0.44, 0.18], [0.2, 0.5, 0.16],
    [-0.26, 0.8, 0.16], [-0.06, 0.86, 0.15], [0.12, 0.82, 0.14], [-0.02, 0.6, 0.2]];
  for (const [x, y, r] of puff) {
    disc(ctx, w * x, h * y, w * r, hgrad(ctx, w * (x - r), w * (x + r * 0.4), h * y,
      [[0, "#ffffff"], [0.55, "#eeeae2"], [1, "#c4bfb6"]]));
  }
  disc(ctx, w * 0.34, h * 0.66, w * 0.08, "rgba(60,54,46,.22)");
  tail(ctx, w, h, "#eae6de", { x: -0.44, y: 0.62, up: false, len: 0.14 });
  // 头：一张窄窄的黑脸，耳朵横着支出去——羊脸一窄就不会被认成别的
  ovalPath(ctx, w * 0.42, h * 0.64, w * 0.1, h * 0.115, -0.06);
  ctx.fillStyle = hgrad(ctx, w * 0.32, w * 0.5, h * 0.64,
    [[0, "#4a453f"], [0.6, "#332f2b"], [1, "#201d1a"]]);
  ctx.fill();
  ear(ctx, w * 0.36, h * 0.72, w * 0.13, 2.95, "#2c2825", { drop: 0.42 });
  ear(ctx, w * 0.38, h * 0.74, w * 0.12, 3.35, "#3a3531", { drop: 0.42 });
  eye(ctx, w * 0.44, h * 0.67, w * 0.02);
  disc(ctx, w * 0.5, h * 0.6, w * 0.018, "#171512");
}

/** 鹿：细腿 + 一对分叉的角 + 一截白屁股。 */
export function drawDeer(ctx, w, h) {
  legs(ctx, w, h, "#a8723f", {
    top: 0.62, len: 0.5, th: 0.045, hoof: "#3a2a18",
    list: [[-0.3, true, 0.14], [-0.2, false, 0.1], [0.16, true, -0.13], [0.27, false, -0.09]],
  });
  barrel(ctx, w, h, "#b07c46", { x0: -0.44, x1: 0.3, y: 1, depth: 0.36, hump: 0.02 });
  // 白屁股：鹿跑起来那一块最亮，也是"这是鹿不是狍子"的第一眼线索。
  // 用一层**渐变**的椭圆去提亮后胯：硬边的多边形斑压在躯干上，看着像贴了张纸。
  ovalPath(ctx, w * -0.33, h * 0.82, w * 0.1, h * 0.13, 0.12);
  ctx.fillStyle = hgrad(ctx, w * -0.44, w * -0.2, h * 0.82,
    [[0, "#efe4cd"], [0.55, "#e0d0b2"], [1, "rgba(176,124,70,.15)"]]);
  ctx.fill();
  tail(ctx, w, h, "#e8dcc6", { x: -0.42, y: 0.92, up: false, len: 0.12 });
  neckHead(ctx, w, h, "#a8723f", {
    from: [0.24, 0.9], to: [0.4, 1.06], th: 0.11, headRx: 0.075, headRy: 0.06, tilt: -0.35,
    face: (c, W, H) => {
      // 鹿脸是斜着往前下方探的：吻部一块更亮的圆
      ovalPath(c, W * 0.07, -H * 0.03, W * 0.058, H * 0.036, -0.3);
      c.fillStyle = "#e2d3ba";
      c.fill();
      disc(c, W * 0.095, -H * 0.038, W * 0.012, "#2a1f14");
      ear(c, -W * 0.04, H * 0.035, W * 0.07, 2.5, "#8e6234", { drop: 0.45 });
      // 角：一根主枝 + 每边两根分叉，主枝往后再往上，就有了鹿角那个"扇形"
      for (const [x, sx] of [[-W * 0.02, -1], [W * 0.02, 1]]) {
        stick(c, x, H * 0.045, x + sx * W * 0.03, H * 0.22, W * 0.014, "#97724a");
        stick(c, x + sx * W * 0.012, H * 0.13, x + sx * W * 0.08, H * 0.2, W * 0.012, "#97724a");
        stick(c, x + sx * W * 0.024, H * 0.18, x + sx * W * 0.095, H * 0.13, W * 0.011, "#97724a");
      }
      eye(c, W * 0.008, H * 0.008, W * 0.015);
    },
  });
}

/** 野猪：矮胖的深色身体 + 獠牙 + 背上一排鬃毛。 */
export function drawBoar(ctx, w, h) {
  legs(ctx, w, h, "#40342b", {
    top: 0.42, len: 0.3, th: 0.07, hoof: "#1e1815",
    list: [[-0.3, true, 0.12], [-0.18, false, 0.08], [0.14, true, -0.11], [0.25, false, -0.07]],
  });
  barrel(ctx, w, h, "#4a3a2e", { x0: -0.46, x1: 0.32, y: 0.8, depth: 0.34, hump: 0.06 });
  // 鬃毛：一排从前倾到后倾的三角，猪背上的刷子
  for (let i = 0; i < 8; i++) {
    const x = w * (-0.42 + i * 0.1);
    const t = 1 - i / 8;
    // 鬃毛只冒出背线一点点：冒多了就成一把锯条，猪看着像野猪形状的电锯
    poly(ctx, [[x, h * 0.82], [x + w * 0.042, h * (0.86 + t * 0.045)], [x + w * 0.084, h * 0.82]],
      i % 2 ? "#2c231b" : "#3a2d22");
  }
  tail(ctx, w, h, "#4a3a2e", { x: -0.46, y: 0.74, up: false, len: 0.16 });
  // 头：楔形吻 + 獠牙。猪头是三角形的，所以这里用多棱而不用椭圆
  poly(ctx, [[w * 0.3, h * 0.86], [w * 0.44, h * 0.82], [w * 0.52, h * 0.7],
    [w * 0.46, h * 0.56], [w * 0.3, h * 0.56]], "#3d322a");
  ovalPath(ctx, w * 0.5, h * 0.7, w * 0.05, h * 0.05, 0.2);
  ctx.fillStyle = "#6b5341";
  ctx.fill();
  disc(ctx, w * 0.51, h * 0.71, w * 0.018, "#e0c9b4");
  disc(ctx, w * 0.505, h * 0.72, w * 0.007, "#2a1d14");
  disc(ctx, w * 0.52, h * 0.68, w * 0.007, "#2a1d14");
  ear(ctx, w * 0.34, h * 0.86, w * 0.11, 2.2, "#33291f", { drop: 0.35 });
  // 獠牙：往上翘的两颗小白牙，正面冲你的时候最扎眼
  stick(ctx, w * 0.44, h * 0.64, w * 0.52, h * 0.76, w * 0.018, "#eae4d4");
  stick(ctx, w * 0.47, h * 0.62, w * 0.56, h * 0.72, w * 0.015, "#eae4d4");
  eye(ctx, w * 0.4, h * 0.78, w * 0.019);
}

/** 狗：小、翘尾巴、四条短腿，脖子上一条红项圈。 */
export function drawDog(ctx, w, h) {
  legs(ctx, w, h, "#a8763f", {
    top: 0.5, len: 0.36, th: 0.05, hoof: "#463019",
    list: [[-0.26, true, 0.12], [-0.14, false, 0.08], [0.14, true, -0.12], [0.24, false, -0.08]],
  });
  barrel(ctx, w, h, "#b8843f", { x0: -0.36, x1: 0.26, y: 0.8, depth: 0.3, hump: 0.01 });
  // 翘尾巴：狗和别的四足动物最大的区别就在这一根
  tail(ctx, w, h, "#b8843f", { x: -0.36, y: 0.78, up: true, len: 0.22 });
  neckHead(ctx, w, h, "#c08a48", {
    from: [0.24, 0.74], to: [0.4, 0.78], th: 0.11, headRx: 0.075, headRy: 0.06, tilt: -0.05,
    face: (c, W, H) => {
      // 项圈：斜着套在脖子上的一圈，比一根竖直的红条更像"戴着的"
      stick(c, -W * 0.14, -H * 0.06, -W * 0.07, H * 0.075, W * 0.024, "#c0392b");
      poly(c, [[W * 0.02, H * 0.035], [W * 0.1, H * 0.01], [W * 0.12, -H * 0.05],
        [W * 0.03, -H * 0.055]], "#a86f32");
      disc(c, W * 0.115, -H * 0.028, W * 0.013, "#241a10");
      ear(c, -W * 0.03, H * 0.055, W * 0.07, 1.9, "#8a6134", { drop: 0.2 });
      ear(c, W * 0.03, H * 0.06, W * 0.065, 1.1, "#96693a", { drop: 0.2 });
      eye(c, W * 0.0, H * 0.005, W * 0.016);
    },
  });
}

/** 鹅：白身 + S 形长脖子 + 橙嘴 + 一对蹼脚。 */
export function drawGoose(ctx, w, h) {
  // 蹼脚：扁扁的三趾，橙色，压在影子最前
  for (const x of [-0.14, 0.12]) {
    poly(ctx, [[w * x, 0], [w * (x + 0.24), 0], [w * (x + 0.21), h * 0.075], [w * x, h * 0.075]],
      "#d8822a");
    for (const t of [0.35, 0.65]) {
      poly(ctx, [[w * (x + 0.24 * t), 0], [w * (x + 0.24 * t + 0.05), 0],
        [w * (x + 0.24 * t + 0.03), h * 0.04]], "#b96c1c");
    }
  }
  // 身子：一个前高后低的水滴，屁股那头上翘（鹅浮在水上就是这个姿势）
  ctx.beginPath();
  ctx.moveTo(-w * 0.46, h * 0.46);
  ctx.bezierCurveTo(-w * 0.5, h * 0.68, -w * 0.24, h * 0.72, -w * 0.02, h * 0.7);
  ctx.bezierCurveTo(w * 0.2, h * 0.68, w * 0.3, h * 0.6, w * 0.24, h * 0.44);
  ctx.bezierCurveTo(w * 0.16, h * 0.26, -w * 0.3, h * 0.24, -w * 0.46, h * 0.46);
  ctx.closePath();
  ctx.fillStyle = hgrad(ctx, -w * 0.5, w * 0.3, h * 0.5,
    [[0, "#ffffff"], [0.42, "#f2f1ea"], [1, "#bcbcb4"]]);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = vgrad(ctx, 0, h * 0.2, h * 0.72,
    [[0, "rgba(255,255,255,.5)"], [0.5, "rgba(255,255,255,0)"], [1, "rgba(0,0,0,.18)"]]);
  ctx.fillRect(-w * 0.5, h * 0.2, w * 0.8, h * 0.55);
  ctx.restore();
  // 翅膀：一道弧 + 三根羽线，羽毛的层次靠这三根
  ovalPath(ctx, -w * 0.1, h * 0.5, w * 0.24, h * 0.13, -0.12);
  ctx.fillStyle = "rgba(196,194,184,.55)";
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(w * (-0.14 + i * 0.06), h * (0.56 - i * 0.04));
    ctx.quadraticCurveTo(w * (0.0 + i * 0.04), h * 0.6, w * (0.12 + i * 0.03), h * (0.52 - i * 0.03));
    ctx.strokeStyle = "rgba(150,148,140,.6)";
    ctx.lineWidth = w * 0.012;
    ctx.stroke();
  }
  // 脖子：两段管子接成 S 形，鹅的"长"和"弯"全在这一根上
  stick(ctx, w * 0.16, h * 0.58, w * 0.3, h * 0.84, w * 0.14, "#faf9f3");
  stick(ctx, w * 0.3, h * 0.84, w * 0.4, h * 0.96, w * 0.12, "#fbfaf5");
  ovalPath(ctx, w * 0.42, h * 0.98, w * 0.13, h * 0.075, 0.12);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  poly(ctx, [[w * 0.5, h * 0.955], [w * 0.68, h * 1.0], [w * 0.5, h * 1.01]], "#e8862a");
  poly(ctx, [[w * 0.5, h * 0.955], [w * 0.68, h * 1.0], [w * 0.5, h * 0.975]], "#f2a44a");
  eye(ctx, w * 0.42, h * 1.005, w * 0.019);
  // 头顶一点红：家鹅的标志
  poly(ctx, [[w * 0.38, h * 1.03], [w * 0.45, h * 1.02], [w * 0.4, h * 1.075]], "#c0392b");
  disc(ctx, w * 0.3, h * 0.86, w * 0.028, "rgba(0,0,0,.06)");
}

/** 品种 → 画法。和 `sim/critters.mjs` 的 `CRITTERS` 一一对应。 */
const DRAWERS = {
  cow: drawCow, sheep: drawSheep, deer: drawDeer,
  boar: drawBoar, dog: drawDog, goose: drawGoose,
};

export const hasCritterArt = kind => Object.hasOwn(DRAWERS, kind);

/**
 * 画一头畜生。参数和 `drawVehicle` 一致：`air` 是踹飞后的离地高度，`spin` 是转的角。
 * `dir < 0` 表示它朝左走——把头那一侧翻过去，否则整条路上所有动物都朝右。
 */
export function drawCritter(ctx, o) {
  const s = o.s;
  if (!(s > 0.03)) return;
  const painter = DRAWERS[o.kind];
  if (!painter) return;
  ctx.save();
  ctx.translate(o.cx, o.baseY - (o.air || 0) * s);
  if (o.spin) ctx.rotate(o.spin);
  ctx.scale(o.dir < 0 ? -s : s, -s);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (!o.air) {
    ctx.fillStyle = "rgba(0,0,0,.32)";
    ctx.beginPath();
    ctx.ellipse(0, 0.03, o.w * 0.5, 0.14, 0, 0, TAU);
    ctx.fill();
  }
  painter(ctx, o.w, o.h);
  ctx.restore();
}
