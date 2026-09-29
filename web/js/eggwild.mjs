/**
 * **荒原上的两件彩蛋**：沙漠干道的牛头骨、雪原山口的雪人。
 *
 * 它们出现得很少——几十件道具里偶尔混进去一件（权重在 `sim/maps.mjs` 的 `EGG`）。
 * 为什么值得单独一层：路边的树、路灯、护栏是"布景"，职责是让人相信这条路存在；
 * 彩蛋的职责是另一件事——**让人认出来**。一堆一模一样的水塔看多了会腻，而沙漠里
 * 插着一颗带犄角的牛头骨、雪地里站着一个扣着铁桶的雪人，是会被截图的那种东西。
 *
 * 规矩只有一条：**它必须先是一个合理的路边物件，再是一个玩笑**。牛头骨得真像牛头骨、
 * 雪人得真像雪人，不然后面那个玩笑没人接得住。所以这两件都画得比正牌道具还费事。
 *
 * 木头的两件（搁浅的破船、图腾柱）在 `eggwood.mjs`，人烟那四件在 `eggurban.mjs`
 * 与 `eggyard.mjs`；共用零件在 `eggart.mjs`。
 *
 * 坐标系：米，y 向上，原点在接地点（和 `props.mjs` 一样）。
 */

import { TAU } from "../../sim/constants.mjs";
import { hash2 } from "../../sim/rng.mjs";
import { hgrad, poly, shade, tube } from "./art.mjs";
import { snowCap } from "./parts.mjs";
import { boneGrad, cracked, drift, ropeWrap, shadow, snowball, timber } from "./eggart.mjs";

/**
 * 牛头骨：立着的旧木桩，桩上捆着一颗带犄角的牛头骨，绳子断头垂下来。
 * 沙漠干道上的正字标记——"这里离人烟还有很远"。
 */
export function skull(ctx, w, h, t, seed) {
  shadow(ctx, 0, 0.05, w * 0.42, h * 0.03, 0.9);
  timber(ctx, 0, w * 0.14, h * 0.62, t.wood, seed);

  // ---- 头骨 ----
  const cran = w * 0.215, topY = h * 0.945;
  const skullPath = () => {
    ctx.beginPath();
    ctx.moveTo(-cran, h * 0.815);
    ctx.quadraticCurveTo(-cran * 1.04, topY, 0, topY);
    ctx.quadraticCurveTo(cran * 1.04, topY, cran, h * 0.815);
    ctx.quadraticCurveTo(cran * 0.88, h * 0.70, w * 0.10, h * 0.635);
    ctx.lineTo(-w * 0.10, h * 0.635);
    ctx.quadraticCurveTo(-cran * 0.88, h * 0.70, -cran, h * 0.815);
    ctx.closePath();
  };
  skullPath();
  ctx.fillStyle = boneGrad(ctx, -cran, cran, h * 0.8);
  ctx.fill();
  // 右半边压暗：骨头本身是圆的，只靠一个渐变会显得像纸片
  ctx.save();
  skullPath();
  ctx.clip();
  ctx.fillStyle = hgrad(ctx, -cran * 0.2, cran * 1.1, h * 0.8, [
    [0, "rgba(90,78,58,0)"], [1, "rgba(74,62,44,.42)"],
  ]);
  ctx.fillRect(-cran * 1.2, h * 0.6, cran * 2.4, h * 0.4);
  // 颧骨那一道亮：光从左上下来，额头到颧骨之间一定有一条分界
  ctx.fillStyle = "rgba(255,252,238,.5)";
  ctx.fillRect(-cran * 0.9, h * 0.865, cran * 0.62, h * 0.055);
  ctx.restore();

  // 眼窝：空的，深到发黑，边缘有一圈薄薄的亮（骨头的厚度）
  for (const s of [-1, 1]) {
    const ex = s * w * 0.108, ey = h * 0.80;
    ctx.fillStyle = "rgba(255,250,235,.42)";
    ctx.beginPath();
    ctx.ellipse(ex - w * 0.012, ey + h * 0.008, w * 0.086, h * 0.046, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#241f19";
    ctx.beginPath();
    ctx.ellipse(ex, ey, w * 0.075, h * 0.039, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#0d0b08";
    ctx.beginPath();
    ctx.ellipse(ex - w * 0.008, ey - h * 0.004, w * 0.05, h * 0.026, 0, 0, TAU);
    ctx.fill();
  }
  // 眉骨：一道含糊的暗影横在两只眼窝上方
  ctx.fillStyle = "rgba(96,84,66,.34)";
  ctx.fillRect(-w * 0.19, h * 0.845, w * 0.38, h * 0.014);
  // 鼻腔与牙床
  poly(ctx, [[-w * 0.035, h * 0.735], [w * 0.035, h * 0.735], [0, h * 0.695]], "#2a241c");
  ctx.fillStyle = "#8d8371";
  ctx.fillRect(-w * 0.095, h * 0.645, w * 0.19, h * 0.012);
  ctx.fillStyle = "#efe9d8";
  for (let i = 0; i < 6; i++) ctx.fillRect(-w * 0.086 + i * w * 0.029, h * 0.652, w * 0.019, h * 0.015);
  // 骨头上的裂纹与泥渍
  cracked(ctx, 0, h * 0.86, w * 0.6, seed, "rgba(60,50,36,.45)", 1);
  ctx.fillStyle = "rgba(96,74,42,.3)";
  ctx.beginPath();
  ctx.ellipse(-w * 0.03, h * 0.665, w * 0.13, h * 0.03, 0, 0, TAU);
  ctx.fill();

  // ---- 犄角：三段管，越往外越细，尖端稍微往上挑 ----
  for (const s of [-1, 1]) {
    const seg = [
      [s * w * 0.17, h * 0.845, s * w * 0.315, h * 0.895, 0.085, 0.062],
      [s * w * 0.315, h * 0.895, s * w * 0.435, h * 0.965, 0.062, 0.042],
      [s * w * 0.435, h * 0.965, s * w * 0.495, h * 1.015, 0.042, 0.02],
    ];
    // 角根那一圈：骨与角交界的地方总要粗一点、脏一点
    ctx.fillStyle = "#b3a78d";
    ctx.beginPath();
    ctx.arc(s * w * 0.175, h * 0.848, w * 0.055, 0, TAU);
    ctx.fill();
    for (const [x0, y0, x1, y1, th0, th1] of seg) {
      tube(ctx, x0, y0, x1, y1, (th0 + th1) * 0.5 * w, "#cfc4ac", { bright: 0.5, edge: 0.012 });
    }
    ctx.fillStyle = "#8d8471";
    ctx.beginPath();
    ctx.arc(s * w * 0.495, h * 1.015, w * 0.018, 0, TAU);
    ctx.fill();
  }

  // ---- 桩上的捆绳：两道，中间还塞着几根枯草 ----
  ropeWrap(ctx, 0, h * 0.545, w * 0.30, h * 0.034, seed);
  ropeWrap(ctx, 0, h * 0.455, w * 0.28, h * 0.03, seed + 3);
  ctx.strokeStyle = "rgba(190,168,110,.75)";
  ctx.lineWidth = 0.014;
  for (let i = 0; i < 4; i++) {
    const gx = -w * 0.1 + i * w * 0.07;
    ctx.beginPath();
    ctx.moveTo(gx, h * 0.5);
    ctx.quadraticCurveTo(gx - w * 0.05, h * 0.56, gx - w * 0.14, h * 0.6);
    ctx.stroke();
  }
}

/**
 * 雪人：雪原山口上站着的那个。铁桶当帽子、胡萝卜当鼻子、树枝当手，
 * 脖子上一条红围巾，左边树枝上还落了只小鸟。
 */
export function snowman(ctx, w, h, t, seed) {
  // 一堆新雪：先从地上堆起来一层，再往上摞三个球
  // 影子的半径要**连外圈一起**收在贴图框里：`shadow()` 的外圈比传进来的半径大
  // 1.28 倍，所以这里给的是 0.4w——再宽一点，地影就会被切出一条直边。
  shadow(ctx, 0, 0.05, w * 0.4, h * 0.04, 0.7);
  drift(ctx, 0, 0, w * 1.0, h * 0.075, "#fbfdff", "#c3d0e0", seed);
  const body = h * 0.226, mid = h * 0.157, head = h * 0.118;
  snowball(ctx, 0, h * 0.27, body, seed);
  snowball(ctx, 0, h * 0.575, mid, seed + 2);
  snowball(ctx, 0, h * 0.808, head, seed + 4);
  // 两球之间压一道影：不然三个球是"飘"在一起的
  for (const [r, y] of [[mid, h * 0.545], [head, h * 0.79]]) {
    ctx.fillStyle = "rgba(148,168,196,.32)";
    ctx.beginPath();
    ctx.ellipse(0, y, r * 0.86, r * 0.16, 0, 0, TAU);
    ctx.fill();
  }

  // ---- 树枝手：主枝 + 两根指头，左手上再落一只小鸟 ----
  const twig = "#4e3a26";
  for (const s of [-1, 1]) {
    const hx = s * w * 0.145, hy = h * 0.625;
    const tx = s * w * 0.485, ty = s * (s < 0 ? 0.755 : 0.70);
    tube(ctx, hx, hy, tx, ty, w * 0.026, twig, { bright: 0.34 });
    for (const f of [0.28, 0.62]) {
      const bx = hx + (tx - hx) * f, by = hy + (ty - hy) * f;
      tube(ctx, bx, by, bx + s * w * 0.075, by + w * (0.026 - f * 0.03), w * 0.014, twig, { bright: 0.3 });
    }
  }
  // 小鸟：侧身、红胸、黑背，站在左边那根枝梢上
  const bx = -w * 0.44, by = h * 0.745;
  ctx.fillStyle = "#2b3037";
  ctx.beginPath();
  ctx.ellipse(bx, by, w * 0.052, w * 0.036, -0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#c0413a";
  ctx.beginPath();
  ctx.ellipse(bx + w * 0.012, by - w * 0.012, w * 0.028, w * 0.02, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#2b3037";
  ctx.beginPath();
  ctx.arc(bx - w * 0.045, by + w * 0.03, w * 0.024, 0, TAU);
  ctx.fill();
  poly(ctx, [[bx - w * 0.062, by + w * 0.028], [bx - w * 0.1, by + w * 0.022],
    [bx - w * 0.06, by + w * 0.014]], "#e8a33c");
  ctx.fillStyle = "#2b3037";
  poly(ctx, [[bx + w * 0.04, by - w * 0.01], [bx + w * 0.1, by - w * 0.035],
    [bx + w * 0.04, by + w * 0.012]], "#242930");

  // ---- 脸：一对煤球眼、胡萝卜鼻子、五颗煤渣嘴 ----
  for (const s of [-1, 1]) {
    ctx.fillStyle = "#1b1c20";
    ctx.beginPath();
    ctx.arc(s * w * 0.068, h * 0.845, w * 0.028, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.beginPath();
    ctx.arc(s * w * 0.068 - w * 0.008, h * 0.845 + w * 0.009, w * 0.009, 0, TAU);
    ctx.fill();
  }
  // 胡萝卜指向右下（光从左上来，鼻子下面是它的暗面）
  ctx.fillStyle = hgrad(ctx, w * 0.01, w * 0.15, h * 0.80, [
    [0, "#f0a24a"], [0.5, "#e2801f"], [1, "#b45f14"],
  ]);
  poly(ctx, [[w * 0.012, h * 0.822], [w * 0.15, h * 0.798], [w * 0.012, h * 0.786]], ctx.fillStyle);
  ctx.strokeStyle = "rgba(120,60,10,.4)";
  ctx.lineWidth = 0.012;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(w * 0.04 * i, h * 0.818 - i * 0.003);
    ctx.lineTo(w * 0.04 * i, h * 0.792 + i * 0.002);
    ctx.stroke();
  }
  ctx.fillStyle = "#1b1c20";
  for (let i = 0; i < 5; i++) {
    const mx = -w * 0.062 + i * w * 0.031, my = h * 0.762 - Math.cos((i - 2) * 0.6) * h * 0.008;
    ctx.beginPath();
    ctx.arc(mx, my, w * 0.014, 0, TAU);
    ctx.fill();
  }
  // 身上的三颗扣子
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = "#1b1c20";
    ctx.beginPath();
    ctx.arc(0, h * (0.615 - i * 0.055), w * 0.017, 0, TAU);
    ctx.fill();
  }

  // ---- 红围巾：绕两圈，一头往右甩出去 ----
  ctx.fillStyle = "#b8353a";
  ctx.fillRect(-w * 0.20, h * 0.715, w * 0.40, h * 0.045);
  ctx.fillStyle = "#d0554d";
  ctx.fillRect(-w * 0.20, h * 0.732, w * 0.40, h * 0.014);
  ctx.fillStyle = "#b8353a";
  poly(ctx, [[w * 0.06, h * 0.715], [w * 0.24, h * 0.70], [w * 0.20, h * 0.60], [w * 0.05, h * 0.625]], ctx.fillStyle);
  ctx.fillStyle = shade("#b8353a", -0.28);
  poly(ctx, [[w * 0.06, h * 0.715], [w * 0.24, h * 0.70], [w * 0.23, h * 0.665], [w * 0.06, h * 0.68]], ctx.fillStyle);
  ctx.strokeStyle = "#8f2a2f";
  ctx.lineWidth = 0.016;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(w * (0.075 + i * 0.05), h * 0.60);
    ctx.lineTo(w * (0.07 + i * 0.05), h * 0.575);
    ctx.stroke();
  }

  // ---- 头上的铁桶：翻过来扣着，桶底朝上，边上全是磕碰 ----
  const brimY = h * 0.895, topY = h * 0.995;
  const steel = hgrad(ctx, -w * 0.19, w * 0.19, h * 0.95, [
    [0, "#cfd6de"], [0.3, "#a4acb6"], [0.68, "#767e88"], [1, "#4a515a"],
  ]);
  poly(ctx, [
    [-w * 0.145, topY], [w * 0.145, topY], [w * 0.185, brimY], [-w * 0.185, brimY],
  ], steel);
  ctx.fillStyle = "#7f8791";
  ctx.fillRect(-w * 0.20, brimY - h * 0.016, w * 0.40, h * 0.02);
  ctx.strokeStyle = "rgba(50,56,64,.5)";
  ctx.lineWidth = 0.014;
  for (const k of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(k * w * 0.05, h * 0.915);
    ctx.quadraticCurveTo(k * w * 0.09, h * 0.94, k * w * 0.055, h * 0.965);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(60,66,74,.7)";
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(-w * 0.12 + i * w * 0.12, brimY + h * 0.02, w * 0.012, 0, TAU);
    ctx.fill();
  }
  // 桶沿上积的一层雪
  snowCap(ctx, -w * 0.145, topY, w * 0.29, h * 0.022, 0.9);
  // 提梁歪在一边（铁桶本来就有）
  ctx.strokeStyle = "rgba(70,76,84,.85)";
  ctx.lineWidth = 0.018;
  ctx.beginPath();
  ctx.arc(w * 0.20, h * 0.925, w * 0.045, -0.6, 1.5);
  ctx.stroke();
}
