/**
 * **木头烂掉的两件彩蛋**：海崖公路边搁浅的破船、红杉林深处的图腾柱。
 *
 * 这两件凑在一起是有道理的：它们都是"木头在户外放了很多年"的样子。旧木头有一套
 * 固定的画法——板缝要跟着结构走（船身是弯的、柱子是直的）、每块板的深浅不能一样、
 * 起翘和劈裂要露在边角、靠地那一截一定有苔。把这几件事画出来，破船才像搁浅的船，
 * 而不是一只纸飞机。
 *
 * 共用零件在 `eggart.mjs`，另外六件在 `eggwild.mjs` / `eggurban.mjs` / `eggyard.mjs`。
 * 坐标系：米，y 向上，原点在接地点。
 */

import { TAU } from "../../sim/constants.mjs";
import { hash2 } from "../../sim/rng.mjs";
import { hgrad, poly, shade, tube } from "./art.mjs";
import { cracked, drift, mossy, plankLay, shadow } from "./eggart.mjs";

/**
 * 搁浅的破舢板：船头翘在沙上、船身缺了一块、一把桨插在沙里、船头还拴着一根桩。
 * 海崖公路的那一笔——这里离海不远，但离修船的人很远。
 */
export function boat(ctx, w, h, t, seed) {
  const wood = "#9a867b";
  shadow(ctx, 0, 0.05, w * 0.48, h * 0.08, 0.85);
  // 先铺一层沙：船是"陷在"沙里的，沙必须有一部分压在船底上，所以分前后两次画
  drift(ctx, 0, 0, w * 1.06, h * 0.15, "#e9dcbd", "#bfa77e", seed);

  // 船身的外轮廓。三处关键：**船头的柱是立起来的**（不是尖角）、**舷边几乎水平**
  // （只比船尾高一点）、**船底是一条平缓的弧**。上一版把舷边画得和船底一样弯，
  // 于是整条船成了一只香蕉。
  const hull = () => {
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, h * 0.8);
    ctx.quadraticCurveTo(-w * 0.54, h * 0.4, -w * 0.34, h * 0.14);
    ctx.quadraticCurveTo(0, h * 0.03, w * 0.32, h * 0.12);
    ctx.quadraticCurveTo(w * 0.45, h * 0.26, w * 0.46, h * 0.58);
    ctx.lineTo(w * 0.3, h * 0.63);
    ctx.quadraticCurveTo(0, h * 0.69, -w * 0.34, h * 0.76);
    ctx.closePath();
  };
  hull();
  ctx.fillStyle = "#79746a";
  ctx.fill();
  // 板缝：整块木板的画法裁进船形里，再补几道跟着船身走的弧缝
  ctx.save();
  hull();
  ctx.clip();
  plankLay(ctx, -w * 0.56, h * 0.02, w * 1.14, h * 0.72, 6, wood, seed);
  ctx.strokeStyle = "rgba(40,32,22,.4)";
  ctx.lineWidth = 0.022;
  for (let i = 0; i < 5; i++) {
    const y = h * (0.14 + i * 0.12);
    ctx.beginPath();
    ctx.moveTo(-w * 0.52, y + h * 0.16);
    ctx.quadraticCurveTo(0, y + h * 0.02, w * 0.5, y);
    ctx.stroke();
  }
  // 泡过水的那一截发黑发绿：水线以下是另一种木头
  ctx.fillStyle = hgrad(ctx, -w * 0.5, w * 0.5, h * 0.16, [
    [0, "rgba(26,42,32,.55)"], [0.5, "rgba(34,52,40,.32)"], [1, "rgba(28,42,32,.6)"],
  ]);
  ctx.fillRect(-w * 0.56, h * 0.02, w * 1.14, h * 0.2);
  // 舷边下面那道褪色的红漆线：老船都有，褪成粉的
  ctx.fillStyle = "rgba(152,74,60,.45)";
  ctx.fillRect(-w * 0.56, h * 0.5, w * 1.14, h * 0.05);
  ctx.restore();
  hull();
  ctx.strokeStyle = "rgba(10,14,20,.6)";
  ctx.lineWidth = 0.03;
  ctx.stroke();

  // 船里是开的：一条暗色的内舷带 + 五根肋 + 一块横座板
  ctx.fillStyle = "rgba(16,20,28,.78)";
  ctx.beginPath();
  ctx.moveTo(-w * 0.42, h * 0.74);
  ctx.quadraticCurveTo(0, h * 0.65, w * 0.28, h * 0.6);
  ctx.lineTo(w * 0.26, h * 0.5);
  ctx.quadraticCurveTo(0, h * 0.56, -w * 0.4, h * 0.64);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(126,110,82,.6)";
  ctx.lineWidth = 0.028;
  for (let i = 0; i < 5; i++) {
    const f = i / 4;
    const rx = -w * (0.3 - f * 0.56);
    ctx.beginPath();
    ctx.moveTo(rx, h * (0.71 - f * 0.1));
    ctx.quadraticCurveTo(rx + w * 0.01, h * (0.44 - f * 0.02), rx + w * 0.03, h * (0.2 - f * 0.1));
    ctx.stroke();
  }
  ctx.fillStyle = "#8d7a58";
  poly(ctx, [[-w * 0.14, h * 0.7], [w * 0.04, h * 0.66], [w * 0.04, h * 0.6], [-w * 0.14, h * 0.64]], ctx.fillStyle);
  ctx.fillStyle = "rgba(255,244,214,.16)";
  ctx.fillRect(-w * 0.14, h * 0.685, w * 0.18, h * 0.012);
  // 舷边那道压条：一条比船身亮的窄带，沿舷口走一遍
  ctx.strokeStyle = "#b3a184";
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(-w * 0.49, h * 0.79);
  ctx.quadraticCurveTo(0, h * 0.67, w * 0.3, h * 0.62);
  ctx.lineTo(w * 0.45, h * 0.575);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,246,220,.2)";
  ctx.lineWidth = 0.014;
  ctx.beginPath();
  ctx.moveTo(-w * 0.49, h * 0.8);
  ctx.quadraticCurveTo(0, h * 0.68, w * 0.45, h * 0.585);
  ctx.stroke();

  // 缺口：船头附近撕开的一块，洞口是翘起来的木刺
  poly(ctx, [[-w * 0.3, h * 0.36], [-w * 0.19, h * 0.31], [-w * 0.13, h * 0.42],
    [-w * 0.22, h * 0.46], [-w * 0.29, h * 0.42]], "#141920");
  poly(ctx, [[-w * 0.3, h * 0.36], [-w * 0.35, h * 0.38], [-w * 0.27, h * 0.32]], "#b8a688");
  poly(ctx, [[-w * 0.13, h * 0.42], [-w * 0.09, h * 0.45], [-w * 0.15, h * 0.465]], "#c2af91");

  // 断桅：一截立在船里的木桩，帆只剩一片撕裂的挂在上面
  tube(ctx, -w * 0.01, h * 0.56, -w * 0.02, h * 1.02, w * 0.03, "#8b7a5f", { bright: 0.36, edge: 0.014 });
  ctx.fillStyle = "rgba(228,224,210,.85)";
  poly(ctx, [[-w * 0.02, h * 1.0], [w * 0.13, h * 0.9], [w * 0.1, h * 0.86],
    [w * 0.14, h * 0.8], [w * 0.06, h * 0.76], [w * 0.08, h * 0.7], [-w * 0.01, h * 0.64]], ctx.fillStyle);
  ctx.fillStyle = "rgba(186,182,168,.7)";
  poly(ctx, [[w * 0.06, h * 0.76], [w * 0.14, h * 0.8], [w * 0.1, h * 0.86]], ctx.fillStyle);
  ctx.strokeStyle = "rgba(88,74,54,.8)";
  ctx.lineWidth = 0.018;
  ctx.beginPath();
  ctx.moveTo(-w * 0.02, h * 0.7);
  ctx.quadraticCurveTo(w * 0.16, h * 0.64, w * 0.4, h * 0.585);
  ctx.stroke();

  // 一把桨插在沙里，桨叶朝上：杆子细、桨叶宽，一眼能认出是桨
  tube(ctx, w * 0.44, h * 0.02, w * 0.4, h * 0.62, w * 0.022, "#8a7554", { bright: 0.34, edge: 0.01 });
  ctx.save();
  ctx.translate(w * 0.4, h * 0.62);
  ctx.rotate(-0.12);
  poly(ctx, [[-w * 0.02, 0], [w * 0.02, 0], [w * 0.045, h * 0.2],
    [0, h * 0.26], [-w * 0.045, h * 0.2]], "#9c8763");
  ctx.strokeStyle = "rgba(50,40,26,.6)";
  ctx.lineWidth = 0.016;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.02); ctx.lineTo(0, h * 0.24);
  ctx.stroke();
  ctx.restore();

  // 船头拴着的桩 + 一根垂下来的缆绳
  tube(ctx, -w * 0.46, 0, -w * 0.49, h * 0.4, w * 0.028, "#7a6446", { bright: 0.3, edge: 0.01 });
  ctx.strokeStyle = "rgba(200,182,142,.9)";
  ctx.lineWidth = 0.022;
  ctx.beginPath();
  ctx.moveTo(-w * 0.49, h * 0.38);
  ctx.quadraticCurveTo(-w * 0.55, h * 0.53, -w * 0.47, h * 0.72);
  ctx.stroke();
  ctx.fillStyle = "#8d8471";
  ctx.beginPath();
  ctx.arc(-w * 0.47, h * 0.735, w * 0.018, 0, TAU);
  ctx.fill();

  // 后一层沙：只埋住船底那一条，前面的沙纹跟着船身走
  drift(ctx, w * 0.1, 0, w * 1.0, h * 0.11, "#eddfc0", "#c4ac83", seed + 2);
  ctx.strokeStyle = "rgba(150,128,92,.38)";
  ctx.lineWidth = 0.02;
  for (let i = 0; i < 4; i++) {
    const rx = -w * 0.42 + i * w * 0.3;
    ctx.beginPath();
    ctx.moveTo(rx, h * 0.05);
    ctx.quadraticCurveTo(rx + w * 0.06, h * 0.11, rx + w * 0.14, h * 0.05);
    ctx.stroke();
  }
  // 挂在舷边的一绺海草（贴着船身，不许飘到沙中间）
  ctx.strokeStyle = "rgba(52,78,48,.75)";
  ctx.lineWidth = 0.024;
  for (let i = 0; i < 4; i++) {
    const sx = -w * 0.26 + i * w * 0.15;
    const sw = w * (0.02 + hash2(seed, i) * 0.03);
    ctx.beginPath();
    ctx.moveTo(sx, h * 0.3);
    ctx.quadraticCurveTo(sx + sw, h * 0.2, sx - sw * 0.4, h * 0.12);
    ctx.stroke();
  }
  // 藤壶：贴着水线的一层白点
  ctx.fillStyle = "rgba(226,222,208,.55)";
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.arc(-w * 0.36 + hash2(seed, i + 21) * w * 0.68, h * (0.2 + hash2(seed, i + 5) * 0.14),
      0.028 + hash2(seed, i + 33) * 0.026, 0, TAU);
    ctx.fill();
  }
}
/**
 * 木刻的那一件（图腾柱）在 `eggcarve.mjs`——它和这条船的共同点是木头，
 * 但它的画法完全是另一路（凿、漆、嵌贝壳），分开放两边都读得下去。
 */
