/**
 * 路上的车：同向的慢车（用来超、顺便踹）、对向来车（用来躲、也用来踹），
 * 以及那一辆**大运**。
 *
 * 车流是这个世界里"不属于任何玩家"的东西——同一间房里所有人看到的是同一批车。
 * 所以它们的画法必须一眼能读出三件事：**多大、朝哪、要不要躲**。
 * 尺寸取 `sim/traffic.mjs` 里那份碰撞表，画出来的宽度就是判定的宽度：
 * 玩家撞上时不会觉得"明明还有空隙"。这比画面好看重要。
 *
 * 这个文件只管**分发**——哪台车交给哪一位画。真正画画的手艺在三个兄弟文件里：
 *   - `vehiclelight.mjs` 轿车 / 皮卡 / 警车 / 三轮车 / 拖拉机；
 *   - `vehicleheavy.mjs` 厢货 / 重卡 / 公交 / 半挂；
 *   - `vehicletank.mjs` 油罐车 / 搅拌车（背上驮着东西的那两辆）；
 *   - `vehicledayun.mjs` 大运（它一个人值得一间房）。
 * 零件（轮胎、车牌、灯、被踹瘪的那一套）在 `vehicleparts.mjs`，
 * 玻璃后面的人、车底的泥、挡泥板这些"小东西"在 `vehiclechrome.mjs`。
 *
 * 上一版是"一个文件里塞五台车"，加第六台的时候就得在四百行里翻轮胎画在哪。
 */

import { TAU } from "../../sim/constants.mjs";
import { VEHICLES } from "../../sim/traffic.mjs";
import { drawBox, drawBus, drawContainer } from "./vehicleheavy.mjs";
import { drawMixer, drawTanker } from "./vehicletank.mjs";
import {
  drawCar, drawPickup, drawPolice, drawTractor, drawTrike,
} from "./vehiclelight.mjs";
import { HEIGHT, paintOf } from "./vehicleparts.mjs";
import { drawDayun } from "./vehicledayun.mjs";

export { HEIGHT, HEAD_LAMP, PAINT, TAIL_LAMP, paintOf } from "./vehicleparts.mjs";

/**
 * 每一台车画给谁。**用表而不是一串 if/else**：加一种车 = 加一行；
 * 忘掉写分支的症状是"路上跑着一台轿车形状的公交车"，那种事不该靠肉眼发现。
 */
const DRAWERS = {
  car: drawCar,
  oncom: drawCar,
  police: drawPolice,
  pickup: drawPickup,
  trike: drawTrike,
  tractor: drawTractor,
  van: (ctx, w, h, paint, dir, dmg) => drawBox(ctx, w, h, paint, dir, dmg, false),
  truck: (ctx, w, h, paint, dir, dmg) => drawBox(ctx, w, h, paint, dir, dmg, true),
  bus: drawBus,
  container: drawContainer,
  tanker: drawTanker,
  mixer: drawMixer,
  // 大运的画法签名是 `(ctx, w, h, dmg)`——它自己不需要车漆（全场唯一一台橙车）
  // 也不需要朝向（它永远迎面）。用一层薄壳把参数对齐，而不是让画法去迁就表。
  dayun: (ctx, w, h, paint, dir, dmg) => drawDayun(ctx, w, h, dmg),
};

/** 供测试与工具用：这台车有没有自己的画法。 */
export const hasArt = kind => Object.hasOwn(DRAWERS, kind);

/**
 * 画一辆车。`dir` 是它的行驶方向：**+1 = 和我们同向（看到的是车尾）**，
 * -1 = 迎面（看到的是车头）。`air` 是被踹飞后的离地高度（米），`dmg` 是它瘪了多少。
 */
export function drawVehicle(ctx, o) {
  const s = o.s;
  if (!(s > 0.04)) return;
  const info = VEHICLES[o.kind] || VEHICLES.car;
  const h = HEIGHT[o.kind] || 1.5;
  const w = info.wid;
  const dmg = Math.min(1, Math.max(0, o.dmg || 0));
  ctx.save();
  ctx.translate(o.cx, o.baseY - (o.air || 0) * s);
  if (o.spin) ctx.rotate(o.spin);
  ctx.scale(s, -s);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (!o.air) {
    // 影子跟着伤变淡：一台被踹飞、还在着火的半挂，地上的影子不该还是扎实的一团。
    ctx.fillStyle = `rgba(0,0,0,${(0.34 - dmg * 0.16).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(0, 0.04, w * 0.62, 0.24, 0, 0, TAU);
    ctx.fill();
  }
  const painter = DRAWERS[o.kind] || drawCar;
  // **被踹瘪 = 被压扁**：车身整体矮一截、宽一点。
  //
  // 这一笔不画任何东西，只是把"挨过一脚"换算成一个缩放——所以崭新的车一个像素
  // 都不变，而瘪到底的那台明显是"塌"下去的。褶皱和撕口（`damagePass`）说明的是
  // "金属被挤过"，这一下说明的是**整车被砸扁**，两件事叠起来才像一脚踹瘪的。
  // 比例是试出来的：0.16 只是"矮了一点"，看不出被砸；0.3 才是"整台车塌下去"，
  // 而横向 +0.12 让它在塌的同时往外摊——金属被挤过的样子。
  if (dmg > 0.02) ctx.scale(1 + dmg * 0.12, 1 - dmg * 0.3);
  painter(ctx, w, h, paintOf(o.id), o.dir, dmg);
  ctx.restore();
}
