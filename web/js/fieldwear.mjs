/**
 * 路**再往外**的那一片地：干草、车辙、沙纹、被风吹出来的雪脊、落叶。
 *
 * 为什么要单独一层：`road.mjs` 把路肩之外整幅铺成一个颜色（`grounds.mjs` 的
 * `shoulder`），因为地形是一个面、不是一个盒子。问题是那块颜色**一整条路都不变**，
 * 于是路外十米到地平线之间是一片没有任何参照的空地——相机往前开，它纹丝不动，
 * 速度感立刻掉一半。八条路看来看去只有路面颜色不一样，也是这一层缺位的后果。
 *
 * 和 `roadwear.mjs` 的分工：那一层画的是**路面自己**被用旧的样子（轮胎沟、沥青上
 * 的砂），这一层画的是**路外面**长出来的东西。两个文件共用一条 `band()`：它们的
 * 坐标基准都是"路缘石外沿往外的米数"，谁也不该自己再推一遍透视。
 *
 * 一条路一段画法：地面 id 对一段画法。加第九条路 = 在 `FIELD` 里加一行。
 */

import { hash2 } from "../../sim/rng.mjs";
import { band } from "./roadwear.mjs";

/** 一片里"沿纵向 t、离路缘 m 米"处的屏幕位置与比例尺。 */
function at(g, t, m) {
  const { far, near, yF, yN, side } = g;
  const s = far.ppm + (near.ppm - far.ppm) * t;
  const edge = (far.hw + far.rumble) + ((near.hw + near.rumble) - (far.hw + far.rumble)) * t;
  return {
    x: far.x + (near.x - far.x) * t + side * (edge + m * s),
    y: yF + (yN - yF) * t, s,
  };
}

/**
 * 贴地的小块：一块被踩秃的土、一摊化的雪、一层落叶。
 *
 * 一次 `fill` 画完一片里所有的块——它们同色、同在脚下，分开画就是白白的几十次
 * 画布调用（这条路上的每一笔都要乘以两万多帧）。
 *
 * 压扁量**按透视算，不写死**：同样一块半米的斑，三米外看几乎是正圆，三十米外是
 * 一条横线。写死一个 0.32 的结果是近处那些斑浮在地上像圆片——而近处正是这层唯一
 * 看得清的地方。
 */
function patches(ctx, g, color, count, spread) {
  const cell = Math.floor(g.z / 4.5);
  // 纵向"米 → 像素"：这一片沿 z 有多少米、在屏幕上占多少像素
  const vertical = (g.yN - g.yF) / (g.dz || 1);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const p = at(g, hash2(cell * 9 + i, 97), 0.2 + hash2(cell * 9 + i, 89) * spread);
    const r = p.s * (0.28 + hash2(cell * 9 + i, 101) * 0.62);
    if (r < 1.1) continue;
    ctx.moveTo(p.x + r, p.y);
    ctx.ellipse(p.x, p.y, r, Math.min(r, r * vertical / p.s), 0, 0, Math.PI * 2);
  }
  ctx.fill();
}

/**
 * 立着的一丛：干草、灌木、蕨。**三条线成一丛**，全片的丛拼进一条路径，一次描边。
 *
 * 高度是给"米"的，乘上这一点的比例尺才是像素——所以远处的草会自己变小、最后
 * 消失，和路边那棵树遵守同一套透视。
 */
function tufts(ctx, g, color, count, spread, tall) {
  const cell = Math.floor(g.z / 3);
  if (hash2(cell, 61) < 0.22) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.min(2.2, Math.max(0.9, g.near.ppm * 0.012));
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const p = at(g, hash2(cell * 11 + i, 71), 0.25 + hash2(cell * 11 + i, 67) * spread);
    const h = tall * (0.55 + hash2(cell * 11 + i, 73) * 0.9) * p.s;
    if (h < 1.4) continue;
    for (let b = -1; b <= 1; b++) {
      ctx.moveTo(p.x + b * h * 0.14, p.y);
      ctx.lineTo(p.x + b * h * 0.4, p.y - h * (1 - Math.abs(b) * 0.34));
    }
  }
  ctx.stroke();
}

/**
 * 贴着地皮的短划：沙纹、被风吹出来的雪槽、碎石带。**横着走**，所以它和路面平行
 * 的车道线不会混在一起——路外的纹理一旦也顺着路走，那片地就成了一块有条纹的地毯。
 */
function streaks(ctx, g, color, count, spread) {
  const cell = Math.floor(g.z / 3.4);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.min(2.6, Math.max(0.9, g.near.ppm * 0.014));
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const m = 0.3 + hash2(cell * 7 + i, 83) * spread;
    const t0 = hash2(cell * 7 + i, 103) * 0.7;
    const a = at(g, t0, m), b = at(g, t0 + 0.16 + hash2(cell * 7 + i, 107) * 0.16,
      m + (hash2(cell * 7 + i, 109) - 0.5) * 1.6);
    if (a.s < 0.4) continue;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}

/** 有人从这儿把车开下过路肩：两道平行的车辙。隔几片才有一处。 */
function rut(ctx, g, color) {
  if (hash2(Math.floor(g.z / 7), 79) < 0.32) return;
  for (const m of [1.15, 2.75]) band(ctx, g, m, m + 0.42, color);
}

/**
 * 八条路各一段。**顺序就是画序**：先铺最宽最淡的一层，再往上叠窄而实的。
 * 反过来画的话，最外面那层会把里面压出来的东西盖掉。
 */
const FIELD = {
  // 城市环路：雨夜的排水沟。柏油路肩本身就是暗的，只在路缘外面压一道反光
  city: (ctx, g) => {
    band(ctx, g, 0, 0.9, "rgba(126,146,196,.16)");
    patches(ctx, g, "rgba(12,14,20,.22)", 4, 5);
  },
  // 霓虹夜市：招牌倒映进路肩的水里，是这一条路最亮的一处路外
  neon: (ctx, g) => {
    band(ctx, g, 0, 1.3, "rgba(154,96,204,.2)");
    band(ctx, g, 1.3, 3.4, "rgba(96,196,236,.12)");
    patches(ctx, g, "rgba(20,18,32,.24)", 4, 5);
  },
  // 海崖公路：碎石带外面是一层海边特有的矮草，再往外才是沙
  coast: (ctx, g) => {
    band(ctx, g, 1.7, 4.6, "rgba(126,118,92,.22)");
    tufts(ctx, g, "rgba(122,130,86,.5)", 4, 5, 0.34);
    patches(ctx, g, "rgba(150,140,118,.26)", 5, 6);
  },
  // 荒野公路：土路肩往外先是两道旧车辙，再是干草、碎石与裸土
  open: (ctx, g) => {
    band(ctx, g, 0, 1.6, "rgba(124,110,74,.3)");
    rut(ctx, g, "rgba(94,82,56,.3)");
    tufts(ctx, g, "rgba(140,134,74,.58)", 5, 3.8, 0.42);
    streaks(ctx, g, "rgba(142,128,90,.34)", 3, 5);
    patches(ctx, g, "rgba(98,88,60,.24)", 5, 6);
  },
  // 沙漠干道：风把沙推成一道一道，灌木稀稀拉拉
  desert: (ctx, g) => {
    band(ctx, g, 0, 2.2, "rgba(206,172,112,.3)");
    streaks(ctx, g, "rgba(178,146,96,.4)", 5, 8);
    tufts(ctx, g, "rgba(120,108,74,.42)", 3, 7, 0.3);
    patches(ctx, g, "rgba(152,124,84,.22)", 6, 8);
  },
  // 红杉林道：路肩外面压着厚厚一层落叶，蕨和矮树从落叶里钻出来
  forest: (ctx, g) => {
    band(ctx, g, 1.2, 3.4, "rgba(64,54,30,.24)");
    patches(ctx, g, "rgba(84,70,40,.3)", 5, 5);
    tufts(ctx, g, "rgba(74,88,52,.5)", 4, 4, 0.46);
    streaks(ctx, g, "rgba(58,46,26,.32)", 3, 5);
  },
  // 雪原山口：除雪车把雪推到路边堆成一道墙，风又把墙顶削出一道道槽
  snow: (ctx, g) => {
    // 三段才成"墙"：贴路缘那道背光的切面 → 亮得发白的墙顶 → 墙外侧的蓝影。
    // 少任何一段，它就只是地上一条颜色略微不同的带子。
    band(ctx, g, 0, 0.5, "rgba(104,120,150,.55)");
    band(ctx, g, 0.5, 2.3, "rgba(255,255,255,.85)");
    band(ctx, g, 2.3, 4.4, "rgba(146,168,200,.34)");
    streaks(ctx, g, "rgba(255,255,255,.45)", 3, 8);
    patches(ctx, g, "rgba(150,168,196,.26)", 5, 8);
  },
  // 工业支线：水泥场坪一路铺到围墙根，边上是炉渣和积水
  works: (ctx, g) => {
    band(ctx, g, 0, 3.2, "rgba(126,124,116,.26)");
    streaks(ctx, g, "rgba(46,46,44,.26)", 3, 4);
    patches(ctx, g, "rgba(40,42,42,.26)", 5, 5);
  },
};

export const hasField = ground => Object.hasOwn(FIELD, ground);

/**
 * 这一片路肩之外的地。两侧都画——和痕迹一样，赛道本身没有"哪边是海"这回事。
 *
 * 全在 `road.mjs` 的 `tall`（这一片高过两像素）分支里调用：远处的几片连一个像素
 * 都占不满，画了也白画，却要照样发几十次画布调用。
 */
export function fieldDetail(ctx, ground, g) {
  const paint = FIELD[ground] || FIELD.city;
  for (const side of [1, -1]) paint(ctx, { ...g, side });
}
