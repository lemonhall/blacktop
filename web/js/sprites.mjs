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
import { arms, helmet, torso } from "./riderbody.mjs";
import { groundShadow, idleWeapon, nitroFlame, seatShadow, swing } from "./riderfx.mjs";
import { boots, legs } from "./riderlegs.mjs";

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
  legs(ctx, p, detail);
  drawBike(ctx, { palette: p, detail, wobble: o.wobble || 0 });
  seatShadow(ctx);
  boots(ctx, detail);
  torso(ctx, p, detail, number);
  arms(ctx, p, detail);
  helmet(ctx, p, detail);
  if (o.swing > 0) swing(ctx, o.swing, p, o.swingBack, o.weapon);
  else if (o.weapon) idleWeapon(ctx, o.weapon);
  if (o.nitro) nitroFlame(ctx, o.flameSeed || 0);
  ctx.restore();
}
