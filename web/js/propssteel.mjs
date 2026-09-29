/**
 * 路边**立起来的钢架子**：风车、水塔、井架。
 *
 * 从 `propsbuild.mjs` 里分出来，理由不是行数，是**画法**：那一半（报刊亭、谷仓、
 * 灯塔）是"一个体块 + 一层表皮"，画起来是一块一块的板子；这一半是**格构**——
 * 四条腿、一堆斜撑、几个平台，难点全在"几根杆子怎么才不看着像透明的脚手架"。
 *
 * 这一组又比别的道具更值得下功夫：它们都是十三米上下的高个子，开到跟前会**从画面
 * 上边切出去**，于是玩家看到的永远是它中段那一片斜撑——画得糊，那就是一坨铁丝。
 *
 * 好在代价是零：道具贴图一辈子只画一次（`props.mjs` 的 `propImage`），所以这里
 * 可以一段一段地抠明暗，不用像逐帧画的东西那样数笔画。
 *
 * 坐标系：米，y 向上，原点在接地点。
 */

import { TAU } from "../../sim/constants.mjs";
import { hash2 } from "../../sim/rng.mjs";
import { hgrad, poly, shade } from "./art.mjs";
import { bulb, concreteFace, rustPatch } from "./parts.mjs";

/**
 * 一根格构杆：从 (x0, y0) 到 (x1, y1)，宽度从 w0 收到 w1。
 *
 * **必须画成实心的带子而不是一条线**：一条三像素的线压在天空上就是根铁丝；
 * 上窄下宽、左边亮右边暗的一块，才是一根钢。四根腿里只要有一根是实心的，
 * 整座塔就从"透明脚手架"变成了"立着的东西"。
 */
function strut(ctx, x0, w0, y0, x1, w1, y1, color) {
  ctx.fillStyle = hgrad(ctx, Math.min(x0, x1) - w0, Math.max(x0, x1) + w0, (y0 + y1) / 2, [
    [0, shade(color, 0.34)], [0.42, color], [1, shade(color, -0.44)],
  ]);
  poly(ctx, [
    [x0 - w0 / 2, y0], [x0 + w0 / 2, y0], [x1 + w1 / 2, y1], [x1 - w1 / 2, y1],
  ], ctx.fillStyle);
}

/**
 * 一座格构塔的骨架：背面两条腿、一层层斜撑、正面两条腿、平台。
 * 三个高架子共用它——它们本来就是同一种工艺，只是顶上放的东西不一样。
 *
 * `taper` 是塔顶相对塔底的收窄比例。返回塔顶的实际半宽，调用方接着往上放东西。
 */
function lattice(ctx, w, h, t, { taper = 0.17, bays = 8, platforms = [0.34, 0.66] } = {}) {
  const half = w * 0.44, top = w * taper * 0.5;
  // 背面两条腿：往里收、压暗一档。它们在正面那两条的后面，塔于是有了纵深
  for (const side of [-1, 1]) {
    strut(ctx, side * half * 0.58, w * 0.038, 0, side * top * 0.55, w * 0.024, h,
      shade(t.steel, -0.42));
  }
  // 一层层斜撑。压在**正面之前**画：正面那两条腿是塔最外面的一层
  for (let i = 0; i < bays; i++) {
    const f0 = i / bays, f1 = (i + 1) / bays;
    const x0 = half + (top - half) * f0, x1 = half + (top - half) * f1;
    ctx.strokeStyle = shade(t.steel, -0.06);
    ctx.lineWidth = w * 0.022;
    ctx.beginPath();
    ctx.moveTo(-x0, h * f0);
    ctx.lineTo(x1, h * f1);
    ctx.moveTo(x0, h * f0);
    ctx.lineTo(-x1, h * f1);
    ctx.stroke();
    // 每层一道横箍：只有斜撑的塔看着像自行车架
    ctx.lineWidth = w * 0.016;
    ctx.strokeStyle = shade(t.steel, -0.3);
    ctx.beginPath();
    ctx.moveTo(-x1, h * f1);
    ctx.lineTo(x1, h * f1);
    ctx.stroke();
  }
  // 正面两条腿最后画：它们挡着所有的斜撑
  for (const side of [-1, 1]) {
    strut(ctx, side * half, w * 0.062, 0, side * top, w * 0.04, h, t.steel);
  }
  for (const f of platforms) {
    const x = half + (top - half) * f;
    ctx.fillStyle = "rgba(6,9,16,.5)";
    ctx.fillRect(-x, h * f, x * 2, 0.06);
    ctx.fillStyle = shade(t.steel, -0.24);
    ctx.fillRect(-x, h * f + 0.06, x * 2, 0.035);
    // 栏杆：平台上有人的那根横杆
    ctx.fillStyle = shade(t.steel, 0.1);
    ctx.fillRect(-x, h * f + h * 0.055, x * 2, 0.028);
  }
  return top;
}

/** 风车：格构塔 + 多叶扇 + 尾舵。荒野上转着的那一台。 */
export function windmill(ctx, w, h, t, seed) {
  const top = lattice(ctx, w, h * 0.72, t, { taper: 0.28, bays: 4, platforms: [] });
  ctx.fillStyle = shade(t.steel, 0.16);
  ctx.fillRect(-top * 1.4, h * 0.68, top * 2.8, h * 0.07);
  // 扇叶：十二片，围着轮毂转
  const cx = 0, cy = h * 0.76, r = w * 0.42;
  ctx.fillStyle = "rgba(228,222,206,.9)";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + hash2(seed, 1);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.fillRect(r * 0.22, -r * 0.09, r * 0.74, r * 0.18);
    ctx.restore();
  }
  // 轮毂与尾舵
  ctx.fillStyle = "#3a4049";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.14, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#2f353d";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.07, 0, TAU);
  ctx.fill();
  ctx.fillStyle = shade(t.steel, 0.1);
  poly(ctx, [[cx, cy + 0.06], [cx + w * 0.5, cy + h * 0.1], [cx + w * 0.5, cy - 0.04]],
    shade(t.steel, 0.1));
}

/** 水塔：四条腿的架子 + 一个大罐 + 梯子 + 落水管。沙漠和荒野上的地标。 */
export function watertower(ctx, w, h, t, seed) {
  const ly = h * 0.42;
  lattice(ctx, w, ly, t, { taper: 0.44, bays: 5, platforms: [0.5] });
  ctx.fillStyle = "rgba(6,9,16,.36)";
  ctx.fillRect(-w * 0.44, 0, w * 0.88, 0.06);
  // 罐体：五档明暗，左亮右暗
  ctx.fillStyle = hgrad(ctx, -w / 2, w / 2, ly + h * 0.24, [
    [0, shade(t.steel, 0.34)], [0.3, t.steel], [0.72, shade(t.steel, -0.28)],
    [1, shade(t.steel, -0.52)],
  ]);
  ctx.fillRect(-w * 0.48, ly, w * 0.96, h * 0.4);
  ctx.fillStyle = "#8a6a3a";
  for (const f of [0.34, 0.66]) ctx.fillRect(-w * 0.48, ly + h * 0.4 * f, w * 0.96, 0.04);
  ctx.fillStyle = shade(t.steel, -0.16);
  ctx.beginPath();
  ctx.ellipse(0, ly + h * 0.4, w * 0.48, h * 0.06, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = shade(t.steel, 0.2);
  ctx.beginPath();
  ctx.ellipse(0, ly + h * 0.4, w * 0.48, h * 0.055, 0, Math.PI, TAU);
  ctx.fill();
  rustPatch(ctx, -w * 0.48, ly, w, h * 0.4, seed, 0.8);
  // 梯子：一直爬到罐顶
  ctx.fillStyle = "#5c6572";
  for (let i = 0; i < 7; i++) ctx.fillRect(w * 0.24 - w * 0.04, ly * i / 7, w * 0.08, 0.03);
  ctx.fillRect(w * 0.22, 0, 0.035, ly + h * 0.4);
  ctx.fillRect(w * 0.3, 0, 0.035, ly + h * 0.4);
  // 落水管：一根管子贴着右边的腿下来。水塔上最不起眼、最像"真东西"的一笔
  ctx.fillStyle = shade(t.steel, -0.34);
  ctx.fillRect(w * 0.4, 0, w * 0.05, ly);
}

/**
 * 井架：四腿格构塔 + 天车 + 两层平台 + 井口。荒野与沙漠上"这里在抽油"。
 *
 * 上一版是几条线描出来的骨架：开到跟前就是几根透明的脚手架管子，塔顶还齐头切在
 * 画面上边。这一版按"一座真的井架"配齐：脚下一块水泥场坪与井口、塔身四腿分明、
 * 塔顶一个天车（滑轮组），还有**一根大钩从塔顶垂到井口**——最后这一笔是井架最
 * 认得出的地方，一根竖在塔心、微微晃着的大钢索。
 */
export function derrick(ctx, w, h, t, seed) {
  concreteFace(ctx, -w * 0.56, 0, w * 1.12, h * 0.045, t.conc, seed);
  // 井口：法兰一圈 + 立起来的防喷器。塔底下得有东西，不然塔立在空地上
  ctx.fillStyle = shade(t.steel, -0.2);
  ctx.fillRect(-w * 0.2, h * 0.045, w * 0.4, h * 0.05);
  ctx.fillStyle = shade(t.steel, 0.12);
  ctx.fillRect(-w * 0.14, h * 0.09, w * 0.28, h * 0.06);
  ctx.fillStyle = "#b8532c";
  ctx.fillRect(-w * 0.18, h * 0.146, w * 0.36, h * 0.022);
  const top = lattice(ctx, w, h, t, { taper: 0.17, bays: 8, platforms: [0.3, 0.62] });
  // 大钩：从塔顶一直垂到井口。钢索比斜撑细一档，免得抢了塔身的骨架
  ctx.strokeStyle = "rgba(30,34,42,.72)";
  ctx.lineWidth = 0.028;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.98);
  ctx.lineTo(0, h * 0.2);
  ctx.stroke();
  ctx.fillStyle = shade(t.steel, -0.3);
  ctx.fillRect(-w * 0.045, h * 0.2, w * 0.09, h * 0.075);
  ctx.fillStyle = shade(t.steel, 0.16);
  ctx.fillRect(-w * 0.03, h * 0.175, w * 0.06, h * 0.028);
  // 天车：塔顶那一组滑轮。顶上没有它，塔就是一根烟囱
  ctx.fillStyle = "#c8a03c";
  ctx.fillRect(-top * 1.5, h, top * 3, h * 0.055);
  ctx.fillStyle = "#8a6f22";
  ctx.fillRect(-top * 1.5, h + h * 0.055, top * 3, h * 0.014);
  for (const side of [-1, 1]) {
    ctx.fillStyle = shade(t.steel, -0.16);
    ctx.beginPath();
    ctx.arc(side * top * 0.7, h + h * 0.075, 0.09, 0, TAU);
    ctx.fill();
  }
  rustPatch(ctx, -w * 0.44, 0, w * 0.88, h, seed + 5, 0.5);
  bulb(ctx, 0, h * 1.12, 0.06, t.accent, true, 1.1);
}
