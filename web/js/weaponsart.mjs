/**
 * 家伙的画法：**手里举着的**与**地上躺着的**，共用同一套形状。
 *
 * 拆成单独一个文件，理由和 `sim/weapons.mjs` 拆出来的理由一样：一张表就该有
 * 一个主人。十五台车同时举着七种东西，如果每画一种就往 `sprites.mjs` 里塞一段，
 * 那个文件会变成谁都不敢碰的杂物间；在这里，加一件家伙 = 加一个函数。
 *
 * 坐标约定：所有形状都画在**米**坐标系里（y 轴向上，调用方已经 `scale(s, -s)`），
 * 原点在"握把"，东西一律朝 **+x** 伸出去。于是"把它举在手里"和"把它扔在路上"
 * 只差一次 translate + rotate——这是画片时代的做法，也是它便宜的原因。
 *
 * `k` 是这一下的**挥出比例**（0 = 举着 / 1 = 抽到底）。只有需要"动起来才好看"的
 * 那几件（电棍的电弧、油桶的泼溅、流星锤的链子）读它，其余无视。
 */

// 相对路径：浏览器里等价于 `/sim/constants.mjs`，Node 里则能直接 import 这个模块
// ——"每一件家伙都画得出来"这件事必须有测试兜着（漏一件的症状是**它根本不存在**）。
import { TAU } from "../../sim/constants.mjs";

const STEEL = "#c9d3e4";
const STEEL_DARK = "#6c7789";
const WOOD = "#8b5a2f";
const WOOD_DARK = "#57371b";
const CHAIN = "#b9c1cf";
const GOLD = "#e6bb46";
const SHOCK = "#7ce8ff";
const OIL = "#c98b2e";

/** 一根方杆：从 `x0` 伸到 `x1`，粗 `th`，画在 `y` 上。 */
function rod(ctx, x0, x1, y, th, color) {
  ctx.fillStyle = color;
  const r = Math.min(th / 2, Math.abs(x1 - x0) / 2);
  ctx.beginPath();
  ctx.moveTo(x0 + r, y - th / 2);
  ctx.lineTo(x1 - r, y - th / 2);
  ctx.arcTo(x1, y - th / 2, x1, y - th / 2 + r, r);
  ctx.lineTo(x1, y + th / 2 - r);
  ctx.arcTo(x1, y + th / 2 - r, x1 - r, y + th / 2, r);
  ctx.lineTo(x0 + r, y + th / 2);
  ctx.arcTo(x0, y + th / 2 - r, x0, y + th / 2, r);
  ctx.lineTo(x0, y - th / 2 + r);
  ctx.arcTo(x0, y - th / 2 + r, x0 + r, y - th / 2, r);
  ctx.closePath();
  ctx.fill();
}

const ball = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };

/** 一串铁环：链子的"像"全靠这几个小圆圈，不要试图画真链节。 */
function links(ctx, x0, x1, y, n, r = 0.035) {
  ctx.strokeStyle = CHAIN;
  ctx.lineWidth = 0.045;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    ctx.beginPath();
    ctx.arc(x0 + (x1 - x0) * t, y + Math.sin(t * 4) * 0.018, r, 0, TAU);
    ctx.stroke();
  }
}

/** 空地那几件（空手没有形状）。 */
const SHAPES = {
  nunchaku(ctx) {
    rod(ctx, 0.02, 0.2, 0, 0.055, WOOD_DARK);
    rod(ctx, 0.26, 0.44, 0.01, 0.055, WOOD);
    links(ctx, 0.2, 0.26, 0, 2);
  },
  club(ctx) {
    rod(ctx, 0.02, 0.16, 0, 0.06, WOOD_DARK);
    ctx.fillStyle = WOOD;
    ctx.beginPath();
    ctx.moveTo(0.14, -0.035); ctx.lineTo(0.42, -0.085);
    ctx.lineTo(0.5, 0); ctx.lineTo(0.42, 0.085);
    ctx.lineTo(0.14, 0.035); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#a8763c";
    ball(ctx, 0.46, 0, 0.055);
  },
  chain(ctx) {
    links(ctx, 0.02, 0.5, 0, 7, 0.042);
    ctx.fillStyle = STEEL_DARK;
    rod(ctx, 0.46, 0.54, 0, 0.07, STEEL_DARK);
  },
  crowbar(ctx) {
    rod(ctx, 0.04, 0.46, 0, 0.07, "#8f3f2c");
    ctx.strokeStyle = STEEL_DARK;
    ctx.lineWidth = 0.07;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0.46, 0);
    ctx.quadraticCurveTo(0.56, 0.02, 0.54, 0.14);
    ctx.stroke();
    rod(ctx, 0.02, 0.09, 0, 0.075, "#6d2f21");
  },
  prod(ctx, k) {
    rod(ctx, 0.02, 0.4, 0, 0.06, "#3d4553");
    rod(ctx, 0.04, 0.14, 0, 0.075, "#1f242e");
    ctx.strokeStyle = STEEL;
    ctx.lineWidth = 0.035;
    for (const y of [-0.05, 0.05]) {
      ctx.beginPath(); ctx.moveTo(0.4, 0); ctx.quadraticCurveTo(0.47, y * 0.6, 0.5, y); ctx.stroke();
    }
    const glow = 0.35 + 0.65 * k;
    ctx.globalAlpha = glow;
    ctx.fillStyle = SHOCK;
    ball(ctx, 0.44, 0, 0.03 + 0.03 * k);
    if (k > 0.35) {
      ctx.strokeStyle = SHOCK;
      ctx.lineWidth = 0.022;
      for (let i = 0; i < 3; i++) {
        const a = -0.9 + i * 0.9;
        ctx.beginPath();
        ctx.moveTo(0.44, 0);
        ctx.lineTo(0.44 + Math.cos(a) * 0.11, Math.sin(a) * 0.11);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  },
  mace(ctx, k) {
    rod(ctx, 0.02, 0.2, 0, 0.055, WOOD_DARK);
    // 链子甩出去：越到挥出的后半程，链子拉得越长、锤头飞得越远。这一下必须
    // 画出来——流星锤的全部气势就在"锤头离手有多远"上。
    const end = 0.4 + 0.12 * k;
    links(ctx, 0.2, end, 0.01, 3 + Math.round(k * 2), 0.032);
    const bx = end + 0.1;
    ctx.fillStyle = STEEL_DARK;
    ball(ctx, bx, 0, 0.1);
    ctx.fillStyle = STEEL;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ball(ctx, bx + Math.cos(a) * 0.115, Math.sin(a) * 0.115, 0.026);
    }
  },
  oilcan(ctx, k) {
    rod(ctx, 0.02, 0.12, 0, 0.05, STEEL_DARK);
    ctx.fillStyle = OIL;
    ctx.beginPath();
    ctx.moveTo(0.1, -0.13); ctx.lineTo(0.3, -0.13);
    ctx.lineTo(0.34, 0.09); ctx.lineTo(0.12, 0.13);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#8c5c17";
    rod(ctx, 0.3, 0.48, 0.06, 0.05, "#8c5c17");
    if (k > 0.4) {
      ctx.globalAlpha = Math.min(1, (k - 0.4) * 2.4);
      ctx.strokeStyle = "#4a4034";
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(0.47, 0.08);
      ctx.quadraticCurveTo(0.56, 0.2, 0.52, 0.34);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  },
};

/** 充能家伙的光晕颜色——"这件还有电"必须一眼看得出来，否则没人愿意浪费一次。 */
const ACCENT = { prod: SHOCK, mace: GOLD, oilcan: OIL };

/** 举在手里。`k` 是挥出比例；调用方已经把 ctx 摆到"握把"上、并处理了左右镜像。 */
export function drawHeld(ctx, id, k = 0) {
  const shape = SHAPES[id];
  if (!shape) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  shape(ctx, k);
  ctx.restore();
}

/**
 * 躺在地上。屏幕像素坐标，`s` 是像素/米。
 *
 * 地上这一件比手里那件重要：它是**唯一的补给线**，所以额外给两样东西——
 * 一道斜躺的影子（把它按在路面上）和一圈慢吞吞的光环（告诉玩家"这里能捡"）。
 */
export function drawPickup(ctx, x, y, s, id, charges = 0) {
  const shape = SHAPES[id];
  if (!shape || !(s > 0.02)) return;
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 380 + x * 0.05);

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.34)";
  ctx.beginPath();
  ctx.ellipse(x, y, 0.6 * s, 0.17 * s, 0, 0, TAU);
  ctx.fill();

  const accent = ACCENT[id];
  if (accent && charges > 0) {
    ctx.globalAlpha = 0.16 + 0.22 * pulse;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(x, y - 0.12 * s, 0.5 * s, 0.34 * s, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.translate(x, y - 0.1 * s);
  ctx.scale(s, -s);
  ctx.rotate(-0.26);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  shape(ctx, 0);
  ctx.restore();
}
