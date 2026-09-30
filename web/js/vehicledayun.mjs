/**
 * 大运重卡：整个游戏的笑点都压在这一台车上，所以它必须是**迎面**的画法。
 *
 * 它在 `traffic.mjs` 里永远是 `dir = -1`（对向车道朝你冲过来），也就是说玩家
 * 这辈子不可能看到它的车尾。画面和玩法在这里必须一致：一个"你迎面撞上它"的
 * 场景，配着一台永远给你看车头的车。
 *
 * 现在的读法自上而下，和真人站在车前看到的一样：**高出驾驶室一截的集装箱**、
 * **两片式风挡 + 雨刷**、**镀铬横条格栅**、**黄黑斜纹的前保险杠**（中国重卡最
 * 好认的那一笔）、**两只暖白大灯**、以及车顶一排橙色示廓灯。宽和高全部来自
 * `traffic.mjs` 的碰撞表，画多宽就是撞多宽。
 *
 * 被踹之后这台车**不能只是转着飞**——一脚踹在大运的驾驶室侧面，先瘪进去的是
 * 车门，然后是集装箱被挤歪、格栅掉下来、保险杠挂在地上。所以这台车的伤是
 * 分五处画出来的（见 `hit` 段落），而 `dmg` 从 0 涨到 1 的过程就是这一脚的慢镜头。
 */

import { bloom, hgrad, shade, sheen, vgrad } from "./art.mjs";
import {
  CAB, GLASS, HEAD_LAMP, INK, circle, dent, gash, lamp, plate, roundRect, shatter,
  tornBumper, wheel, wrinkles,
} from "./vehicleparts.mjs";

export function drawDayun(ctx, w, h, dmg = 0) {
  const W2 = w / 2;
  const k = Math.min(1, Math.max(0, dmg));
  // 被踹进去的侧面：整台车朝受力那一侧塌一点。这是"砸瘪"的总量。
  const sag = 1 - k * 0.12;

  // 前轮：从正面看，一台重卡"重"的证据就是两个又高又宽的轮胎
  wheel(ctx, -W2 - 0.06, 0.04, 0.94, 0.36);
  wheel(ctx, W2 + 0.06, 0.04, 0.94, 0.36);

  // ① 集装箱：只从驾驶室顶上露出**一截**（露多了就变成扰流板），正面是那面竖楞墙
  const boxTop = h * 0.845 * sag;
  ctx.fillStyle = shade("#7d8798", -0.52);
  roundRect(ctx, -W2 - 0.06, boxTop, w + 0.12, h - boxTop, 0.05);
  ctx.fillStyle = hgrad(ctx, -W2, W2, boxTop, [
    [0, "#aab4c4"], [0.42, "#828d9e"], [1, "#59636f"],
  ]);
  roundRect(ctx, -W2 - 0.03, boxTop, w + 0.06, h - boxTop, 0.04);
  ctx.fillStyle = "rgba(12,16,26,.26)";
  for (let x = -W2 + 0.28; x < W2; x += 0.42) {
    ctx.fillRect(x, boxTop + h * 0.012, 0.05, h - boxTop - h * 0.03);
  }
  ctx.fillStyle = "rgba(255,255,255,.16)";
  ctx.fillRect(-W2 - 0.03, h * 0.992, w + 0.06, 0.022);
  ctx.fillStyle = "rgba(8,11,18,.5)";
  ctx.fillRect(-W2 - 0.03, boxTop, w + 0.06, 0.03);
  // 集装箱被挤歪：右上角塌一块、竖楞扭成折线
  if (k > 0.3) {
    ctx.fillStyle = "rgba(8,11,18,.4)";
    ctx.beginPath();
    ctx.moveTo(W2 - w * 0.22, h);
    ctx.lineTo(W2, h - (h - boxTop) * (0.3 + k * 0.4));
    ctx.lineTo(W2, h);
    ctx.closePath();
    ctx.fill();
    wrinkles(ctx, -W2 + 0.2, W2 - 0.2, boxTop + 0.1, h - 0.1, Math.round(2 + k * 3), k);
  }

  // ② 驾驶室：大运那身橙漆，左亮右暗
  ctx.fillStyle = INK;
  roundRect(ctx, -W2 - 0.09, 0.2, w + 0.18, h * 0.655 * sag, 0.1);
  ctx.fillStyle = vgrad(ctx, 0, 0.26, boxTop, [
    [0, shade(CAB, -0.5)], [0.4, CAB], [1, shade(CAB, 0.14)],
  ]);
  roundRect(ctx, -W2, 0.26, w, h * 0.585 * sag, 0.09);
  ctx.fillStyle = hgrad(ctx, -W2, W2, h * 0.5, [
    [0, "rgba(255,255,255,.2)"], [0.44, "rgba(255,255,255,0)"], [1, "rgba(0,0,0,.32)"],
  ]);
  roundRect(ctx, -W2, 0.26, w, h * 0.585 * sag, 0.09);

  // ③ 遮阳板 + 车顶那排橙色示廓灯：夜里老远就能认出"前面是个大家伙"
  ctx.fillStyle = "rgba(10,14,22,.8)";
  ctx.fillRect(-w * 0.46, h * 0.775, w * 0.92, h * 0.038);
  for (let i = -2; i <= 2; i++) {
    ctx.fillStyle = i === 0 && k > 0.5 ? "#8a5a2a" : "#ffab2e";
    circle(ctx, i * 0.4, h * 0.827, 0.058);
  }

  // ④ 两片式风挡：深色玻璃 + 中间立柱 + 两把雨刷
  ctx.fillStyle = INK;
  roundRect(ctx, -w * 0.42, h * 0.46, w * 0.84, h * 0.31, 0.06);
  ctx.fillStyle = GLASS;
  roundRect(ctx, -w * 0.39, h * 0.48, w * 0.78, h * 0.27, 0.05);
  if (k > 0.35) shatter(ctx, -w * 0.39, h * 0.48, w * 0.78, h * 0.27);
  else sheen(ctx, -w * 0.39, h * 0.48, w * 0.78, h * 0.27, 0.2);
  ctx.fillStyle = "rgba(10,14,22,.75)";
  ctx.fillRect(-0.035, h * 0.48, 0.07, h * 0.27);
  ctx.fillStyle = "rgba(228,236,248,.5)";
  for (const side of [-1, 1]) ctx.fillRect(side * w * 0.22 - 0.03, h * 0.5, 0.05, h * 0.19);
  // 碎玻璃飞掉之后，风挡后面能看见驾驶室里的一张脸（一块影子就够了）
  if (k > 0.6) {
    ctx.fillStyle = "rgba(232,240,252,.22)";
    circle(ctx, -w * 0.16, h * 0.6, 0.13);
    circle(ctx, w * 0.16, h * 0.6, 0.13);
  }

  // ⑤ 格栅：三道镀铬横条，中间一块小标牌
  ctx.fillStyle = "rgba(12,16,24,.92)";
  roundRect(ctx, -w * 0.34, h * 0.29, w * 0.68, h * 0.16, 0.04);
  ctx.fillStyle = "#b9c2d0";
  for (let i = 0; i < 3; i++) ctx.fillRect(-w * 0.31, h * 0.305 + i * h * 0.042, w * 0.62, h * 0.016);
  ctx.fillStyle = CAB;
  roundRect(ctx, -0.3, h * 0.345, 0.6, 0.16, 0.03);
  ctx.fillStyle = "rgba(255,255,255,.6)";
  ctx.fillRect(-0.22, h * 0.345 + 0.07, 0.44, 0.03);

  // ⑥ 前保险杠：黄黑斜纹。中国重卡最好认的一笔，也是"这东西不好惹"的信号
  ctx.fillStyle = "#22262f";
  roundRect(ctx, -W2 - 0.04, 0.2, w + 0.08, 0.3, 0.06);
  ctx.save();
  roundRect(ctx, -W2, 0.22, w, 0.24, 0.04);
  ctx.clip();
  ctx.fillStyle = "#f2c018";
  ctx.fillRect(-W2, 0.22, w, 0.24);
  ctx.fillStyle = "#16181f";
  for (let i = -1; i < 9; i++) {
    const x0 = -W2 + i * 0.52;
    ctx.beginPath();
    ctx.moveTo(x0, 0.46); ctx.lineTo(x0 + 0.26, 0.46);
    ctx.lineTo(x0 + 0.5, 0.22); ctx.lineTo(x0 + 0.24, 0.22);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // ⑦ 大灯：两只暖白的方灯 + 一圈镀铬，转向灯是旁边那颗小琥珀
  for (const side of [-1, 1]) {
    const x = side * w * 0.36;
    ctx.fillStyle = INK;
    roundRect(ctx, x - 0.26, 0.58, 0.52, 0.28, 0.05);
    // 被踹过之后有一边的灯灭了——一台还在飞的重卡不该两盏灯都亮着
    if (k > 0.45 && side > 0) {
      ctx.fillStyle = "#20242c";
      roundRect(ctx, x - 0.22, 0.61, 0.44, 0.22, 0.04);
      gash(ctx, x, 0.7, 0.34, 0.3);
    } else {
      lamp(ctx, x, 0.61, 0.44, 0.22, -1);
    }
    bloom(ctx, x, 0.72, side > 0 && k > 0.45 ? 0.16 : 0.62, "rgba(255,246,207,.5)", 0.9);
    ctx.fillStyle = "#ffab2e";
    roundRect(ctx, side * (W2 - 0.16) - 0.1, 0.63, 0.2, 0.16, 0.03);
  }
  if (k > 0.5) tornBumper(ctx, w, 0.24, k);
  else plate(ctx, 0.35, 0.3);
  // 后视镜：从正面看到的是两块镜背，挂在驾驶室两侧
  for (const side of [-1, 1]) {
    const x = side * (W2 + 0.1);
    ctx.fillStyle = "rgba(12,16,24,.85)";
    ctx.fillRect(x - 0.03, h * 0.5, 0.06, h * 0.26);
    // 受力那一侧的镜子被踹飞了：这是"那一脚从哪儿来"的提示
    const goneMirror = k > 0.5 && side > 0;
    ctx.fillStyle = goneMirror ? "rgba(12,16,24,.3)" : "#8b93a3";
    roundRect(ctx, x - 0.12, h * 0.74, 0.24, h * 0.12, 0.03);
    if (!goneMirror) {
      ctx.fillStyle = "rgba(255,255,255,.22)";
      ctx.fillRect(x - 0.12, h * 0.74, 0.24, 0.02);
    }
  }

  // ⑧ 最后一道工序：踹进去的那一大块。位置固定在驾驶室右侧车门——
  //    也就是玩家从左边超车、一脚踹过去时脚尖到达的地方。
  if (k > 0.05) {
    dent(ctx, w * 0.24, h * 0.3, w * 0.5, h * 0.3, k);
    if (k > 0.7) {
      gash(ctx, -w * 0.3, h * 0.5, w * 0.5, 0.2, true);
      ctx.fillStyle = "rgba(255,255,255,.5)";
      circle(ctx, 0, 0.66, 0.07);
    }
  }
}

/** 大运被踹之后那一眼的成本表：给测试看的（也是给下一个人看的）。 */
export const DAYUN_DAMAGE_MARKS = ["shatter", "dent", "gash", "tornBumper", "darkLamp"];
export const DAYUN_HEADLAMP = HEAD_LAMP;
