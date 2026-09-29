/**
 * 路边**近处的屋子和杂物**：护林站、山地木屋、筒仓、集装箱、油桶。
 *
 * 从 `propsbuild.mjs` 里分出来。那一半（谷仓、风车、水塔、井架、灯塔、报刊亭）
 * 是**地标**——两百米外就要认得出，剪影第一、细节第二；这一半是**近处的填充**：
 * 它们只在几十米内起作用，所以画法重点反过来，是材质（木板缝、锈斑、雪线、
 * 玻璃反光）而不是轮廓。
 *
 * 坐标系：米，y 向上，原点在接地点。
 */

import { TAU } from "../../sim/constants.mjs";
import { hash2 } from "../../sim/rng.mjs";
import { hgrad, poly, shade } from "./art.mjs";
import { concreteFace, glassPane, plankFace, rustPatch, snowCap, steelPlate } from "./parts.mjs";
import { gable } from "./propsbuild.mjs";

/** 护林站：小木屋 + 门廊 + 烟囱。红杉林道上"有人住"的证据。 */
export function rangerhut(ctx, w, h, t, seed) {
  ctx.fillStyle = "rgba(6,9,16,.36)";
  ctx.fillRect(-w * 0.54, 0, w * 1.08, 0.06);
  plankFace(ctx, -w * 0.46, 0, w * 0.92, h * 0.62, t.wood, seed);
  gable(ctx, w * 0.98, h * 0.6, h * 0.3, "#4c3a29", { snow: t.snow });
  glassPane(ctx, -w * 0.34, h * 0.24, w * 0.22, h * 0.24, { lit: true, alpha: 0.9 });
  glassPane(ctx, w * 0.12, h * 0.24, w * 0.22, h * 0.24, { lit: t.night });
  ctx.fillStyle = "#3a2a1c";
  ctx.fillRect(-w * 0.06, 0, w * 0.18, h * 0.36);
  ctx.fillStyle = "#6b5237";
  ctx.fillRect(w * 0.26, h * 0.4, w * 0.12, h * 0.46);
  ctx.fillStyle = "rgba(200,200,200,.28)";
  ctx.fillRect(w * 0.26, h * 0.86, w * 0.12, h * 0.08);
}

/**
 * 山地木屋：陡屋顶 + 阳台 + 挂着的雪。
 *
 * 屋顶的雪上一版画成一大块白三角，从屋脊一直盖到左边屋檐——那是**屋顶的一半**，
 * 不是雪。现在改成"沿两坡各贴一条白边 + 屋檐挂冰凌 + 屋脊一条雪带"，谁也不越界。
 */
export function lodge(ctx, w, h, t, seed) {
  ctx.fillStyle = "rgba(6,9,16,.36)";
  ctx.fillRect(-w * 0.56, 0, w * 1.12, 0.07);
  plankFace(ctx, -w * 0.48, 0, w * 0.96, h * 0.58, "#5c4230", seed);
  ctx.fillStyle = "#4a3423";
  ctx.fillRect(-w * 0.48, h * 0.44, w * 0.96, h * 0.05);
  for (const f of [-0.3, 0.06, 0.3]) glassPane(ctx, w * f, h * 0.5, w * 0.18, h * 0.2, { lit: true, alpha: 0.9 });
  // 屋顶：两坡各压一层板条（顺着坡走，不是横着贴）
  poly(ctx, [[-w * 0.78, h * 0.56], [0, h], [w * 0.78, h * 0.56]], "#3c2c1e");
  ctx.strokeStyle = "rgba(0,0,0,.22)";
  ctx.lineWidth = 0.02;
  for (const side of [-1, 1]) {
    for (let i = 1; i < 6; i++) {
      const f = i / 6;
      ctx.beginPath();
      ctx.moveTo(side * w * 0.78 * (1 - f), h * 0.56 + (h * 0.44) * f);
      ctx.lineTo(side * w * 0.78 * (1 - f) + side * w * 0.06, h * 0.56 + (h * 0.44) * f);
      ctx.stroke();
    }
  }
  // 雪：沿两坡各一条，屋脊再压一条
  const snow = t.snow ? "#f4f8ff" : "rgba(240,244,250,.34)";
  for (const side of [-1, 1]) {
    poly(ctx, [
      [side * w * 0.78, h * 0.56], [0, h],
      [0, h - h * 0.03], [side * w * 0.78, h * 0.56 - h * 0.035],
    ], snow);
  }
  poly(ctx, [[-w * 0.06, h * 0.995], [0, h - h * 0.05], [w * 0.06, h * 0.995]], snow);
  if (t.snow) {
    // 屋檐挂冰凌：雪原上最能说明"这儿很冷"的一笔
    ctx.fillStyle = "rgba(226,238,250,.8)";
    for (let i = 0; i < 7; i++) {
      const x = -w * 0.7 + i * w * 0.2;
      poly(ctx, [[x, h * 0.555], [x + w * 0.035, h * 0.555], [x + w * 0.017, h * 0.555 - h * 0.05]],
        "rgba(226,238,250,.8)");
    }
  }
  // 阳台：栏杆 + 立柱，一间木屋少了这个就只剩一个盒子
  ctx.fillStyle = "#2a1e14";
  ctx.fillRect(-w * 0.4, h * 0.2, w * 0.8, h * 0.05);
  ctx.fillStyle = "#6b5237";
  ctx.fillRect(-w * 0.4, h * 0.2, w * 0.8, h * 0.028);
  ctx.fillStyle = "#4a3423";
  for (let i = 0; i < 6; i++) ctx.fillRect(-w * 0.38 + i * w * 0.152, h * 0.228, w * 0.012, h * 0.05);
  ctx.fillStyle = "#3a2a1c";
  ctx.fillRect(-w * 0.08, 0, w * 0.16, h * 0.3);
  ctx.fillStyle = "rgba(255,240,200,.5)";
  ctx.fillRect(-w * 0.05, h * 0.12, w * 0.1, h * 0.02);
  ctx.fillStyle = "#6b5237";
  ctx.fillRect(w * 0.26, h * 0.6, w * 0.1, h * 0.44);
  ctx.fillStyle = "rgba(220,226,236,.3)";
  ctx.fillRect(w * 0.26, h * 0.96, w * 0.1, h * 0.09);
}

/** 筒仓：圆筒 + 圆顶 + 一圈箍 + 梯子。工业支线上最像工业的东西。 */
export function silo(ctx, w, h, t, seed) {
  concreteFace(ctx, -w * 0.56, 0, w * 1.12, h * 0.06, t.conc, seed);
  ctx.fillStyle = hgrad(ctx, -w / 2, w / 2, h * 0.5, [
    [0, shade(t.conc, 0.34)], [0.32, shade(t.conc, 0.12)], [0.74, t.conc], [1, shade(t.conc, -0.42)],
  ]);
  ctx.fillRect(-w / 2, 0, w, h * 0.86);
  ctx.fillStyle = "rgba(0,0,0,.2)";
  for (let i = 0; i < 6; i++) ctx.fillRect(-w / 2, h * (0.12 + i * 0.13), w, 0.035);
  ctx.fillStyle = "rgba(255,255,255,.16)";
  for (let i = 0; i < 6; i++) ctx.fillRect(-w / 2, h * (0.12 + i * 0.13) + 0.035, w, 0.02);
  ctx.fillStyle = shade(t.steel, -0.1);
  ctx.beginPath();
  ctx.ellipse(0, h * 0.86, w * 0.5, h * 0.07, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = "#4a4f58";
  ctx.fillRect(w * 0.14, h * 0.9, w * 0.1, h * 0.08);
  rustPatch(ctx, -w / 2, 0, w, h * 0.86, seed, 0.6);
  ctx.fillStyle = "#5c6572";
  ctx.fillRect(-w * 0.36, 0, 0.03, h * 0.92);
  for (let i = 0; i < 9; i++) ctx.fillRect(-w * 0.38, h * (0.05 + i * 0.1), w * 0.09, 0.028);
}

/** 集装箱：竖楞 + 门 + 锁杆 + 锈。工业支线上码成一排。 */
export function container(ctx, w, h, t, seed) {
  const paint = ["#3f6a8c", "#8c4a3a", "#4a7a4c", "#8a7a3a"][Math.floor(hash2(seed, 7) * 4)];
  ctx.fillStyle = "rgba(6,9,16,.42)";
  ctx.fillRect(-w * 0.54, 0, w * 1.08, 0.07);
  steelPlate(ctx, -w / 2, 0, w, h, paint, { ribs: 14, seed });
  ctx.fillStyle = shade(paint, -0.34);
  ctx.fillRect(-w * 0.06, 0, w * 0.12, h);
  ctx.fillStyle = "#6b7480";
  for (const x of [-w * 0.26, w * 0.26]) {
    ctx.fillRect(x - 0.035, h * 0.1, 0.07, h * 0.8);
    for (let i = 0; i < 4; i++) ctx.fillRect(x - 0.1, h * (0.16 + i * 0.2), 0.2, 0.05);
  }
  ctx.fillStyle = "rgba(255,255,255,.14)";
  ctx.fillRect(-w / 2, h * 0.92, w, 0.04);
  rustPatch(ctx, -w / 2, 0, w, h, seed + 3, 1);
  if (t.snow) snowCap(ctx, -w / 2, h, w, h * 0.04, 0.8);
}

/** 油桶：两道箍 + 一个危险标志 + 一圈锈。 */
export function barrel(ctx, w, h, t, seed) {
  ctx.fillStyle = "rgba(6,9,16,.4)";
  ctx.beginPath();
  ctx.ellipse(0, 0.03, w * 0.5, 0.08, 0, 0, TAU);
  ctx.fill();
  const paint = hash2(seed, 11) < 0.5 ? "#c05a2c" : "#3f7a8c";
  ctx.fillStyle = hgrad(ctx, -w / 2, w / 2, h / 2, [
    [0, shade(paint, 0.34)], [0.34, paint], [0.76, shade(paint, -0.3)], [1, shade(paint, -0.5)],
  ]);
  ctx.fillRect(-w / 2, 0, w, h);
  ctx.fillStyle = shade(paint, -0.36);
  for (const f of [0.3, 0.66]) ctx.fillRect(-w / 2, h * f, w, h * 0.06);
  ctx.fillStyle = "rgba(255,255,255,.16)";
  ctx.fillRect(-w * 0.3, 0.05, w * 0.1, h - 0.1);
  ctx.fillStyle = "#f2c018";
  poly(ctx, [[-w * 0.16, h * 0.46], [w * 0.16, h * 0.46], [0, h * 0.78]], "#f2c018");
  rustPatch(ctx, -w / 2, 0, w, h, seed, 0.9);
}
