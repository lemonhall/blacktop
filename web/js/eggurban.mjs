/**
 * **有电、有火的两件彩蛋**：城里那格红光的电话亭、夜市摊上还在冒热气的锅。
 *
 * 这一半和 `eggwild.mjs` 是一对：野外那两件是"没人了"，这两件是"人刚走开"。
 * 画法上的差别也就落在这儿——**它们身上必须有一处亮的东西**：电话亭里那盏灯、
 * 摊子上那口锅和那串灯泡。夜景里的伪 3D 全是暗的，一点暖光就能让整条路活过来。
 *
 * 规矩和那一半一样：**先是一个合理的路边物件，再是一个玩笑**。电话亭得真像电话亭，
 * 摊子得真像有人在卖串，不然那两个玩笑没人接得住。
 *
 * 院子里的两件（乡村信箱、工地警示牌）在 `eggyard.mjs`，共用零件在 `eggart.mjs`。
 * 坐标系：米，y 向上，原点在接地点。
 */

import { TAU } from "../../sim/constants.mjs";
import { bloom, hgrad, poly, shade } from "./art.mjs";
import { glassPane, label3d, rustPatch } from "./parts.mjs";
import { plankLay, shadow } from "./eggart.mjs";

/**
 * 电话亭：红色、玻璃窗、顶上一条亮着的 "TEL"。城市环路夜里那一格光。
 */
export function phonebooth(ctx, w, h, t, seed) {
  // 地上那圈影子和灯光**都要收在贴图框里**：框外的部分会被裁掉，裁出来就是
  // 一条笔直的硬边，夜里看尤其刺眼。所以影子给 0.4w 的半径、灯光池给 0.5w。
  shadow(ctx, 0, 0.05, w * 0.4, h * 0.06, 0.95);
  // 灯从亭子里漏到地上：夜里最容易忽略、也最提气的一笔
  const pool = ctx.createRadialGradient(0, 0.06, 0, 0, 0.06, w * 0.5);
  pool.addColorStop(0, "rgba(255,206,126,.3)");
  pool.addColorStop(1, "rgba(255,190,110,0)");
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(0, 0.06, w * 0.5, h * 0.055, 0, 0, TAU);
  ctx.fill();

  const red = "#c0392f";
  const bodyTop = h * 0.94;
  ctx.fillStyle = hgrad(ctx, -w / 2, w / 2, h * 0.5, [
    [0, shade(red, 0.26)], [0.36, red], [0.76, shade(red, -0.3)], [1, shade(red, -0.5)],
  ]);
  ctx.fillRect(-w / 2, h * 0.1, w, bodyTop - h * 0.1);
  // 底座：一道台阶，把亭子"放"在地上
  ctx.fillStyle = shade(red, -0.55);
  ctx.fillRect(-w * 0.54, h * 0.045, w * 1.08, h * 0.06);
  ctx.fillStyle = "rgba(255,255,255,.12)";
  ctx.fillRect(-w * 0.54, h * 0.1, w * 1.08, h * 0.012);

  // 两格玻璃：亮着，能看见里面的电话机
  glassPane(ctx, -w * 0.36, h * 0.26, w * 0.34, h * 0.46, { lit: true, alpha: 0.86 });
  glassPane(ctx, w * 0.02, h * 0.26, w * 0.34, h * 0.46, { lit: true, alpha: 0.7 });
  // 里头的电话机：一个方盒子 + 两只听筒 + 一根螺旋线
  ctx.fillStyle = "#2a2028";
  ctx.fillRect(-w * 0.28, h * 0.4, w * 0.18, h * 0.14);
  ctx.fillStyle = "#3c2f36";
  ctx.fillRect(-w * 0.3, h * 0.5, w * 0.22, h * 0.02);
  ctx.strokeStyle = "#241c22";
  ctx.lineWidth = 0.022;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(-w * 0.16, h * (0.44 - i * 0.026), w * 0.035, -1.2, 1.6);
    ctx.stroke();
  }
  // 门缝、把手、锈、贴纸
  ctx.fillStyle = "#2a2028";
  ctx.fillRect(-w * 0.02, h * 0.26, w * 0.04, h * 0.46);
  ctx.fillStyle = "#8d6f3a";
  ctx.fillRect(w * 0.3, h * 0.44, w * 0.07, h * 0.16);
  ctx.fillStyle = "rgba(255,232,178,.5)";
  ctx.fillRect(w * 0.3, h * 0.44, w * 0.02, h * 0.16);
  rustPatch(ctx, -w * 0.46, h * 0.12, w * 0.34, h * 0.2, seed + 3, 0.9);
  ctx.fillStyle = "#efe6d2";
  ctx.fillRect(-w * 0.46, h * 0.6, w * 0.13, h * 0.06);
  ctx.fillStyle = "#b6383a";
  ctx.beginPath();
  ctx.arc(-w * 0.42, h * 0.63, w * 0.035, 0, TAU);
  ctx.fill();

  // 顶上的灯箱：白底红字，外面再套一层光晕
  ctx.fillStyle = shade(red, -0.34);
  ctx.fillRect(-w * 0.56, h * 0.94, w * 1.12, h * 0.045);
  ctx.fillStyle = "#f7ecc8";
  ctx.fillRect(-w * 0.44, h * 0.86, w * 0.88, h * 0.085);
  ctx.fillStyle = "#fff6dc";
  ctx.fillRect(-w * 0.44, h * 0.925, w * 0.88, h * 0.028);
  label3d(ctx, 0, h * 0.885, h * 0.055, "TEL", "#3a2a20");
  // 光晕的半径要连"灯箱到顶"一起算进贴图的高度里（框只有 1.05h）
  bloom(ctx, 0, h * 0.885, w * 0.3, "rgba(255,226,160,.5)", 0.7);
  // 皇冠（英国那种电话亭真要有的那一小块）
  ctx.fillStyle = "#e8c777";
  poly(ctx, [[-w * 0.07, h * 0.952], [w * 0.07, h * 0.952], [w * 0.05, h * 0.975],
    [w * 0.025, h * 0.962], [0, h * 0.978], [-w * 0.025, h * 0.962], [-w * 0.05, h * 0.975]], ctx.fillStyle);
}

/**
 * 夜市摊：条纹棚子 + 烤炉 + 一口锅 + 两盏灯笼 + 一串灯泡 + 三股白汽。
 * 霓虹夜市的那口热气——**它必须看起来像有人刚离开，而不是一座搭好的空棚子**。
 */
export function stall(ctx, w, h, t, seed) {
  const wood = t.wood;
  shadow(ctx, 0, 0.05, w * 0.42, h * 0.04, 0.9);
  // 灶火漏在地上的那团暖光（半径收在 0.5w 以内，理由同电话亭）
  const pool = ctx.createRadialGradient(0, 0.05, 0, 0, 0.05, w * 0.5);
  pool.addColorStop(0, "rgba(255,168,74,.26)");
  pool.addColorStop(1, "rgba(255,150,60,0)");
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(0, 0.05, w * 0.5, h * 0.045, 0, 0, TAU);
  ctx.fill();

  // ---- 四根柱子：后面两根先画，前面两根压在上面 ----
  for (const [s, kx, top] of [[-1, 0.4, 0.86], [1, 0.4, 0.86], [-1, 0.46, 0.9], [1, 0.46, 0.9]]) {
    const px = s * w * kx, pw = w * 0.035;
    ctx.fillStyle = hgrad(ctx, px - pw, px + pw, h * 0.4, [
      [0, shade(wood, 0.34)], [0.36, shade(wood, 0.1)], [1, shade(wood, -0.5)],
    ]);
    ctx.fillRect(px - pw / 2, h * 0.04, pw, h * top - h * 0.04);
    ctx.fillStyle = "rgba(255,255,255,.1)";
    ctx.fillRect(px - pw * 0.3, h * 0.06, pw * 0.18, h * (top - 0.08));
  }
  // ---- 台子：三块板的围板 + 一块挑出来的台面 ----
  plankLay(ctx, -w * 0.42, h * 0.06, w * 0.84, h * 0.3, 3, shade(wood, -0.06), seed);
  ctx.fillStyle = "rgba(20,14,8,.34)";
  ctx.fillRect(-w * 0.42, h * 0.36, w * 0.84, h * 0.03);
  ctx.fillStyle = hgrad(ctx, -w * 0.46, w * 0.46, h * 0.4, [
    [0, "#a98a5c"], [0.4, "#8a6a44"], [1, "#5c452c"],
  ]);
  ctx.fillRect(-w * 0.46, h * 0.39, w * 0.92, h * 0.045);
  ctx.fillStyle = "rgba(255,240,210,.2)";
  ctx.fillRect(-w * 0.46, h * 0.425, w * 0.92, h * 0.01);

  // ---- 台上：一口锅 + 一个烤炉（炉子上还架着串） ----
  const potX = -w * 0.24;
  ctx.fillStyle = "#2f343c";
  ctx.beginPath();
  ctx.ellipse(potX, h * 0.47, w * 0.13, h * 0.035, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#454c56";
  ctx.fillRect(potX - w * 0.13, h * 0.44, w * 0.26, h * 0.035);
  ctx.fillStyle = "#5c6470";
  ctx.beginPath();
  ctx.ellipse(potX, h * 0.505, w * 0.12, h * 0.026, 0, 0, TAU);
  ctx.fill();
  // 汤面：亮一层油光
  ctx.fillStyle = "rgba(240,196,120,.7)";
  ctx.beginPath();
  ctx.ellipse(potX, h * 0.505, w * 0.1, h * 0.018, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#e8dcc0";
  ctx.beginPath();
  ctx.ellipse(potX, h * 0.505, w * 0.03, h * 0.008, 0, 0, TAU);
  ctx.fill();
  const grillX = w * 0.22;
  ctx.fillStyle = "#23272e";
  ctx.fillRect(grillX - w * 0.16, h * 0.42, w * 0.32, h * 0.06);
  ctx.fillStyle = "rgba(255,132,40,.85)";
  ctx.fillRect(grillX - w * 0.13, h * 0.43, w * 0.26, h * 0.03);
  for (let i = 0; i < 3; i++) {
    const sx = grillX - w * 0.1 + i * w * 0.09;
    ctx.fillStyle = "#b9a887";
    ctx.fillRect(sx, h * 0.44, 0.022, h * 0.1);
    ctx.fillStyle = "#8c4a2a";
    for (let k = 0; k < 3; k++) ctx.fillRect(sx - 0.02, h * (0.45 + k * 0.03), 0.062, 0.03);
  }
  // 一排碗 + 一罐签子
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i % 2 ? "#e4e0d4" : "#d6cfbe";
    ctx.beginPath();
    ctx.ellipse(-w * 0.42, h * (0.44 + i * 0.016), w * 0.045, h * 0.012, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = "#6b7280";
  ctx.fillRect(w * 0.36, h * 0.42, w * 0.07, h * 0.06);
  ctx.strokeStyle = "#c9bda0";
  ctx.lineWidth = 0.016;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(w * 0.37 + i * 0.014, h * 0.48);
    ctx.lineTo(w * 0.375 + i * 0.014, h * 0.55);
    ctx.stroke();
  }

  // ---- 棚子：红白条纹 + 一圈波浪形的帘子 ----
  // 棚子的横向范围定死在 ±0.56w：贴图框的两边只留 0.625w，超出去就会被切成直边
  const stripeW = w * 0.14;
  const clampTo = (x, half) => Math.max(-half, Math.min(half, x));
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-w * 0.56, h * 0.72);
  ctx.lineTo(w * 0.56, h * 0.72);
  ctx.lineTo(w * 0.52, h * 0.9);
  ctx.lineTo(-w * 0.52, h * 0.9);
  ctx.closePath();
  ctx.clip();
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = i % 2 ? "#e9e3d5" : "#b4302c";
    // 每根条的四个角都**夹回棚子的边界**：`clip` 只管画面，`bounds()` 量的是
    // 画出笔的坐标——一根甩到 0.72w 的条纹会把整块贴图撑大一大截。
    const a = -w * 0.56 + i * stripeW, b = a + stripeW * 0.88;
    poly(ctx, [
      [clampTo(a, w * 0.56), h * 0.7], [clampTo(b, w * 0.56), h * 0.7],
      [clampTo(b - w * 0.04, w * 0.52), h * 0.92], [clampTo(a - w * 0.04, w * 0.52), h * 0.92],
    ], ctx.fillStyle);
  }
  ctx.fillStyle = "rgba(0,0,0,.16)";
  ctx.fillRect(-w * 0.56, h * 0.7, w * 1.12, h * 0.04);
  // 一块补丁：棚子破过，缝上去的
  ctx.fillStyle = "rgba(120,88,70,.85)";
  poly(ctx, [[w * 0.1, h * 0.78], [w * 0.24, h * 0.785], [w * 0.22, h * 0.84], [w * 0.09, h * 0.835]], ctx.fillStyle);
  ctx.restore();
  ctx.strokeStyle = "rgba(12,16,22,.5)";
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  ctx.moveTo(-w * 0.56, h * 0.72);
  ctx.lineTo(w * 0.56, h * 0.72);
  ctx.lineTo(w * 0.52, h * 0.9);
  ctx.lineTo(-w * 0.52, h * 0.9);
  ctx.closePath();
  ctx.stroke();
  // 帘子：一圈垂下来的小弧，底下带波浪
  ctx.fillStyle = "#8f2a26";
  ctx.beginPath();
  ctx.moveTo(-w * 0.56, h * 0.72);
  ctx.lineTo(w * 0.56, h * 0.72);
  ctx.lineTo(w * 0.56, h * 0.68);
  for (let i = 0; i < 8; i++) {
    const x = w * 0.56 - i * w * 0.14;
    ctx.quadraticCurveTo(x - w * 0.05, h * 0.62, x - w * 0.09, h * 0.685);
  }
  ctx.closePath();
  ctx.fill();

  // ---- 灯：横梁上串着的两颗灯泡 + 两盏红灯笼 ----
  ctx.strokeStyle = "rgba(20,18,16,.8)";
  ctx.lineWidth = 0.014;
  ctx.beginPath();
  ctx.moveTo(-w * 0.46, h * 0.84);
  ctx.quadraticCurveTo(0, h * 0.815, w * 0.46, h * 0.84);
  ctx.stroke();
  for (const bx of [-w * 0.22, w * 0.18]) {
    ctx.fillStyle = "#5a5f68";
    ctx.fillRect(bx - 0.012, h * 0.815, 0.024, h * 0.014);
    ctx.fillStyle = "#ffe6a8";
    ctx.beginPath();
    ctx.arc(bx, h * 0.8, w * 0.022, 0, TAU);
    ctx.fill();
    bloom(ctx, bx, h * 0.8, w * 0.1, "rgba(255,226,160,.75)", 0.85);
  }
  for (const s of [-1, 1]) {
    const lx = s * w * 0.4, ly = h * 0.79;
    ctx.fillStyle = "#d8352c";
    ctx.beginPath();
    ctx.ellipse(lx, ly, w * 0.075, h * 0.055, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,224,150,.45)";
    ctx.beginPath();
    ctx.ellipse(lx, ly, w * 0.045, h * 0.035, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#f0d089";
    ctx.lineWidth = 0.016;
    ctx.beginPath();
    ctx.moveTo(lx, ly + h * 0.055);
    ctx.lineTo(lx, ly + h * 0.1);
    ctx.stroke();
  }

  // ---- 牌子：挂在梁下的一块木牌 ----
  ctx.fillStyle = "#f2e0b0";
  ctx.fillRect(-w * 0.09, h * 0.6, w * 0.18, h * 0.1);
  ctx.strokeStyle = "rgba(90,60,30,.5)";
  ctx.lineWidth = 0.02;
  ctx.strokeRect(-w * 0.09, h * 0.6, w * 0.18, h * 0.1);
  label3d(ctx, 0, h * 0.63, h * 0.06, "串", "#8a2a20");

  // ---- 白汽：从锅和炉子上冒出来，细、往上走、不遮棚子 ----
  for (let i = 0; i < 3; i++) {
    const f = i / 3;
    const sx = potX + (i % 2) * w * 0.3 + f * w * 0.06;
    ctx.fillStyle = `rgba(255,252,246,${(0.3 - f * 0.16).toFixed(2)})`;
    poly(ctx, [
      [sx - w * 0.035, h * 0.53], [sx + w * 0.035, h * 0.53],
      [sx + w * 0.02, h * (0.66 + f * 0.1)], [sx - w * 0.02, h * (0.68 + f * 0.1)],
    ], ctx.fillStyle);
  }
  // 摊子前头的一只箱子，给近处一点纵深
  ctx.fillStyle = hgrad(ctx, -w * 0.5, -w * 0.3, h * 0.06, [
    [0, "#7d7059"], [0.5, "#5f5544"], [1, "#3e372c"],
  ]);
  ctx.fillRect(-w * 0.52, h * 0.02, w * 0.2, h * 0.11);
  ctx.fillStyle = "rgba(255,255,255,.1)";
  ctx.fillRect(-w * 0.52, h * 0.12, w * 0.2, h * 0.012);
  ctx.fillStyle = "rgba(20,16,12,.4)";
  ctx.fillRect(-w * 0.52, h * 0.06, w * 0.2, h * 0.012);
}
