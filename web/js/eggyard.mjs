/**
 * **院子里的两件彩蛋**：荒野尽头那户人家的信箱、工业支线上拦路的警示牌。
 *
 * 这两件是"人留下的痕迹"里最没意思、也最有用的两件——它们的作用不是好笑，
 * 而是**把一条路的世界观补齐**：荒野公路一直开下去本该是彻底的荒，路边却立着
 * 一个塞着报纸的信箱，那一瞬间你就知道"前面有人住"；工业区的黄黑斜条牌则相反，
 * 它在说"再往前是别人家的地界"。
 *
 * 画法上它们共享一件事：**都是杆子上的东西**。杆子要画旧（木纹、锈、底下的草），
 * 挂上去的那件东西要有正面、有侧面、有一处亮色，否则就是一块贴在空中的卡片。
 *
 * 共用零件在 `eggart.mjs`，另外六件在 `eggwild.mjs` / `eggwood.mjs` / `eggurban.mjs`。
 * 坐标系：米，y 向上，原点在接地点。
 */

import { TAU } from "../../sim/constants.mjs";
import { hash2 } from "../../sim/rng.mjs";
import { hgrad, poly, shade } from "./art.mjs";
import { label3d, rustPatch } from "./parts.mjs";
import { shadow, timber } from "./eggart.mjs";

/**
 * 乡村信箱：一根旧木桩，桩上顶着一个圆顶信箱，红白小旗立着、报纸塞在门缝里。
 * 荒野公路尽头那一句"前面有人住"。
 */
export function mailbox(ctx, w, h, t, seed) {
  shadow(ctx, 0, 0.04, w * 0.36, h * 0.03, 0.85);
  timber(ctx, 0, w * 0.14, h * 0.72, t.wood, seed);
  // 桩底的一丛草
  ctx.strokeStyle = "rgba(110,132,74,.8)";
  ctx.lineWidth = 0.02;
  for (let i = 0; i < 5; i++) {
    const gx = -w * 0.16 + i * w * 0.08;
    ctx.beginPath();
    ctx.moveTo(gx, h * 0.02);
    ctx.quadraticCurveTo(gx - w * 0.03, h * 0.07, gx - w * 0.09, h * 0.09);
    ctx.stroke();
  }

  // ---- 信箱本体：圆顶 + 平底 ----
  const by = h * 0.7, bw = w * 0.86, bh = h * 0.26;
  const dome = () => {
    ctx.beginPath();
    ctx.moveTo(-bw / 2, by);
    ctx.quadraticCurveTo(-bw / 2, by + bh * 1.22, 0, by + bh * 1.22);
    ctx.quadraticCurveTo(bw / 2, by + bh * 1.22, bw / 2, by);
    ctx.closePath();
  };
  dome();
  ctx.fillStyle = hgrad(ctx, -bw / 2, bw / 2, by + bh * 0.5, [
    [0, "#9aa5b2"], [0.28, "#7d8894"], [0.7, "#525b66"], [1, "#2f353d"],
  ]);
  ctx.fill();
  // 顶面那道高光：金属壳子是圆的，圆顶不点高光就是一顶帽子
  ctx.fillStyle = "rgba(255,255,255,.28)";
  ctx.beginPath();
  ctx.ellipse(-bw * 0.14, by + bh * 0.92, bw * 0.24, bh * 0.16, -0.3, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(10,14,20,.55)";
  ctx.lineWidth = 0.02;
  dome();
  ctx.stroke();
  // 底板 + 门缝 + 铰链 + 搭扣
  ctx.fillStyle = "#2b3038";
  ctx.fillRect(-bw / 2, by - bh * 0.1, bw, bh * 0.14);
  ctx.fillStyle = "rgba(255,255,255,.14)";
  ctx.fillRect(-bw / 2, by + bh * 0.02, bw, bh * 0.04);
  ctx.fillStyle = "#1e222a";
  ctx.fillRect(-bw * 0.06, by + bh * 0.06, bw * 0.12, bh * 0.72);
  ctx.fillStyle = "#8b939e";
  ctx.beginPath();
  ctx.arc(bw * 0.26, by + bh * 0.16, bw * 0.035, 0, TAU);
  ctx.fill();
  ctx.fillRect(bw * 0.23, by + bh * 0.16, bw * 0.06, bh * 0.06);
  // 锈：圆顶的下半边最容易锈
  rustPatch(ctx, -bw * 0.44, by + bh * 0.05, bw * 0.5, bh * 0.5, seed + 5, 0.8);

  // ---- 塞在门缝里的报纸 ----
  ctx.fillStyle = "#e8e2d2";
  poly(ctx, [[bw * 0.18, by + bh * 0.5], [bw * 0.56, by + bh * 0.1],
    [bw * 0.52, by + bh * 0.04], [bw * 0.16, by + bh * 0.4]], ctx.fillStyle);
  ctx.fillStyle = "rgba(90,80,66,.5)";
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(bw * (0.24 + i * 0.06), by + bh * (0.38 - i * 0.1), bw * 0.16, bh * 0.03);
  }

  // ---- 立起来的小旗 ----
  ctx.fillStyle = "#c8563f";
  ctx.fillRect(bw * 0.34, by + bh * 0.25, w * 0.05, bh * 0.8);
  ctx.fillRect(bw * 0.34, by + bh * 0.25, w * 0.17, bh * 0.3);
  ctx.fillStyle = "#a8422f";
  ctx.fillRect(bw * 0.34, by + bh * 0.25, w * 0.17, bh * 0.09);
}

/**
 * 工地警示牌：黄黑斜条 + 一盏亮着的黄灯。工业支线上那一句"别过去"。
 *
 * 顶上那盏灯是它的全部意义——**没有那点光，它就只是一块牌子**。
 */
export function warnsign(ctx, w, h, t, seed) {
  shadow(ctx, 0, 0.05, w * 0.42, h * 0.03, 0.9);
  // A 字支架：两条腿往里收，脚上踩着泥
  ctx.strokeStyle = "#7d848e";
  ctx.lineWidth = w * 0.07;
  ctx.beginPath();
  ctx.moveTo(-w * 0.36, 0); ctx.lineTo(-w * 0.16, h * 0.5);
  ctx.moveTo(w * 0.36, 0); ctx.lineTo(w * 0.16, h * 0.5);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,.22)";
  ctx.lineWidth = w * 0.022;
  ctx.beginPath();
  ctx.moveTo(-w * 0.34, h * 0.06); ctx.lineTo(-w * 0.17, h * 0.48);
  ctx.moveTo(w * 0.34, h * 0.06); ctx.lineTo(w * 0.17, h * 0.48);
  ctx.stroke();
  ctx.fillStyle = "rgba(72,60,44,.6)";
  ctx.beginPath();
  ctx.ellipse(-w * 0.36, h * 0.012, w * 0.07, h * 0.012, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w * 0.36, h * 0.012, w * 0.07, h * 0.012, 0, 0, TAU);
  ctx.fill();
  // 牌面
  const py = h * 0.5, ph = h * 0.44;
  ctx.fillStyle = "#f0c020";
  poly(ctx, [[-w * 0.46, py], [w * 0.46, py], [w * 0.4, py + ph], [-w * 0.4, py + ph]], ctx.fillStyle);
  // 黄黑斜条：**裁进牌面**，不然斜条会画到牌子外面去
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-w * 0.46, py); ctx.lineTo(w * 0.46, py);
  ctx.lineTo(w * 0.4, py + ph); ctx.lineTo(-w * 0.4, py + ph);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = "#1d1b18";
  // 每一根都**按牌面边界裁好**再画。`clip` 只管画面不管贴图——画家把一笔甩到
  // 两米外，这块贴图就得按两米宽去开，牌子本身在贴图里只剩巴掌大一点。
  // 所以这里主动把四个角夹回牌面：上下两条边的半宽不一样（梯形），夹的时候
  // 也分开夹，斜条就自然收在牌子里了。
  const topHalf = w * 0.46, botHalf = w * 0.4, lean = h * 0.2;
  const clampAt = (x, half) => Math.max(-half, Math.min(half, x));
  for (let i = -3; i < 6; i++) {
    const a = -w * 0.46 + i * w * 0.26, b = a + w * 0.12;
    poly(ctx, [
      [clampAt(a, topHalf), py], [clampAt(b, topHalf), py],
      [clampAt(b - lean, botHalf), py + ph], [clampAt(a - lean, botHalf), py + ph],
    ], ctx.fillStyle);
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(20,18,14,.5)";
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  ctx.moveTo(-w * 0.46, py); ctx.lineTo(w * 0.46, py);
  ctx.stroke();
  // 牌面上被石子崩掉的一块漆
  ctx.fillStyle = "rgba(120,104,70,.5)";
  poly(ctx, [[-w * 0.3, py + ph * 0.2], [-w * 0.22, py + ph * 0.16], [-w * 0.24, py + ph * 0.32],
    [-w * 0.32, py + ph * 0.3]], ctx.fillStyle);
  rustPatch(ctx, -w * 0.44, py + ph * 0.02, w * 0.9, ph * 0.24, seed + 2, 0.7);

  // 顶上那盏转个不停的黄灯
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(-w * 0.1, py - h * 0.09, w * 0.2, h * 0.09);
  ctx.fillStyle = "rgba(255,255,255,.18)";
  ctx.fillRect(-w * 0.1, py - h * 0.09, w * 0.05, h * 0.09);
  const g = ctx.createRadialGradient(0, py - h * 0.1, 0, 0, py - h * 0.1, w * 0.5);
  g.addColorStop(0, "rgba(255,214,80,.85)");
  g.addColorStop(1, "rgba(255,214,80,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, py - h * 0.1, w * 0.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#ffd750";
  ctx.beginPath();
  ctx.arc(0, py - h * 0.1, w * 0.11, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.7)";
  ctx.beginPath();
  ctx.arc(-w * 0.035, py - h * 0.075, w * 0.035, 0, TAU);
  ctx.fill();
  // 灯下面还有一行小字条（工地牌的常见配置）
  ctx.fillStyle = "#e8e0c8";
  ctx.fillRect(-w * 0.2, py + ph * 0.62, w * 0.4, h * 0.05);
  label3d(ctx, 0, py + ph * 0.65, h * 0.038, "施工", "#3a2a20");
  // 脚下踢散的两块碎砖：牌子底下有一小堆，才像"工地"而不是"道具"
  for (let i = 0; i < 3; i++) {
    const bx = -w * 0.44 + hash2(seed, i) * w * 0.2;
    ctx.fillStyle = i % 2 ? "#a15a44" : "#8a6a52";
    ctx.beginPath();
    ctx.ellipse(bx + w * 0.36, h * 0.02, w * 0.05, h * 0.014, 0, 0, TAU);
    ctx.fill();
  }
}
