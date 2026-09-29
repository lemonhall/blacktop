/**
 * 路边**长出来的东西**：阔叶树、松、红杉、棕榈、仙人掌、枯树、树桩。
 *
 * 这一组是速度和季节的主要来源——红杉林道的"两米一棵"和沙漠干道的"一眼望不到头"
 * 靠的都是它们的密度与形状。所以每一棵都按能拆的层数拆开画：
 * **树干/主干 → 枝 → 冠**，雪原再叠一层雪，沙漠再叠一层枯。
 *
 * 散在**地面上**的那些（原木堆、石头、草垛、风滚草）搬去了 `propsrock.mjs`：
 * 植物靠体积感，地上的东西靠轮廓的碎，是两套画法。
 *
 * 坐标系：米，y 向上，原点在接地点，横向以 0 为轴。
 */

import { TAU } from "../../sim/constants.mjs";
import { hash2 } from "../../sim/rng.mjs";
import { hgrad, poly, shade } from "./art.mjs";
import { snowCap } from "./parts.mjs";

/** 一根树干：左亮右暗 + 两三道竖纹。所有树共用它。 */
function trunk(ctx, w, h, base, seed = 1, x = 0) {
  ctx.fillStyle = hgrad(ctx, x - w / 2, x + w / 2, h / 2, [
    [0, shade(base, 0.3)], [0.36, base], [1, shade(base, -0.46)],
  ]);
  ctx.fillRect(x - w / 2, 0, w, h);
  ctx.fillStyle = "rgba(0,0,0,.22)";
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(x - w / 2 + w * (0.2 + i * 0.28), h * 0.1 + hash2(seed, i) * h * 0.1,
      w * 0.09, h * (0.5 + hash2(seed, i + 9) * 0.34));
  }
  // 根部外扩：没有这一圈，树干像插在路面里的棍子
  ctx.fillStyle = shade(base, -0.2);
  poly(ctx, [
    [x - w * 0.62, 0], [x + w * 0.62, 0], [x + w * 0.42, h * 0.09], [x - w * 0.42, h * 0.09],
  ], shade(base, -0.24));
}

/** 阔叶树：一个主冠 + 四到六个副冠，每个球左亮右暗，顶上加几笔叶尖。 */
export function tree(ctx, w, h, t, seed) {
  trunk(ctx, w * 0.15, h * 0.44, t.trunk, seed);
  // 两根分枝，让树冠不是"浮"在树干上
  ctx.strokeStyle = shade(t.trunk, -0.16);
  ctx.lineWidth = Math.max(0.08, w * 0.05);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, h * 0.34);
    ctx.lineTo(side * w * 0.24, h * 0.56);
    ctx.stroke();
  }
  const blobs = 5;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * TAU + 0.6;
    const bx = Math.cos(a) * w * (0.2 + hash2(seed, i) * 0.16);
    const by = h * (0.62 + Math.sin(a) * 0.14) + hash2(seed, i + 5) * h * 0.05;
    const r = w * (0.26 + hash2(seed, i + 11) * 0.14);
    ctx.fillStyle = hgrad(ctx, bx - r, bx + r, by, [
      [0, shade(t.leaf2, 0.32)], [0.34, t.leaf2], [0.7, t.leaf], [1, shade(t.leaf, -0.34)],
    ]);
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(180,235,200,.14)";
    ctx.beginPath();
    ctx.arc(bx - r * 0.3, by + r * 0.34, r * 0.42, 0, TAU);
    ctx.fill();
  }
  // 树尖：两三片叶子，破了这个圆就立刻像树
  ctx.fillStyle = shade(t.leaf, 0.06);
  poly(ctx, [
    [-w * 0.1, h * 0.86], [0, h], [w * 0.12, h * 0.84],
  ], shade(t.leaf, 0.04));
}

/** 针叶树（雪松/冷杉）：一层压一层的伞，雪原上每一层都压一道白。 */
export function pine(ctx, w, h, t, seed) {
  trunk(ctx, w * 0.11, h * 0.3, t.trunk, seed);
  const layers = 6;
  for (let i = 0; i < layers; i++) {
    const f = i / (layers - 1);
    const y = h * (0.18 + f * 0.7);
    const rw = w * (0.52 - f * 0.3) * (0.9 + hash2(seed, i) * 0.2);
    const th = h * 0.2;
    ctx.fillStyle = hgrad(ctx, -rw, rw, y, [
      [0, shade(t.leaf2, 0.3)], [0.3, t.leaf2], [0.66, t.leaf], [1, shade(t.leaf, -0.42)],
    ]);
    poly(ctx, [
      [0, y + th], [-rw, y], [-rw * 0.4, y + th * 0.06],
      [0, y + th * 0.16], [rw * 0.4, y + th * 0.06], [rw, y],
    ], ctx.fillStyle);
    if (i % 2 === 0) {
      ctx.strokeStyle = "rgba(200,240,214,.14)";
      ctx.lineWidth = 0.03;
      ctx.beginPath();
      ctx.moveTo(-rw * 0.9, y + th * 0.06);
      ctx.lineTo(0, y + th * 0.16);
      ctx.lineTo(rw * 0.9, y + th * 0.06);
      ctx.stroke();
    }
    if (t.snow) snowCap(ctx, -rw * 0.86, y + th * 0.1, rw * 1.72, h * 0.045, 0.8);
  }
}

/**
 * 红杉：二十四米高的一根柱子，树冠从**下三分之一就起头**，一路收到顶。
 *
 * 上一版把树干定成 `0.34 × 宽`，而红杉的道具宽度是 3.6 米——于是路边立着一根
 * 一米二的褐色方柱，树冠只长在顶上三成，跑起来看就是"一根电线杆顶了棵小树"。
 * 真树的树干只有半米出头，而且下三分之一就分出枝叶，越往上越短。底部再补一圈
 * 根盘：那么高的树，没有根盘撑不住。
 */
export function redwood(ctx, w, h, t, seed) {
  const bw = w * 0.16;
  const bark = ["#7a4a2e", "#5c3520", "#3c2314", "#241309"];
  // 根盘：往外散开的裙边，底下压着一圈影
  ctx.fillStyle = shade(bark[1], -0.24);
  poly(ctx, [[-bw * 2.1, 0], [bw * 2.1, 0], [bw * 0.6, h * 0.028], [-bw * 0.6, h * 0.028]],
    shade(bark[1], -0.24));
  ctx.fillStyle = "rgba(6,9,16,.32)";
  ctx.beginPath();
  ctx.ellipse(0, 0.05, bw * 2.4, h * 0.008, 0, 0, TAU);
  ctx.fill();
  // 树干：六段，一段比一段细
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const f0 = i / segs, f1 = (i + 1) / segs;
    const w0 = bw * (1.16 - f0 * 0.5), w1 = bw * (1.16 - f1 * 0.5);
    ctx.fillStyle = hgrad(ctx, -w0 / 2, w0 / 2, h * f0, [
      [0, bark[0]], [0.28, bark[1]], [0.72, bark[2]], [1, bark[3]],
    ]);
    poly(ctx, [[-w0 / 2, h * f0], [w0 / 2, h * f0], [w1 / 2, h * f1], [-w1 / 2, h * f1]], ctx.fillStyle);
  }
  // 树皮：竖沟，长的短的错开
  ctx.fillStyle = "rgba(0,0,0,.32)";
  for (let i = 0; i < 5; i++) {
    const x = -bw * 0.42 + bw * (i / 4.2);
    const y0 = h * (0.02 + hash2(seed, i) * 0.06);
    ctx.fillRect(x, y0, bw * 0.06, h * (0.3 + hash2(seed, i + 7) * 0.4));
  }
  // 树冠：九层，越往上越窄；下面几层被树干劈成左右两片
  for (let i = 0; i < 9; i++) {
    const f = i / 9;
    const y = h * (0.3 + f * 0.66);
    const rw = w * (0.5 - f * 0.32) * (0.86 + hash2(seed, i + 20) * 0.28);
    const green = hgrad(ctx, -rw, rw, y, [
      [0, shade(t.leaf2, 0.26)], [0.4, t.leaf], [1, shade(t.leaf, -0.44)],
    ]);
    const tip = y + h * (0.1 - f * 0.04);
    if (f < 0.42) {
      poly(ctx, [
        [-rw * 0.12, tip], [-rw, y - h * 0.012], [rw * 0.12, y - h * 0.012], [rw * 0.12, tip],
      ], green);
    } else {
      poly(ctx, [[0, tip], [-rw, y - h * 0.012], [rw, y - h * 0.012]], green);
    }
  }
}

/** 棕榈：弯的树干 + 七片下垂的叶。海崖公路的那一笔。 */
export function palm(ctx, w, h, t, seed) {
  const bend = w * 0.28;
  ctx.fillStyle = hgrad(ctx, -w * 0.08, w * 0.08, h * 0.5, [
    [0, "#b08b5c"], [0.4, "#8a6a44"], [1, "#4e3a24"],
  ]);
  const seg = 9;
  for (let i = 0; i < seg; i++) {
    const f0 = i / seg, f1 = (i + 1) / seg;
    ctx.fillRect(bend * f0 * f0 - w * 0.055, h * f0 * 0.82, w * 0.11, h * (f1 - f0) * 0.84 + 0.02);
  }
  const tx = bend, ty = h * 0.82;
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * 2.5;
    const len = w * (0.62 + hash2(seed, i) * 0.3);
    const ex = tx + Math.sin(a) * len;
    const ey = ty + Math.cos(a) * len * 0.42 - len * 0.14;
    ctx.fillStyle = i % 2
      ? hgrad(ctx, tx, ex, ty, [[0, shade(t.leaf2, 0.2)], [1, t.leaf]])
      : t.leaf2;
    poly(ctx, [
      [tx, ty + 0.1], [ex, ey + 0.22], [ex + len * 0.1, ey - 0.1], [tx, ty - 0.12],
    ], ctx.fillStyle);
  }
  ctx.fillStyle = "#8a6a44";
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(tx + (i - 1) * 0.22, ty - 0.1, 0.14, 0, TAU);
    ctx.fill();
  }
}

/** 仙人掌（巨人柱）：主干 + 两条胳膊 + 竖棱 + 刺 + 顶上一朵花。 */
export function cactus(ctx, w, h, t, seed) {
  const bw = w * 0.42;
  const body = hgrad(ctx, -bw / 2, bw / 2, h * 0.5, [
    [0, shade(t.leaf2, 0.34)], [0.34, t.leaf2], [0.76, t.leaf], [1, shade(t.leaf, -0.4)],
  ]);
  ctx.fillStyle = body;
  ctx.fillRect(-bw / 2, 0, bw, h * 0.96);
  ctx.beginPath();
  ctx.arc(0, h * 0.96, bw / 2, 0, Math.PI);
  ctx.fill();
  for (const side of [-1, 1]) {
    const ax = side * bw * 0.62;
    const ah = h * (0.42 + hash2(seed, side + 2) * 0.18);
    const ay = h * 0.34;
    ctx.fillStyle = body;
    ctx.fillRect(ax - bw * 0.16, ay, bw * 0.32, ah);
    ctx.fillRect(ax - bw * 0.16 + side * -bw * 0.6, ay + ah - bw * 0.32, bw * 0.76, bw * 0.32);
    ctx.beginPath();
    ctx.arc(ax, ay + ah, bw * 0.16, 0, Math.PI);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(0,0,0,.22)";
  for (let i = -1; i <= 1; i++) ctx.fillRect(i * bw * 0.26 - 0.012, h * 0.06, 0.024, h * 0.82);
  ctx.fillStyle = "rgba(255,255,255,.28)";
  for (let i = 0; i < 16; i++) {
    const sy = h * (0.08 + (i / 16) * 0.84);
    ctx.fillRect(-bw * 0.54, sy, 0.09, 0.02);
    ctx.fillRect(bw * 0.44, sy + h * 0.03, 0.09, 0.02);
  }
  // 顶上一朵花：**小**。上一版是一颗 0.44 米的粉球，远看就是个棒棒糖。
  const bloom = ["#ff8fb8", "#ffd27a", "#ff6f9c"][Math.floor(hash2(seed, 31) * 3) % 3];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    ctx.fillStyle = i % 2 ? bloom : shade(bloom, -0.22);
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * w * 0.035, h * 0.985 + Math.sin(a) * w * 0.022,
      w * 0.032, w * 0.019, a, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = "#ffe9a8";
  ctx.beginPath();
  ctx.arc(0, h * 0.985, w * 0.018, 0, TAU);
  ctx.fill();
}

/** 枯树：只剩骨架，两三级分叉。沙漠和荒野上"没救了"的那一笔。 */
export function deadtree(ctx, w, h, t, seed) {
  const base = shade(t.trunk, -0.18);
  ctx.strokeStyle = base;
  ctx.lineCap = "round";
  const draw = (x0, y0, x1, y1, th, depth) => {
    ctx.lineWidth = th;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    if (depth <= 0) return;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const spread = w * 0.34 * (0.6 + hash2(seed, depth * 7) * 0.8);
    draw(mx, my, mx - spread, my + (y1 - y0) * 0.7, th * 0.62, depth - 1);
    draw(mx, my, mx + spread * 0.8, my + (y1 - y0) * 0.8, th * 0.62, depth - 1);
  };
  draw(0, 0, 0, h * 0.56, Math.max(0.1, w * 0.13), 3);
  ctx.fillStyle = "rgba(6,9,16,.34)";
  ctx.fillRect(-w * 0.16, 0, w * 0.32, 0.07);
}

/** 树桩：年轮 + 一圈翻起来的土。 */
export function stump(ctx, w, h, t, seed) {
  ctx.fillStyle = hgrad(ctx, -w / 2, w / 2, h / 2, [
    [0, shade(t.trunk, 0.24)], [0.36, t.trunk], [1, shade(t.trunk, -0.5)],
  ]);
  ctx.fillRect(-w * 0.38, 0, w * 0.76, h * 0.86);
  ctx.fillStyle = "rgba(6,9,16,.34)";
  ctx.fillRect(-w * 0.5, 0, w, 0.07);
  ctx.fillStyle = "#c9ac7e";
  ctx.beginPath();
  ctx.ellipse(0, h * 0.88, w * 0.38, h * 0.11, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(120,92,58,.7)";
  ctx.lineWidth = 0.026;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.ellipse(0, h * 0.88, w * 0.38 * (i / 4), h * 0.11 * (i / 4), 0, 0, TAU);
    ctx.stroke();
  }
  ctx.fillStyle = "#6f8a3e";
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(-w * 0.5 + hash2(seed, i) * w, h * 0.02, 0.14, 0.06);
  }
}
