/**
 * 楼房：**现画**，不走贴图缓存。
 *
 * 理由是尺寸跨度太大——一栋 21 米的楼在 5 米外要占两千多像素高，贴图放大会糊成
 * 一坨；而它其实只是"几块板加一串窗"，现画的代价比缩放一张大图还低。
 * `hash2(seed, i)` 保证同一栋楼每一帧长得一模一样（窗户不会自己乱跳）。
 *
 * 一栋楼从"一块颜色"变成"一栋楼"，靠的是这几层依次叠上去：
 *   1. **左亮右暗的墙身**（全场景同一套光照）；
 *   2. **层线**——每层楼板压一条暗线、上面跟一条亮线。少了它，再密的窗也像贴纸；
 *   3. **窗套**——窗洞比玻璃大一圈，底下一条窗台亮边。窗才"陷"进墙里；
 *   4. **底层店面**——人眼高度那一圈一定有东西：玻璃橱窗、暖光、雨棚；
 *   5. **屋顶**——女儿墙加箱子、水箱、天线；有了它楼才有"顶"；
 *   6. **墙上的零碎**——空调外机、排水立管、消防梯、招牌。近处的人眼高度
 *      看的就是这些东西，一栋只有窗格的楼像一张 Excel 表；
 *   7. **这条路自己的记号**（`ground`）——夜市的霓虹竖招、工业支线的成排管道、
 *      海崖的阳台，让八条路上的楼不是同一栋楼换了颜色；
 *   8. **越远越化进天色**（`hazeK`）。最便宜也最有用的一条。
 *
 * 近处的楼画全套，远处的楼只留墙 + 窗格：`fine` 那道闸门就是为帧率设的，
 * 一栋 200 米外的楼占不到 30 像素宽，给它画窗套纯属浪费。
 */

import { hash2 } from "../../sim/rng.mjs";
import { clamp01, haze, hgrad, shade, vgrad } from "./art.mjs";

/** 底层店面从地面往上占多高（米）。人行道 → 雨棚 → 橱窗，都在这一条里。 */
const SHOP_H = 3.6;

export function drawBuilding(ctx, { sx, baseY, s, seed, width, height, tone, hazeK = 0, ground = "" }) {
  const w = width * s, h = height * s;
  if (w < 1 || h < 1) return;
  const k = clamp01(hazeK);
  const left = sx - w / 2, top = baseY - h;
  const hz = v => haze(v, k * 0.8);          // 雾只往天色上拉，不改明暗关系
  const fine = s > 13;                        // 近处才画全套细节
  const wall = hz(tone);

  // 1) 墙身。左上受光、右下背光，再叠一层竖直的"底部积灰"。
  ctx.fillStyle = hgrad(ctx, left, left + w, baseY - h / 2, [
    [0, hz(shade(tone, 0.28))], [0.32, wall], [1, hz(shade(tone, -0.46))],
  ]);
  ctx.fillRect(left, top, w, h);
  ctx.fillStyle = vgrad(ctx, left, top, baseY, [
    [0, "rgba(0,0,0,0)"], [0.72, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,.32)"],
  ]);
  ctx.fillRect(left, top, w, h);

  // 2) 楼层。层高按 3 米、开间按 2.2 米算——这两个数是楼的节奏。
  const rows = Math.max(3, Math.min(20, Math.round(height / 3)));
  const cols = Math.max(2, Math.min(12, Math.round(width / 2.2)));
  const floorH = (h * 0.84) / rows;
  const colP = (w * 0.86) / cols;
  const ww = colP * 0.62, wh = floorH * 0.55;
  const winTop = top + h * 0.06;
  if (fine) {
    for (let r = 0; r <= rows; r++) {
      const y = winTop + r * floorH;
      ctx.fillStyle = "rgba(0,0,0,.26)";
      ctx.fillRect(left, y, w, Math.max(1, s * 0.05));
      ctx.fillStyle = "rgba(255,255,255,.07)";
      ctx.fillRect(left, y - Math.max(1, s * 0.05), w, Math.max(1, s * 0.05));
    }
  }

  // 3) 窗。亮着的往外漏光、暗着的带一点天光反射——一整面全暗的墙没有层次。
  const spill = s > 26;
  const pad = fine ? Math.max(1, s * 0.07) : 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = left + w * 0.07 + c * colP + (colP - ww) / 2;
      const wy = winTop + r * floorH + (floorH - wh) / 2;
      if (fine) {
        ctx.fillStyle = `rgba(6,9,16,${0.5 - k * 0.22})`;    // 窗洞（比玻璃大一圈）
        ctx.fillRect(wx - pad, wy - pad, ww + pad * 2, wh + pad * 2);
      }
      const on = hash2(seed, r * 17 + c * 5) < 0.44;
      if (on) {
        if (spill) {
          ctx.fillStyle = "rgba(255,206,132,.1)";
          ctx.fillRect(wx - ww * 0.35, wy - wh * 0.35, ww * 1.7, wh * 1.7);
        }
        ctx.fillStyle = vgrad(ctx, wx, wy, wy + wh, [
          [0, hz("#ffe6b4")], [0.55, `rgba(255,206,132,${0.62 - k * 0.3})`],
          [1, `rgba(233,168,96,${0.5 - k * 0.26})`],
        ]);
      } else {
        ctx.fillStyle = vgrad(ctx, wx, wy, wy + wh, [
          [0, `rgba(120,146,190,${0.28 - k * 0.14})`],   // 玻璃反着天光
          [0.3, `rgba(12,16,26,${0.82 - k * 0.32})`],
          [1, `rgba(8,11,19,${0.86 - k * 0.34})`],
        ]);
      }
      ctx.fillRect(wx, wy, ww, wh);
      if (!fine) continue;
      // 窗框：中间一根竖梃 + 底下一条窗台亮边
      ctx.fillStyle = `rgba(8,11,18,${0.55 - k * 0.2})`;
      ctx.fillRect(wx + ww / 2 - Math.max(0.5, s * 0.025), wy, Math.max(1, s * 0.05), wh);
      ctx.fillStyle = on ? "rgba(255,226,178,.3)" : "rgba(180,198,224,.18)";
      ctx.fillRect(wx - pad, wy + wh, ww + pad * 2, Math.max(1, s * 0.07));
    }
  }

  // 4) 底层：底商 + 雨棚。人眼高度那一圈必须有东西，否则整栋楼像贴在路边的木板。
  if (fine && h > 60) {
    const shopH = Math.min(SHOP_H * s, h * 0.3);
    const gy = baseY - shopH;
    ctx.fillStyle = hz(shade(tone, -0.16));
    ctx.fillRect(left, gy, w, shopH);
    const bays = Math.max(2, cols);
    const bw = w / bays;
    for (let i = 0; i < bays; i++) {
      const bx = left + i * bw;
      const lit = hash2(seed, 900 + i) < 0.6;
      ctx.fillStyle = lit
        ? vgrad(ctx, bx, gy + shopH * 0.3, baseY, [
          [0, "rgba(255,215,150,.5)"], [1, "rgba(255,186,104,.24)"]])
        : "rgba(9,12,20,.72)";
      ctx.fillRect(bx + bw * 0.1, gy + shopH * 0.28, bw * 0.8, shopH * 0.62);
      // 玻璃上的竖向分格
      ctx.fillStyle = "rgba(8,11,18,.6)";
      ctx.fillRect(bx + bw * 0.5 - Math.max(1, s * 0.035), gy + shopH * 0.28,
        Math.max(1, s * 0.07), shopH * 0.62);
      // 雨棚：一条斜下来的板，边上留一道亮边
      ctx.fillStyle = hz(shade(tone, 0.18));
      ctx.fillRect(bx + bw * 0.04, gy + shopH * 0.16, bw * 0.92, Math.max(1, s * 0.12));
      ctx.fillStyle = "rgba(255,255,255,.12)";
      ctx.fillRect(bx + bw * 0.04, gy + shopH * 0.16, bw * 0.92, Math.max(1, s * 0.03));
    }
  }

  // 5) 女儿墙 + 屋顶。楼顶那圈比墙身亮，楼才立得住。
  const cap = Math.max(1, h * 0.03);
  ctx.fillStyle = hz(shade(tone, -0.06));
  ctx.fillRect(left, top, w, cap);
  ctx.fillStyle = "rgba(255,255,255,.09)";
  ctx.fillRect(left, top, w, Math.max(1, cap * 0.26));
  if (fine) {
    const seedR = seed * 7 + 3;
    for (let i = 0; i < 3; i++) {
      const bx = left + w * (0.16 + hash2(seedR, i) * 0.6);
      const bw2 = w * (0.1 + hash2(seedR, i + 11) * 0.12);
      const bh = s * (0.6 + hash2(seedR, i + 23) * 0.9);
      ctx.fillStyle = hz(shade(tone, hash2(seedR, i + 31) < 0.5 ? 0.16 : -0.24));
      ctx.fillRect(bx, top - bh, bw2, bh);
      ctx.fillStyle = "rgba(0,0,0,.28)";
      ctx.fillRect(bx, top - bh, bw2, Math.max(1, bh * 0.12));
    }
    ctx.strokeStyle = `rgba(200,214,236,${0.4 - k * 0.24})`;
    ctx.lineWidth = Math.max(1, s * 0.045);
    ctx.beginPath();
    ctx.moveTo(sx + w * 0.3, top);
    ctx.lineTo(sx + w * 0.3, top - s * 2.6);
    ctx.stroke();
  }

  // 6) 楼里那一点点暖色，是"里面有人"的唯一线索
  if (s > 40) {
    ctx.fillStyle = "rgba(255,190,120,.09)";
    ctx.fillRect(left + w * 0.08, top + h * 0.04, w * 0.84, h * 0.8);
  }

  // 7) 墙上的零碎。**近处才画**（`fine`）：一栋 200 米外的楼占不到 30 像素宽，
  //    给它画空调外机纯属浪费；而 5 米外的一栋楼如果墙面光秃秃，立刻像一块贴纸。
  if (fine) {
    const unit = Math.max(1, s * 0.5);
    // 空调外机：三到六台，挂在窗台下，每一台底下都有一道水渍
    const acCount = 3 + Math.round(hash2(seed, 61) * 3);
    for (let i = 0; i < acCount; i++) {
      const ax = left + w * (0.12 + hash2(seed, 70 + i) * 0.72);
      const ay = top + h * (0.16 + hash2(seed, 90 + i) * 0.6);
      ctx.fillStyle = hz(shade(tone, -0.12));
      ctx.fillRect(ax, ay, unit, unit * 0.7);
      ctx.fillStyle = "rgba(255,255,255,.16)";
      ctx.fillRect(ax, ay, unit, Math.max(1, unit * 0.14));
      ctx.fillStyle = "rgba(0,0,0,.3)";
      ctx.fillRect(ax + unit * 0.15, ay + unit * 0.2, unit * 0.7, Math.max(1, unit * 0.14));
      ctx.fillStyle = "rgba(20,26,38,.16)";
      ctx.fillRect(ax, ay + unit * 0.7, unit * 0.4, unit * 2.2);
    }
    // 排水立管：从屋顶一路到地面，隔几层一个卡箍
    const px2 = left + w * (0.03 + hash2(seed, 51) * 0.1);
    ctx.fillStyle = "rgba(18,22,30,.5)";
    ctx.fillRect(px2, top, Math.max(1.5, s * 0.16), h);
    ctx.fillStyle = "rgba(255,255,255,.1)";
    ctx.fillRect(px2, top, Math.max(0.5, s * 0.05), h);
    for (let i = 0; i < rows; i++) {
      ctx.fillStyle = "rgba(120,130,148,.45)";
      ctx.fillRect(px2 - Math.max(0.5, s * 0.04), winTop + i * floorH,
        Math.max(1.5, s * 0.24), Math.max(1, s * 0.07));
    }
    // 消防梯：一列横档 + 两道竖梁，挂在楼的侧边
    if (h > 80 && hash2(seed, 41) < 0.62) {
      const lx = left + w * 0.78;
      const lw = w * 0.14;
      ctx.fillStyle = "rgba(60,66,78,.75)";
      ctx.fillRect(lx, top + h * 0.1, Math.max(1, s * 0.07), h * 0.84);
      ctx.fillRect(lx + lw, top + h * 0.1, Math.max(1, s * 0.07), h * 0.84);
      for (let i = 0; i < rows * 2; i++) {
        ctx.fillRect(lx, winTop + i * (floorH / 2), lw, Math.max(1, s * 0.06));
      }
    }
  }

  // 8) 这条路自己的记号。八条路上的楼不该是同一栋楼换了颜色——
  //    夜市挂霓虹竖招、工业区贴着成排的管道、海崖上每层一个阳台。
  if (fine && h > 60) {
    if (ground === "neon" || ground === "city") {
      // 竖招：一只**从墙上挑出去**的灯箱。上下两根托架把它挂在半空，箱面是点亮的
      // 亚克力（上暗下更暗，中间一条亮），四边走一圈灯管，面上打两三个方块字。
      //
      // 上一版只有"一个空盒子 + 四条横杠"：近处看像挂在楼边的电梯井——既没有
      // 托架（看不出它凭什么挂在半空），四条等距横杠也不像字。现在每个字是
      // **一个小方块 + 两三道笔画**，不依赖字体，八像素宽也读得出"这是一排字"。
      const side = hash2(seed, 33) < 0.5 ? -1 : 1;
      const bW = Math.max(3.5, s * 1.5);
      const bH = Math.max(6, h * 0.3);
      const wallX = sx + side * w * 0.46;
      const bx = sx + side * (w * 0.5 + bW * 0.62);
      const bL = bx - bW / 2, bT = top + h * 0.18;
      const glow = ["#ff5fd0", "#5fe0ff", "#ffd23f"][seed % 3];
      // 托架：两根横臂，朝墙的那头压在墙面上
      ctx.fillStyle = "rgba(26,30,40,.92)";
      for (const f of [0.14, 0.86]) {
        ctx.fillRect(Math.min(wallX, bx), bT + bH * f - Math.max(1, s * 0.07),
          Math.abs(bx - wallX), Math.max(1.4, s * 0.14));
      }
      // 箱体：一圈墨边，再压箱面
      ctx.fillStyle = "rgba(6,8,14,.95)";
      ctx.fillRect(bL - s * 0.08, bT - s * 0.08, bW + s * 0.16, bH + s * 0.16);
      ctx.fillStyle = vgrad(ctx, bx, bT, bT + bH, [
        [0, hz(shade(glow, -0.5))], [0.42, hz(shade(glow, -0.68))], [1, hz(shade(glow, -0.86))],
      ]);
      ctx.fillRect(bL, bT, bW, bH);
      // 点亮的亚克力：中间那一条最亮
      ctx.fillStyle = hgrad(ctx, bL, bL + bW, bT + bH / 2, [
        [0, "rgba(255,255,255,.08)"], [0.5, "rgba(255,255,255,.24)"], [1, "rgba(255,255,255,.05)"],
      ]);
      ctx.fillRect(bL, bT, bW, bH);
      // 灯管：四边一圈，画在箱体外面，看着像贴在箱边上
      const tube = Math.max(1, s * 0.09);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = hz(glow);
      ctx.fillRect(bL - tube, bT - tube, bW + tube * 2, tube);
      ctx.fillRect(bL - tube, bT + bH, bW + tube * 2, tube);
      ctx.fillRect(bL - tube, bT, tube, bH);
      ctx.fillRect(bL + bW, bT, tube, bH);
      ctx.globalAlpha = 1;
      // 字：竖排，每个字一个小方块 + 笔画
      const n2 = bH > bW * 2.6 ? 3 : 2;
      const gw = bW * 0.54, gh2 = Math.min(gw, bH / (n2 + 0.7));
      const ink2 = Math.max(1, gh2 * 0.13);
      for (let i = 0; i < n2; i++) {
        const gx = bx - gw / 2;
        const gy = bT + bH * ((i + 0.5) / n2) - gh2 / 2;
        ctx.fillStyle = i % 2 ? "#f6f0ff" : hz(shade(glow, 0.25));
        ctx.fillRect(gx, gy, gw, ink2);                                   // 上横
        ctx.fillRect(gx + gw * 0.44, gy, ink2, gh2);                      // 中竖
        if (gh2 > s * 0.45) {
          ctx.fillRect(gx, gy + gh2 * 0.46, gw, ink2);                    // 中横
          ctx.fillRect(gx, gy + gh2 - ink2, gw, ink2);                    // 下横
        }
      }
    } else if (ground === "works") {
      // 成排的管道：三根沿着墙面横着走，每隔一段一个卡箍
      for (let i = 0; i < 3; i++) {
        const py = top + h * (0.2 + i * 0.09);
        ctx.fillStyle = hz(shade(tone, i === 1 ? 0.24 : -0.2));
        ctx.fillRect(left + w * 0.04, py, w * 0.92, Math.max(1.5, s * 0.24));
        ctx.fillStyle = "rgba(255,255,255,.14)";
        ctx.fillRect(left + w * 0.04, py + Math.max(1, s * 0.16), w * 0.92, Math.max(0.5, s * 0.06));
        for (let k = 0; k < 5; k++) {
          ctx.fillStyle = "rgba(30,34,42,.6)";
          ctx.fillRect(left + w * (0.1 + k * 0.2), py - Math.max(1, s * 0.05),
            Math.max(1, s * 0.1), Math.max(2, s * 0.34));
        }
      }
    } else if (ground === "coast") {
      // 阳台：每一层左侧探出一块楼板 + 一道栏杆
      for (let i = 0; i < rows; i++) {
        const by2 = winTop + i * floorH + floorH * 0.6;
        ctx.fillStyle = hz(shade(tone, 0.14));
        ctx.fillRect(left + w * 0.02, by2, w * 0.3, Math.max(1.5, s * 0.2));
        ctx.strokeStyle = "rgba(220,228,240,.4)";
        ctx.lineWidth = Math.max(1, s * 0.045);
        ctx.beginPath();
        ctx.moveTo(left + w * 0.02, by2);
        ctx.lineTo(left + w * 0.32, by2);
        ctx.stroke();
      }
    }
  }
}
