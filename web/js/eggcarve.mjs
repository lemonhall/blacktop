/**
 * **木头刻出来的那件彩蛋**：红杉林道深处的图腾柱。
 *
 * 它和 `eggwood.mjs` 里那条破船共用同一批旧木头，但画法是另一路：船是弯的板、
 * 烂出来的洞；图腾柱是直的方料、**凿出来**的脸。所以它在这一份里单独放：
 * 每段脸都压着一道眉、眼睛是空洞里嵌的贝壳、嘴巴是一排涂了漆的牙，顶上那只熊
 * 直接坐在柱子上，翅膀从熊的两侧展开。
 *
 * 共用零件在 `eggart.mjs`，另外六件在 `eggwild.mjs` / `eggwood.mjs` / 
 * `eggurban.mjs` / `eggyard.mjs`。坐标系：米，y 向上，原点在接地点。
 */

import { TAU } from "../../sim/constants.mjs";
import { hgrad, poly, shade } from "./art.mjs";
import { cracked, drift, mossy, shadow } from "./eggart.mjs";
/**
 * 图腾柱：三段脸、项上一只熊，两边展开一对翅膀。红杉林道深处的老物件。
 *
 * 上一版把它画成了"三张表情叠在一起的一只木桶"，问题出在三处：柱子太矮太胖、
 * 顶上的熊跟柱子之间断开了一大截、每张脸的眼睛是两颗圆点。这一版按真正的图腾柱
 * 来：**柱身是细长的方料、每一段脸都压着一道凿出来的眉、眼睛是空洞里嵌贝壳、
 * 顶上那只熊直接坐在柱子上**，翅膀从熊的两侧展开。
 */
export function totem(ctx, w, h, t, seed) {
  // 影子连外圈一起收进框里（`shadow()` 外圈是 1.28 倍半径）
  shadow(ctx, 0, 0.05, w * 0.4, h * 0.028, 0.9);
  // 柱基：一堆碎石 + 一丛苔
  drift(ctx, 0, 0, w * 0.9, h * 0.035, "#8f8b7c", "#5f5c52", seed);
  const colW = w * 0.6, colTop = h * 0.855;
  const wood = shade(t.wood, 0.12);
  ctx.fillStyle = hgrad(ctx, -colW / 2, colW / 2, h * 0.4, [
    [0, shade(wood, 0.3)], [0.3, wood], [0.72, shade(wood, -0.22)], [1, shade(wood, -0.5)],
  ]);
  ctx.fillRect(-colW / 2, h * 0.03, colW, colTop - h * 0.03);
  // 两块拼起来的雪松：中间一条竖缝，两边各一道顺纹
  ctx.fillStyle = "rgba(30,20,10,.4)";
  ctx.fillRect(-w * 0.006, h * 0.03, w * 0.012, colTop - h * 0.03);
  for (const s of [-1, 1]) {
    ctx.fillStyle = "rgba(255,246,220,.1)";
    ctx.fillRect(s * colW * 0.3, h * 0.05, w * 0.02, colTop - h * 0.09);
  }
  // 三段脸：越往上越小，交替涂红与青
  const face = (cy, k, paint) => {
    const fw = colW * k;
    // 眉：一道压出来的横木，比脸宽一点，这是"凿过"的第一眼证据
    ctx.fillStyle = shade(wood, -0.4);
    ctx.fillRect(-fw * 0.62, cy + h * 0.052, fw * 1.24, h * 0.014);
    ctx.fillStyle = "rgba(255,246,220,.14)";
    ctx.fillRect(-fw * 0.62, cy + h * 0.062, fw * 1.24, h * 0.006);
    // 眼：凿空的黑洞，里面嵌一块贝壳白
    for (const s of [-1, 1]) {
      const ex = s * fw * 0.28;
      ctx.fillStyle = "#241d16";
      ctx.beginPath();
      ctx.ellipse(ex, cy + h * 0.032, fw * 0.19, h * 0.017, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#efe4c8";
      ctx.beginPath();
      ctx.ellipse(ex, cy + h * 0.03, fw * 0.12, h * 0.011, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#171310";
      ctx.beginPath();
      ctx.arc(ex, cy + h * 0.029, fw * 0.04, 0, TAU);
      ctx.fill();
    }
    // 嘴：一块涂了漆的方口，中间一排牙
    ctx.fillStyle = paint;
    ctx.fillRect(-fw * 0.46, cy - h * 0.012, fw * 0.92, h * 0.032);
    ctx.fillStyle = "rgba(20,16,12,.75)";
    ctx.fillRect(-fw * 0.4, cy - h * 0.006, fw * 0.8, h * 0.02);
    ctx.fillStyle = "#e8dcc0";
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(-fw * 0.34 + i * fw * 0.17, cy - h * 0.006, fw * 0.08, h * 0.012);
    }
    // 腮帮子上的一道漆
    ctx.fillStyle = "rgba(255,246,220,.12)";
    ctx.fillRect(-fw * 0.5, cy + h * 0.042, fw * 0.2, h * 0.008);
    ctx.fillRect(fw * 0.3, cy + h * 0.042, fw * 0.2, h * 0.008);
  };
  face(h * 0.17, 0.92, "#2f5a4a");
  face(h * 0.4, 0.86, "#7a2f28");
  face(h * 0.62, 0.8, "#2f5a4a");
  // 柱子上的裂纹、鸟粪、苔
  cracked(ctx, 0, h * 0.5, w * 0.9, seed, "rgba(26,18,10,.5)", 1);
  ctx.fillStyle = "rgba(238,240,236,.34)";
  ctx.beginPath();
  ctx.ellipse(w * 0.12, h * 0.3, w * 0.05, h * 0.02, 0, 0, TAU);
  ctx.fill();
  ctx.fillRect(w * 0.1, h * 0.3, w * 0.035, h * 0.12);
  mossy(ctx, -colW * 0.5, h * 0.03, colW, h * 0.06, seed + 7);

  // ---- 翅膀：从熊的两侧展开，一边三根羽 ----
  for (const s of [-1, 1]) {
    ctx.fillStyle = s < 0 ? "#2f5a4a" : "#7a2f28";
    poly(ctx, [[s * colW * 0.34, h * 0.79], [s * w * 0.52, h * 0.86], [s * w * 0.5, h * 0.74],
      [s * colW * 0.36, h * 0.72]], ctx.fillStyle);
    ctx.fillStyle = "rgba(232,220,192,.5)";
    for (let i = 0; i < 3; i++) {
      poly(ctx, [
        [s * colW * 0.4, h * (0.755 + i * 0.03)],
        [s * (w * 0.5 - i * w * 0.03), h * (0.83 - i * 0.03)],
        [s * (w * 0.5 - i * w * 0.03), h * (0.81 - i * 0.03)],
      ], ctx.fillStyle);
    }
  }
  // ---- 顶上的熊：直接坐在柱子上，不许留缝 ----
  const headY = h * 0.85, headH = h * 0.14;
  const head = hgrad(ctx, -colW * 0.5, colW * 0.5, headY + headH * 0.4, [
    [0, shade(wood, 0.34)], [0.42, wood], [1, shade(wood, -0.46)],
  ]);
  poly(ctx, [
    [-colW * 0.44, headY], [colW * 0.44, headY], [colW * 0.38, headY + headH],
    [-colW * 0.36, headY + headH * 0.98],
  ], head);
  // 耳朵
  for (const s of [-1, 1]) {
    ctx.fillStyle = shade(wood, 0.26);
    ctx.beginPath();
    ctx.arc(s * colW * 0.38, headY + headH * 0.84, colW * 0.15, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(40,28,16,.6)";
    ctx.beginPath();
    ctx.arc(s * colW * 0.38, headY + headH * 0.84, colW * 0.07, 0, TAU);
    ctx.fill();
  }
  // 口鼻：一块突出的方吻 + 一颗鼻头 + 一排牙
  ctx.fillStyle = shade(wood, 0.18);
  ctx.fillRect(-colW * 0.22, headY + headH * 0.3, colW * 0.44, headH * 0.34);
  ctx.fillStyle = "#1d1712";
  ctx.beginPath();
  ctx.ellipse(0, headY + headH * 0.56, colW * 0.075, headH * 0.075, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#e8dcc0";
  ctx.fillRect(-colW * 0.15, headY + headH * 0.38, colW * 0.3, headH * 0.055);
  ctx.fillStyle = "#7a2f28";
  ctx.fillRect(-colW * 0.24, headY + headH * 0.28, colW * 0.48, headH * 0.05);
  // 眼睛
  for (const s of [-1, 1]) {
    ctx.fillStyle = "#241d16";
    ctx.beginPath();
    ctx.ellipse(s * colW * 0.2, headY + headH * 0.7, colW * 0.1, headH * 0.09, 0, 0, TAU);
    ctx.fill();
  }
}
