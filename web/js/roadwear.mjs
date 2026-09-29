/**
 * 路面**被用旧了的痕迹**：轮胎压出来的暗线、除雪车堆的雪脊、砂砾带、松针。
 *
 * 为什么值得单独一层：`road.mjs` 画的是"一条几何意义上的路"——梯形、车道线、
 * 路缘石，每一片都一样平。八条路摆在一起时最刺眼的正是这一点：同一套几何，换个
 * 颜色就当成了另一条路。真实的路面**没有一处是均匀的**：车轮把柏油磨出两道更深的
 * 沟、雪被推到路边堆成一道脊、沙漠的沙从路肩往路面上爬、红杉林里落一层松针。
 * 加完它们，八条路才是八个地方。
 *
 * 这一层**每帧现画**（不是贴图）：它必须跟着路的弯曲和透视一起变形，而且每片往往
 * 只有几像素高——做成贴图只会糊。
 *
 * 一层一条：地面 id 对一段画法。加第九条路 = 在 `DETAIL` 里加一行。
 */

import { hash2 } from "../../sim/rng.mjs";
import { trapezoid } from "./art.mjs";

/**
 * 一对轮胎痕。`laneXs` 是每条车道的中心横坐标（米），两条痕在中心左右各 0.62 米。
 *
 * 颜色从配色表来：柏油路上的沟是磨得更黑，雪原上是被压出底下的深灰，沙漠里是
 * 被沙填得更黄。写死一个灰就不会有这种区别。
 */
export function tyreTracks(ctx, laneXs, g, color) {
  ctx.fillStyle = color;
  for (const lx of laneXs) {
    for (const off of [-0.62, 0.62]) {
      const x = lx + off;
      trapezoid(ctx, g.far.x + x * g.far.ppm, 0.17 * g.far.ppm, g.yF,
        g.near.x + x * g.near.ppm, 0.17 * g.near.ppm, g.yN);
    }
  }
}

/**
 * 路肩上的痕迹。`g` 是这一片的几何（见 `road.mjs` 的 `sliceGeom`）。
 *
 * 所有画法都只做两件事：**沿着路缘铺一条带子**（`band`）或者**按世界 z 撒一把
 * 碎屑**（`bits`）。碎屑的哈希必须吃 z 而不能吃"第几片"：吃片号的话纹路会跟着
 * 相机一起抖，那是穿帮。
 */
const DETAIL = {
  city: (ctx, g) => {
    puddle(ctx, g, "rgba(110,132,186,.2)");
    bits(ctx, g, "rgba(30,34,44,.5)", 3, 2.4);
  },
  neon: (ctx, g) => {
    // 下过雨的夜市：路肩的水洼直接映着招牌，是最亮的一处
    puddle(ctx, g, "rgba(196,120,226,.3)");
    puddle(ctx, g, "rgba(120,220,255,.18)");
  },
  open: (ctx, g) => {
    sandDrift(ctx, g, "rgba(146,120,72,.22)");
    bits(ctx, g, "rgba(92,104,60,.4)", 3, 3.2);
  },
  desert: (ctx, g) => {
    sandDrift(ctx, g, "rgba(158,124,68,.3)");
    bits(ctx, g, "rgba(120,96,58,.35)", 3, 3.6);
  },
  coast: (ctx, g) => {
    // 护栏底下得有东西：这一条碎石带就是它的立锥之地
    band(ctx, g, 0, 1.7, "rgba(96,92,84,.5)");
    bits(ctx, g, "rgba(150,146,138,.5)", 4, 1.7);
    puddle(ctx, g, "rgba(140,190,214,.18)");
  },
  forest: (ctx, g) => {
    band(ctx, g, 0, 1.2, "rgba(74,64,38,.32)");
    bits(ctx, g, "rgba(58,46,26,.5)", 4, 2.6);
  },
  snow: (ctx, g) => {
    // 除雪车推出来的那道雪墙住在 `fieldwear.mjs`（它比"路面上的一层痕"更厚、
    // 更高，属于路外面那一层）。这里只管落在**路缘石上**的几粒
    bits(ctx, g, "rgba(255,255,255,.8)", 3, 3.4);
  },
  works: (ctx, g) => {
    band(ctx, g, 0, 1.3, "rgba(70,68,62,.42)");
    bits(ctx, g, "rgba(38,38,36,.45)", 4, 2.2);
  },
};

export const hasWear = ground => Object.hasOwn(DETAIL, ground);

/**
 * **一边是海**的赛道：路肩之外多少米开始是水。
 *
 * 为什么写 15 米而不是"贴着路缘"：路边的道具（棕榈、礁石、护栏）最远摆到路面
 * 外 11.2 米、自身还有 1.7 米的宽度，所以 13 米以外才一定是空的。留出这段陆地，
 * 道具才不会被摆进海里——这是**不改赛道生成**就能让海出现的前提。
 */
export const SEA = {
  coast: {
    from: 12.5, wet: 9.5,
    deep: "rgba(22,58,94,.95)", shallow: "rgba(44,116,148,.95)",
    foam: "rgba(238,250,255,.75)", sand: "rgba(116,104,84,.6)",
  },
};

/** 这一片的海（有水的地图才有画法）。`W` 是画面宽度——水一直铺到屏幕边上。 */
export function seaBand(ctx, ground, g, W) {
  const cfg = SEA[ground];
  if (!cfg) return;
  const { far, near, yF, yN } = g;
  // 海在世界的 **+x 一侧**（和 `project` 一样：+x 就是画面右边）。写死一侧是有意的：
  // "哪边是海"是这条路的性格，不该每片都重算。
  const side = 1;
  // 一片里任意"沿横向 t、离路缘 m 米"处的屏幕坐标。t=0 是远处那条边。
  const xAt = (t, m) => {
    const s = far.ppm + (near.ppm - far.ppm) * t;
    return far.x + (near.x - far.x) * t + side * (far.hw + far.rumble + m * s);
  };
  const wedge = (m1, m2, color) => {
    if (xAt(1, m1) >= W && xAt(0, m1) >= W) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(xAt(0, m1), yF); ctx.lineTo(xAt(0, m2), yF);
    ctx.lineTo(xAt(1, m2), yN); ctx.lineTo(xAt(1, m1), yN);
    ctx.closePath();
    ctx.fill();
  };
  // 近处那几片的海**整个在画面右边之外**（ppm 一大，12.5 米就是一屏之外）。
  // 这种片必须整片跳过：岸边点在屏幕右边、远点在屏幕左边的话，多边形会横跨
  // 整个画面，把路面涂成一片水——上一版就是这么在海边公路中间画出一条斜带。
  if (xAt(1, cfg.from) >= W) return;
  // 湿沙：水线上来的那一圈，比干沙深
  band(ctx, { ...g, side }, cfg.wet, cfg.from, cfg.sand);
  // 浅滩：靠岸的一截水是青的，再往外才是深蓝
  wedge(cfg.from, cfg.from + 7, cfg.shallow);
  ctx.fillStyle = cfg.deep;
  ctx.beginPath();
  ctx.moveTo(xAt(0, cfg.from + 7), yF); ctx.lineTo(W, yF);
  ctx.lineTo(W, yN); ctx.lineTo(xAt(1, cfg.from + 7), yN);
  ctx.closePath();
  ctx.fill();
  // 浪线：岸边上一条白线，再往外三条越来越淡的涌浪
  wedge(cfg.from, cfg.from + 0.7, cfg.foam);
  const cell0 = Math.floor(g.z / 7);
  for (let i = 0; i < 3; i++) {
    const m = cfg.from + 2.5 + i * 3.5 + hash2(cell0, 47 + i) * 2.5;
    wedge(m, m + 0.4, `rgba(226,244,252,${(0.22 - i * 0.05).toFixed(2)})`);
  }
  // 反光：水里几粒亮点
  const cell = Math.floor(g.z / 3);
  ctx.fillStyle = "rgba(255,255,255,.3)";
  for (let i = 0; i < 2; i++) {
    const t = hash2(cell * 5 + i, 41);
    const m = cfg.from + 1 + hash2(cell * 5 + i, 43) * 14;
    const s = far.ppm + (near.ppm - far.ppm) * t;
    ctx.fillRect(xAt(t, m), yF + (yN - yF) * t, Math.max(1, s * 0.6), Math.max(1, s * 0.05));
  }
}

/** 这一片路肩上的痕迹。两侧都画——赛道本身没有"哪边是海"这回事。 */
export function shoulderDetail(ctx, ground, g) {
  const paint = DETAIL[ground] || DETAIL.city;
  for (const side of [1, -1]) paint(ctx, { ...g, side });
}

/**
 * 贴着路缘往外（`from` 到 `to` 米）的一条带子。负的米数就是**往路面上**爬。
 * 一条带子用四个点就够了：远处两条边、近处两条边。
 */
export function band(ctx, g, from, to, color) {
  const { far, near, yF, yN, side } = g;
  // 路缘外沿就是 0 米：`hw` 是路面半宽，`rumble` 是路缘石自己的半宽
  const at = (s, m) => s.x + side * (s.hw + s.rumble + m * s.ppm);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(at(far, from), yF); ctx.lineTo(at(far, to), yF);
  ctx.lineTo(at(near, to), yN); ctx.lineTo(at(near, from), yN);
  ctx.closePath();
  ctx.fill();
}

/** 路肩上的碎屑：砂砾、松针、炉渣。按 z 撒，所以车往前开时它们是**静止**的。 */
function bits(ctx, g, color, count, spread) {
  const { far, near, yF, yN, side } = g;
  const cell = Math.floor(g.z / 2.2);
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const m = 0.15 + hash2(cell * 7 + i, 13) * spread;
    const t = hash2(cell * 7 + i, 17);
    const y = yF + (yN - yF) * t;
    const s = far.ppm + (near.ppm - far.ppm) * t;
    const x = (far.x + (near.x - far.x) * t) + side * (far.hw + far.rumble + m * s);
    const r = Math.max(0.8, s * (0.05 + hash2(cell + i, 19) * 0.1));
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 积水：一段扁扁的水洼，隔几片才有一个。倒映天色的那一笔。 */
function puddle(ctx, g, color) {
  const cell = Math.floor(g.z / 6);
  if (hash2(cell, 23) < 0.55) return;
  const { far, near, yF, yN, side } = g;
  const m = 0.3 + hash2(cell, 29) * 2.6;
  const x = far.x + side * (far.hw + far.rumble + m * far.ppm);
  const x2 = near.x + side * (near.hw + near.rumble + m * near.ppm);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, yF);
  ctx.quadraticCurveTo((x + x2) / 2 + side * 6, (yF + yN) / 2, x2, yN);
  ctx.lineTo(x2 + side * 9, yN);
  ctx.quadraticCurveTo((x + x2) / 2 + side * 13, (yF + yN) / 2, x + side * 9, yF);
  ctx.closePath();
  ctx.fill();
}

/** 沙从路肩爬上路肩内侧：三条越来越淡的斜带。 */
function sandDrift(ctx, g, color) {
  const { far, near, yF, yN, side } = g;
  const cell = Math.floor(g.z / 5);
  if (hash2(cell, 31) < 0.45) return;
  for (let i = 0; i < 3; i++) {
    const to = -(0.15 + i * 0.34);
    const wob = (hash2(cell, 37 + i) - 0.5) * 0.5;
    const at = (s, m) => s.x + side * (s.hw + s.rumble + (m + wob) * s.ppm);
    ctx.fillStyle = i === 0 ? color : color.replace(/[\d.]+\)$/u, `${(0.5 - i * 0.1).toFixed(2)})`);
    ctx.beginPath();
    ctx.moveTo(at(far, 0), yF); ctx.lineTo(at(far, to), yF);
    ctx.lineTo(at(near, to), yN); ctx.lineTo(at(near, 0), yN);
    ctx.closePath();
    ctx.fill();
  }
}
