/**
 * 屏幕上那一层：速度线、暗角、挨打那一闪、倒数和播报。
 *
 * 它们的共同点是**不参与世界坐标**——`cam` 只用来知道画面多大、地平线在哪。
 * 和世界里的东西分开写，是为了让"这一层可以随便改"在文件上也成立：调暗角、
 * 调闪烁不必翻一整条渲染管线。
 */

import { FX, S } from "./state.mjs";
import { drawSpeedLines, speedStrength } from "./speedlines.mjs";

/** 前景：倒数、播报、速度线、暗角。全部是"屏幕上"的东西，不参与世界坐标。 */
export function drawOverlays(ctx, view, cam) {
  const W = cam.W, H = cam.H;
  const me = view.mine;
  const speed = me ? Math.max(0, me.v) : 0;
  const strength = speedStrength(speed);
  // 速度线是"景物在动"，不是"屏幕上有划痕"——所以它是**从消失点放射**的，
  // 详见 `speedlines.mjs` 里那段说明。
  drawSpeedLines(ctx, cam, speed, performance.now() / 1000);
  const vig = ctx.createRadialGradient(W / 2, H * 0.52, H * 0.3, W / 2, H * 0.5, H * 0.95);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  // 暗角是"把视线压回路面"的一招，但 0.5 会把荒野正午的四角直接压成黑橄榄色
  // （拿像素探针量过：路面 #565550 不变、路肩 #8c7c56 被压成 #453e28）。
  // 满速时再收紧六分：高速的隧道感来自这里，不是来自线。只加这一点，
  // 是因为上面那条量过的界线一动就要重画整个调色。
  vig.addColorStop(1, `rgba(0,0,0,${(0.44 + strength * 0.06).toFixed(3)})`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  /*
   * 挨打的那一闪。刻意**只染边缘**：中心留干净，是因为中心是路，也是自己那台车——
   * 整屏糊成红色会让玩家看不清自己还在不在道上。红=我挨了，暖白=我踹飞了，
   * 两个颜色绝不能混：混了以后"谁打了谁"就只剩声音能分辨。
   */
  if (S.flash > 0.01) {
    const f = ctx.createRadialGradient(W / 2, H * 0.52, H * 0.2, W / 2, H * 0.5, H * 0.92);
    f.addColorStop(0, `rgba(${S.flashColor},0)`);
    // 陡峭的两级，不是均匀的一层：均匀一层在夜空上会被冲成"色偏"（红压到深蓝上
    // 只剩紫），看着像显示器坏了。压在**边缘一条带**上才是"我挨了一下"。
    f.addColorStop(0.7, `rgba(${S.flashColor},${(S.flash * 0.12).toFixed(3)})`);
    f.addColorStop(1, `rgba(${S.flashColor},${(S.flash * 0.88).toFixed(3)})`);
    ctx.fillStyle = f;
    ctx.fillRect(0, 0, W, H);
  }

  /*
   * **命中回执**：屏幕正中那四道短短的斜线。
   *
   * 它是这一轮"打中了要有回音"里最不起眼、却最救命的一笔：玩家出手时眼睛盯着的是
   * 车头正前方那一小块（也就是画面中心略偏下），所以"这一下到底打上没有"的答案
   * 必须出现在**那里**，而不是出现在被打的那个人脚下——那个位置在混战里有一半
   * 时间被别的车挡住。四道线从中心往外弹一下，200 毫秒收掉。
   */
  const hitLeft = S.hitUntil > 0 ? (S.hitUntil - performance.now()) / 200 : 0;
  if (hitLeft > 0) {
    const r = 12 + (1 - Math.min(1, hitLeft)) * 8;
    ctx.save();
    ctx.translate(W / 2, H * 0.56);
    ctx.strokeStyle = `rgba(255,234,150,${Math.min(1, hitLeft * 1.8).toFixed(3)})`;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      const dx = Math.cos(a), dy = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(dx * r, dy * r);
      ctx.lineTo(dx * (r + 7), dy * (r + 7));
      ctx.stroke();
    }
    ctx.restore();
  }

  if (view.countdown > 0) {
    const n = Math.ceil(view.countdown);
    const text = n > 3 ? "准备" : n > 1 ? String(n - 1) : "GO!";
    const frac = 1 - (view.countdown % 1);
    ctx.save();
    ctx.globalAlpha = Math.min(1, 0.35 + frac * 1.4);
    ctx.translate(W / 2, H * 0.34);
    ctx.scale(1 + (1 - frac) * 0.5, 1 + (1 - frac) * 0.5);
    ctx.font = `900 ${Math.round(H * 0.18)}px system-ui, "Microsoft YaHei", sans-serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = H * 0.02; ctx.strokeStyle = "rgba(6,9,18,.9)";
    ctx.strokeText(text, 0, 0); ctx.fillStyle = "#ffe874"; ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  if (FX.announce) {
    const age = (performance.now() - FX.announce.at) / 1000;
    if (age < 2.4) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age / 2.4);
      ctx.translate(W / 2, H * 0.24 - age * 14);
      ctx.textAlign = "center";
      ctx.font = `900 ${Math.round(H * 0.062)}px system-ui, "Microsoft YaHei", sans-serif`;
      ctx.lineWidth = H * 0.012; ctx.strokeStyle = "rgba(6,9,18,.9)";
      ctx.strokeText(FX.announce.title, 0, 0);
      ctx.fillStyle = FX.announce.color || "#ffd23f";
      ctx.fillText(FX.announce.title, 0, 0);
      ctx.font = `600 ${Math.round(H * 0.026)}px system-ui, "Microsoft YaHei", sans-serif`;
      ctx.fillStyle = "#dfe8ff"; ctx.fillText(FX.announce.sub || "", 0, H * 0.05);
      ctx.restore();
    } else FX.announce = null;
  }
}
