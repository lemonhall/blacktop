/**
 * 车手身上那些"动作"：地上的影子、座垫上的影子、出拳、抡家伙、氮气。
 *
 * 单独一层是因为它们和"人长什么样"无关——它们全都由**状态**驱动：`swing` 是
 * 出拳剩下的时间、`wreck` 是摔倒剩下的时间、`nitro` 是氮气开着。真正该被测试
 * 钉住的也是这一点：五个状态里任何一个变了没变，画面必须跟着变。
 */

import { TAU } from "../../sim/constants.mjs";
import { bloom, circle, fillRound, shade, tube } from "./art.mjs";
import { RIDE } from "./bike.mjs";
import { drawHeld } from "./weaponsart.mjs";

/** 影子：三层椭圆，边缘一层比一层淡，车才像"贴"在路上而不是"浮"在路上。 */
export function groundShadow(ctx, detail) {
  ctx.fillStyle = "rgba(0,0,0,.18)";
  ctx.beginPath(); ctx.ellipse(0, 0.04, 0.88, 0.2, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,.26)";
  ctx.beginPath(); ctx.ellipse(0, 0.04, 0.56, 0.13, 0, 0, TAU); ctx.fill();
  if (detail < 1) return;
  ctx.fillStyle = "rgba(0,0,0,.3)";
  ctx.beginPath(); ctx.ellipse(0, 0.05, 0.32, 0.075, 0, 0, TAU); ctx.fill();
}

/**
 * 座垫上那道"人已经坐上去了"的阴影。
 *
 * 这是伪 3D 里最便宜的一招，也是"贴纸感"和"坐进车里"的分界线：人画在车上、
 * 底下却一点影子都没有，眼睛立刻判定这是两张不相关的图片叠在一起。
 */
export function seatShadow(ctx) {
  ctx.fillStyle = "rgba(4,6,12,.42)";
  ctx.beginPath(); ctx.ellipse(0, 0.862, 0.216, 0.058, 0, 0, TAU); ctx.fill();
}

/**
 * 出拳 / 抡家伙：一条"伸出去又收回来"的曲线，命中感全靠这一下。
 * 回身打就是把同一条轨迹**镜像**到另一侧、再压低一点：画片时代就是这么干的。
 * 手里有家伙时画出家伙本身，多出来的那一截正好对上 `sim/weapons.mjs` 的 `reach`。
 */
export function swing(ctx, remaining, p, back, weapon) {
  const k = Math.sin(Math.min(1, 1 - remaining / 0.3) * Math.PI);
  const dir = back ? -1 : 1;
  ctx.save();
  ctx.translate(dir * 0.2, RIDE.shoulderY - 0.03);
  if (back) ctx.scale(-1, 1);
  ctx.rotate((back ? -0.16 : 0.24) - (back ? -0.5 : 0.66) * k);
  const arm = 0.34 + 0.2 * k;
  // 挥出去的残影：三道递减的弧，比任何粒子都便宜，也比任何粒子都有效
  ctx.strokeStyle = `rgba(255,255,255,${0.15 * k})`;
  ctx.lineWidth = 0.05;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, arm * (0.75 + i * 0.28), -0.42 - 0.1 * i, 0.06);
    ctx.stroke();
  }
  tube(ctx, 0, 0, arm, 0.045, 0.16, shade(p.jacket, 0.12), { bright: 0.3 });
  circle(ctx, arm, 0.05, 0.072, shade(p.jacket, 0.22));
  ctx.translate(arm + 0.02, 0.05);
  if (weapon) {
    ctx.rotate(-0.16 - 0.3 * k);
    drawHeld(ctx, weapon, k);
  } else {
    fillRound(ctx, -0.055, -0.075, 0.2, 0.17, 0.06, shade(p.helmet, 0.1));
    ctx.fillStyle = "rgba(255,255,255,.26)";
    ctx.fillRect(-0.02, 0.02, 0.14, 0.026);
  }
  ctx.restore();
}

/** 不打的时候也举在手里：斜斜地翘在右肩上方，一眼能看出这台车带家伙。 */
export function idleWeapon(ctx, weapon) {
  ctx.save();
  ctx.translate(0.26, RIDE.barY - 0.03);
  ctx.rotate(0.66);
  drawHeld(ctx, weapon, 0);
  ctx.restore();
}

/**
 * 氮气：排气口喷两口白热火焰。
 *
 * 这是**从车后看的**排气，喷流正对着镜头，所以它在画面里是"一短截往下拖"，
 * 而不是一条一米长的火舌。上一版画的是两个**直边四边形**（上宽下窄、最长 1 米、
 * 半透明蓝），隔着屏幕看就是后备箱里插着两块玻璃板。
 *
 * 这一版换三件做法：轮廓用曲线收口（叶子形，不是梯形）、三层递减的浓淡
 * （外蓝 → 中青 → 内白）走 `lighter` 加色混合、长度压到 0.24 米——**排气口在
 * 0.36 米高**，火舌再长就穿过路面垂到车底下去了，那是两个蓝色路锥，不是火。
 */
export function nitroFlame(ctx, seed) {
  const t = performance.now() / 90 + seed;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const side of [-1, 1]) {
    const x = side * 0.26 + Math.sin(t * 4.1 + side) * 0.012;
    const y = 0.36;
    const len = 0.24 + Math.sin(t * 2.3 + side) * 0.045;
    const half = 0.086 + Math.sin(t * 3.4 + side * 2) * 0.01;
    const lobes = [
      [half, len, "rgba(84,140,255,.4)", "rgba(62,110,255,.16)"],
      [half * 0.74, len * 0.84, "rgba(126,208,255,.5)", "rgba(110,180,255,.2)"],
      [half * 0.46, len * 0.58, "rgba(255,255,255,.72)", "rgba(214,240,255,.3)"],
    ];
    for (const [hw, l, near, mid] of lobes) {
      const g = ctx.createLinearGradient(x, y, x, y - l);
      g.addColorStop(0, near);
      g.addColorStop(0.52, mid);
      g.addColorStop(1, "rgba(40,90,255,0)");
      ctx.beginPath();
      ctx.moveTo(x - hw, y);
      ctx.quadraticCurveTo(x - hw * 1.14, y - l * 0.46, x - hw * 0.2, y - l * 0.88);
      ctx.quadraticCurveTo(x + side * 0.02, y - l * 1.08, x + hw * 0.2, y - l * 0.88);
      ctx.quadraticCurveTo(x + hw * 1.14, y - l * 0.46, x + hw, y);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
    }
    // 喷口那一小团白热：没有它，三片叶子是"飘"在管子外面的
    bloom(ctx, x, y - 0.02, 0.15, "rgba(190,235,255,.55)", 0.85);
  }
  ctx.restore();
}
