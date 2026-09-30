/**
 * 畜生的共用零件：腿、躯干、脖子、头、耳朵、尾巴。
 *
 * 为什么要把这几样单独拎出来：上一版的动物是"一个椭圆 + 四根竖着的方条 + 一个
 * 悬空的方块脑袋"，远看像一张盖了黑补丁的白桌子。问题不在某一头牛画得不好，
 * 而在于**每一头都用方块拼**——牛、鹿、猪、狗共用了同一套粗暴的画法，所以一起难看。
 *
 * 这一版换了三件共用的、按解剖来的零件：
 *   1. `legs`：**两段腿**（大腿 + 小腿），中间有膝，脚下有蹄。四足动物之所以像
 *      四足动物，一半靠腿的折线，另一半靠蹄；
 *   2. `barrel`：躯干用**贝塞尔轮廓**（背线略拱、腹线略垂、屁股收圆），
 *      而不是一个椭圆——椭圆是"球"，贝塞尔才有前胸和胯；
 *   3. `neckHead`：脖子是一根**从躯干里长出来**的锥形管，头挂在管子末端并且
 *      与管口重叠。上一版之所以像"用胶布贴上去的方块"，就是因为头和躯干之间
 *      有一个填不满的缝。
 *
 * 坐标系和 `props.mjs` 一致：米，y 向上，**接地点在原点**。所有尺寸都是
 * `(w, h)` 的比值，所以同一套零件能画 2.5 米的牛也能画 0.75 米的鹅。
 */

import { TAU } from "../../sim/constants.mjs";
import { fillRound, hgrad, shade, tube, vgrad } from "./art.mjs";

/**
 * 一条腿：**两段**。大腿从胯下伸到膝，小腿从膝到蹄，中间折一下。
 * `bend` 是膝往哪边拐：前腿的膝朝后（负），后腿的飞节朝前（正）。这个很小的
 * 折角是"像马像牛"和"像桌子腿"的分界线。
 */
export function leg(ctx, x, top, len, th, color, { bend = -0.12, far = false, hoof = "#3a332c" } = {}) {
  const ink = shade(color, far ? -0.42 : -0.16);
  const kneeY = len * 0.52;
  const kneeX = x + bend * len;
  tube(ctx, x, top, kneeX, kneeY, th, ink, { bright: far ? 0.16 : 0.5 });
  tube(ctx, kneeX, kneeY, x + bend * len * 0.7, len * 0.08, th * 0.82, ink,
    { bright: far ? 0.12 : 0.42 });
  // 蹄：压地那一小截，比小腿粗一点、颜色深一点。没有它，腿是"飘"在影子上的。
  fillRound(ctx, x + bend * len * 0.7 - th * 0.62, 0, th * 1.24, len * 0.13, th * 0.3,
    shade(hoof, far ? -0.16 : 0.06));
}

/**
 * 四条腿。`xs` 是四个落点（`w` 的比值），前两个算远侧、后两个算近侧——
 * 远侧先画、压暗，近侧后画、提亮，一眼就有前后两排。
 */
export function legs(ctx, w, h, color, { list, top = 0.6, len = 0.42, th = 0.075, hoof } = {}) {
  // 远侧先画、近侧后画：四条腿在一条侧视轮廓里也有前后，压暗的那两条就是"另一半"。
  for (const far of [true, false]) {
    for (const [x, isFar, bend] of list) {
      if (isFar !== far) continue;
      leg(ctx, w * x, h * top, h * len, w * th, color, { bend, far, hoof });
    }
  }
}

/**
 * 躯干：背线拱、腹线垂、前胸钝、胯圆。`y` 是背线的高度，`depth` 是躯干深浅，
 * `rear`/`front` 是屁股和前胸往回收的量（比值）。
 */
export function barrel(ctx, w, h, color, { x0 = -0.44, x1 = 0.3, y = 0.94, depth = 0.4,
  rear = 0.09, front = 0.07, hump = 0.03 } = {}) {
  const ax = w * x0, bx = w * x1;
  const top = h * y, bot = h * (y - depth);
  const g = hgrad(ctx, ax, bx, (top + bot) / 2, [
    [0, shade(color, 0.3)], [0.34, color], [0.74, shade(color, -0.24)], [1, shade(color, -0.46)],
  ]);
  ctx.beginPath();
  ctx.moveTo(ax + w * rear, bot + h * 0.02);
  ctx.bezierCurveTo(ax - w * 0.02, top - h * hump, ax + w * rear, top, ax + w * rear * 1.6, top);
  ctx.lineTo(bx - w * front, top);
  ctx.bezierCurveTo(bx + w * 0.05, top - h * 0.01, bx + w * 0.03, bot + h * 0.05, bx - w * front, bot + h * 0.03);
  ctx.bezierCurveTo(bx - w * 0.3, bot - h * 0.04, ax + w * 0.3, bot - h * 0.05, ax + w * rear, bot + h * 0.02);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  // 一道背光 + 一层肚影：没有这两笔，躯干是一块平色，像纸片。
  ctx.save();
  ctx.clip();
  ctx.fillStyle = vgrad(ctx, 0, bot, top, [
    [0, "rgba(0,0,0,.26)"], [0.42, "rgba(0,0,0,.04)"],
    [0.72, "rgba(255,255,255,.1)"], [1, "rgba(255,255,255,.2)"],
  ]);
  ctx.fillRect(ax - w * 0.1, bot - h * 0.05, (bx - ax) * 1.2, (top - bot) * 1.2);
  ctx.restore();
}

/**
 * 脖子 + 头：一根锥形管从躯干里长出来，末端接一张脸。
 * `face` 拿到的是"头心"和头的尺寸，负责画五官——每个品种的脸各写各的。
 */
export function neckHead(ctx, w, h, color, o) {
  const { from, to, th, headRx, headRy, face } = o;
  tube(ctx, w * from[0], h * from[1], w * to[0], h * to[1], th * w, color,
    { bright: 0.42, edge: w * 0.006 });
  ctx.save();
  ctx.translate(w * to[0], h * to[1]);
  ctx.beginPath();
  ctx.ellipse(0, 0, w * headRx, h * headRy, o.tilt || 0, 0, TAU);
  ctx.fillStyle = hgrad(ctx, -w * headRx, w * headRx, 0, [
    [0, shade(color, 0.34)], [0.5, color], [1, shade(color, -0.32)],
  ]);
  ctx.fill();
  face(ctx, w, h, o);
  ctx.restore();
}

/** 耳朵：一片斜着的、根部粗末端尖的叶子。`drop` 是往下垂多少。 */
export function ear(ctx, x, y, len, rot, color, { drop = 0.4 } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, len * 0.22, len, len * drop);
  ctx.quadraticCurveTo(len * 0.44, len * 0.06, 0, -len * 0.16);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** 眼睛：一颗深色的珠子 + 一点高光。畜生也要有眼神，否则是布偶。 */
export function eye(ctx, x, y, r, { glint = true } = {}) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = "#1b1712";
  ctx.fill();
  if (glint) {
    ctx.beginPath();
    ctx.arc(x + r * 0.34, y + r * 0.34, r * 0.32, 0, TAU);
    ctx.fillStyle = "rgba(255,255,255,.8)";
    ctx.fill();
  }
}

/** 尾巴：一根本管子 + 末端一撮毛（或一个球）。`up` 朝上翘，否则往下垂。 */
export function tail(ctx, w, h, color, { x = -0.48, y = 0.86, up = false, len = 0.3 } = {}) {
  const x0 = w * x, y0 = h * y;
  const x1 = x0 - w * 0.06;
  const y1 = y0 + h * (up ? len : -len);
  const x2 = x1 - w * (up ? 0.02 : 0.05);
  const y2 = y1 + h * (up ? len * 0.5 : -len * 0.55);
  tube(ctx, x0, y0, x1, y1, w * 0.035, shade(color, -0.12), { bright: 0.3 });
  tube(ctx, x1, y1, x2, y2, w * 0.028, shade(color, -0.24), { bright: 0.24 });
  ctx.beginPath();
  ctx.ellipse(x2, y2, w * 0.045, h * 0.05, 0, 0, TAU);
  ctx.fillStyle = shade(color, up ? -0.34 : -0.44);
  ctx.fill();
}

/** 一块贴身的色斑（牛的斑、鹿的屁股）。`pts` 是比值坐标。 */
export function patch(ctx, w, h, pts, color) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** 圆的调用名短一点，画五官时读起来干净。 */
export const disc = (ctx, x, y, r, style) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = style;
  ctx.fill();
};

/** 一根细管子：鹿角、猪鬃、鹅翅上的羽毛都用它。 */
export const stick = (ctx, x0, y0, x1, y1, th, base) =>
  tube(ctx, x0, y0, x1, y1, th, base, { bright: 0.3 });

/** 椭圆路径（只建路径）。 */
export const ovalPath = (ctx, x, y, rx, ry, rot = 0) => {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
};
