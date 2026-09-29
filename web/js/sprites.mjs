/**
 * 车手：一台车 + 一个人，从**后面**看过去。
 *
 * 1991～1996 那几代《暴力摩托》用的是"2D 画片 + 投影伪 3D 路面"，这条路今天依然
 * 是划算的：车手永远只有后视一个角度，所以不需要 3D 模型、不需要骨骼，需要的只是
 * **一张画得足够好的画片**。
 *
 * 这个文件现在只负责**编排**：谁先画、谁后画。画法本身拆到了几个兄弟模块里——
 *   `bike.mjs`      摩托车（它的 `RIDE` 是车与腿之间唯一的契约）
 *   `riderlegs.mjs` 腿与靴子
 *   `riderbody.mjs` 夹克、手臂、头盔
 *   `riderfx.mjs`   影子、出拳、举家伙、氮气
 *
 * 绘制次序不是随手排的，它决定了"人骑在车上"能不能成立：
 *   影子 → **腿** → 车 → 座垫影 → **靴子** → 上身 → 手臂 → 头盔 → 动作
 *
 * 腿在车**后面**、靴子在车**前面**，这不是笔误。从正后方看，尾罩和后胎离镜头
 * 最近，骑手坐在它们前面，所以大腿内侧天然被车身挡住，只有踩在脚踏上的脚探出来。
 * 反过来画（腿压在车上），腿就会变成两块挂着黑边的独立色块。
 *
 * 坐标：**米**，y 轴向上，原点在后轮接地点。调用方先 `translate(cx, baseY)`、
 * 再 `scale(s, -s)`，于是"头盔一米六高"就是"画到 y = 1.6"。
 */

import { PALETTES } from "../../sim/data.mjs";
import { drawBike } from "./bike.mjs";
import { bake, bakedCount, blit, clearBaked } from "./spritecache.mjs";
import { arms, helmet, torso } from "./riderbody.mjs";
import { groundShadow, idleWeapon, nitroFlame, seatShadow, swing } from "./riderfx.mjs";
import { boots, legs } from "./riderlegs.mjs";

export { bakedCount, clearBaked };

/**
 * 车手这半张画占多大：米空间里的包围盒。取自现画的实测值（`riderbounds` 探针），
 * 两边各留了一点余量——贴图是一块固定大小的画布，**画出框的部分会被切掉**，
 * 所以这道边宁可宽一点。影子的椭圆（±0.88）和头盔顶（1.776）是它的两端。
 */
const BOX = { x0: -0.94, x1: 0.94, y0: -0.22, y1: 1.84 };

/**
 * 烘图精度阶梯（像素/米）。取"屏幕上的像素/米"往上最近的这一级：宁可多烘两级，
 * 也不要让主角的车被放大成一坨。实测：900 像素高的窗口里，自己那台车在相机后
 * 8.6 米处，是 131 像素/米；整屏 1440 高时到 209。
 */
const LADDER = [17, 34, 68, 136, 224];
/** 同时最多烘多少张。到顶了就"这张不缓存、现画"——绝不中途清空（那会突然卡一下）。 */
const BAKE_LIMIT = 96;

const detailOf = s => (s < 12 ? 0 : s < 28 ? 1 : 2);

/** 这台车"不动的那半张画"的画法：影子 → 腿 → 车 → 座垫影 → 靴子 → 上身 → 手臂 → 头盔。 */
function paintStatic(ctx, p, detail, number, wobble) {
  groundShadow(ctx, detail);
  legs(ctx, p, detail);
  drawBike(ctx, { palette: p, detail, wobble });
  seatShadow(ctx);
  boots(ctx, detail);
  torso(ctx, p, detail, number);
  arms(ctx, p, detail);
  helmet(ctx, p, detail);
}

/**
 * 找（或烘）这台车的贴图。**姿势里的每一维都必须进 key**：配色、细节档、号牌，
 * 还有排气管的摆动（`wobble` 会挪排气口 2 厘米，分成"没摆"和"摆开"两档，
 * 中间那几档差不到 1 像素）。
 */
function spriteFor(p, paletteIndex, detail, number, s, wobble) {
  if (bakedCount() >= BAKE_LIMIT) return null;
  let ppm = LADDER[0];
  for (const step of LADDER) {
    ppm = step;
    if (step >= s) break;
  }
  const wag = wobble >= 0.5 ? 1 : 0;
  return bake(`rider|${paletteIndex}|${detail}|${number}|${ppm}|${wag}`, {
    ppm, box: BOX,
    paint: ctx => paintStatic(ctx, p, detail, number, wag),
  });
}

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
  const index = (o.palette | 0) & 7;
  const p = PALETTES[index] || PALETTES[0];
  // 距离决定细节层级：0 = 只看轮廓，1 = 有明暗，2 = 全套
  const detail = detailOf(s);
  const number = o.number === undefined ? (o.palette | 0) * 3 + 1 : o.number;
  const sway = o.wobble || 0;

  ctx.save();
  ctx.translate(o.cx, o.baseY);
  ctx.rotate((o.lean || 0) * 0.34);
  if (o.wreck > 0) ctx.rotate(-1.3 * Math.min(1, o.wreck / 0.5));

  // 不动的那半张画：能烘就烘（一张 drawImage），烘不出来就现画。
  const art = spriteFor(p, index, detail, number, s, sway);
  if (art) blit(ctx, s, art);
  else {
    ctx.scale(s, -s);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    paintStatic(ctx, p, detail, number, sway);
  }

  // 会动的那些：出拳、手里的家伙、氮气。它们本来就只在少数几帧出现，
  // 而且必须跟着状态走——留在现画这一边。
  if (o.swing > 0 || o.weapon || o.nitro) {
    ctx.scale(s, -s);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (o.swing > 0) swing(ctx, o.swing, p, o.swingBack, o.weapon);
    else if (o.weapon) idleWeapon(ctx, o.weapon);
    if (o.nitro) nitroFlame(ctx, o.flameSeed || 0);
  }
  ctx.restore();
}
