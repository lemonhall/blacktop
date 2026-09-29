/**
 * 路边道具的**材质库**：木头、钢、水泥、雪、玻璃、锈、灌木。
 *
 * 为什么值得单独一层：八条赛道上的道具一共三十几种，但它们脚下其实是同一套
 * 东西——**一根杆子、一块板、一层霜**。把这几个基本件抽出来以后，"给雪原加一根
 * 雪杆"就变成"拿 theme 里的钢色加一条白帽子"，而不是重新发明一套配色。
 *
 * 所有函数都在**米**坐标系里、y 轴向上、原点在接地点——和 `props.mjs` 的画布
 * 约定一致（道具贴图是 `translate(宽/2, 高)` + `scale(PX, -PX)` 之后画的）。
 */

import { clamp01, hgrad, poly, shade, vgrad } from "./art.mjs";
import { hash2 } from "../../sim/rng.mjs";

/**
 * 八套材质配色。**键就是地面 id**（`grounds.mjs` 那一套），所以一个道具拿到的
 * `ground` 可以直接查表：雪原上的树和荒野上的树，树干颜色不是同一个。
 */
export const THEMES = {
  city: {
    wood: "#4b3a2c", steel: "#7f8899", conc: "#3c3f49", stone: "#5d626c",
    leaf: "#1a3324", leaf2: "#2c5c39", trunk: "#4a3527", accent: "#e9c257",
    light: "#fff0bb", night: true, snow: false,
  },
  coast: {
    wood: "#7b6448", steel: "#9aa4b0", conc: "#8a8377", stone: "#a49a8a",
    leaf: "#2f5c3a", leaf2: "#4e8a52", trunk: "#6b5237", accent: "#e8b04c",
    light: "#ffe6a8", night: false, snow: false,
  },
  open: {
    wood: "#7a5a38", steel: "#8e939c", conc: "#b0a48c", stone: "#a08d6e",
    leaf: "#3c5c2c", leaf2: "#6f8a3e", trunk: "#5b4128", accent: "#d8a03c",
    light: "#ffe0a0", night: false, snow: false,
  },
  desert: {
    wood: "#8a6a44", steel: "#a09a90", conc: "#c9b48d", stone: "#b9a482",
    leaf: "#4e6b34", leaf2: "#7f8f45", trunk: "#7a5c3a", accent: "#e0a83c",
    light: "#ffeec0", night: false, snow: false,
  },
  forest: {
    wood: "#5a4230", steel: "#7a8088", conc: "#6f6a55", stone: "#6d6a58",
    leaf: "#1d3a24", leaf2: "#356b34", trunk: "#5a3a26", accent: "#d0a848",
    light: "#ffe0a8", night: false, snow: false,
  },
  snow: {
    wood: "#6a5340", steel: "#98a2b0", conc: "#a8b2c0", stone: "#8f98a6",
    leaf: "#25442c", leaf2: "#4a7a4c", trunk: "#5a4030", accent: "#dcc27a",
    light: "#f4f8ff", night: false, snow: true,
  },
  works: {
    wood: "#6a5a42", steel: "#878e98", conc: "#6c6f70", stone: "#7a776e",
    leaf: "#3a4a2c", leaf2: "#5c6a34", trunk: "#5a4630", accent: "#f4a634",
    light: "#ffd88a", night: false, snow: false,
  },
  neon: {
    wood: "#453a44", steel: "#7b8292", conc: "#35333f", stone: "#5a5560",
    leaf: "#243a2c", leaf2: "#3e6b46", trunk: "#4a3a2c", accent: "#ff5fd0",
    light: "#fff0c8", night: true, snow: false,
  },
};

export const themeOf = key => THEMES[key] || THEMES.city;

/** 一根立着的杆子（路灯、雪杆、旗杆、栏杆立柱）。左亮右暗 + 底座一圈。 */
export function pole(ctx, x, w, h, base, y = 0) {
  ctx.fillStyle = "rgba(6,9,16,.5)";
  ctx.fillRect(x - w * 0.7, y, w * 1.4, 0.06);
  ctx.fillStyle = hgrad(ctx, x - w / 2, x + w / 2, y + h / 2, [
    [0, shade(base, 0.3)], [0.34, base], [1, shade(base, -0.5)],
  ]);
  ctx.fillRect(x - w / 2, y, w, h);
  ctx.fillStyle = "rgba(255,255,255,.18)";
  ctx.fillRect(x - w * 0.34, y + 0.04, w * 0.16, h - 0.08);
}

/** 一块木板（正面）：三道横纹 + 一条顺纹。栅栏、畜栏、货箱全靠它。 */
export function plankFace(ctx, x, y, w, h, base, seed = 1) {
  ctx.fillStyle = hgrad(ctx, x, x + w, y + h / 2, [
    [0, shade(base, 0.24)], [0.44, base], [1, shade(base, -0.36)],
  ]);
  ctx.fillRect(x, y, w, h);
  const n = Math.max(1, Math.round(h / 0.17));
  ctx.fillStyle = "rgba(38,24,12,.3)";
  for (let i = 0; i < n; i++) ctx.fillRect(x, y + (i + 0.5) * (h / n) - 0.012, w, 0.024);
  ctx.fillStyle = "rgba(255,255,255,.07)";
  ctx.fillRect(x + w * (0.1 + hash2(seed, 1) * 0.34), y + 0.03, 0.028, h - 0.06);
}

/** 一块钢板（正面）：可以带竖楞。集装箱、电箱、闸门都是它。 */
export function steelPlate(ctx, x, y, w, h, base, { ribs = 0, seed = 1 } = {}) {
  ctx.fillStyle = hgrad(ctx, x, x + w, y + h / 2, [
    [0, shade(base, 0.26)], [0.4, base], [1, shade(base, -0.42)],
  ]);
  ctx.fillRect(x, y, w, h);
  if (ribs) {
    const step = w / ribs;
    for (let i = 0; i < ribs; i++) {
      const rx = x + i * step;
      ctx.fillStyle = "rgba(8,11,18,.3)";
      ctx.fillRect(rx + step * 0.14, y, step * 0.16, h);
      ctx.fillStyle = "rgba(255,255,255,.13)";
      ctx.fillRect(rx + step * 0.34, y, step * 0.07, h);
    }
  }
  ctx.fillStyle = `rgba(255,255,255,${0.1 - hash2(seed, 3) * 0.04})`;
  ctx.fillRect(x, y + h * 0.94, w, Math.max(0.02, h * 0.03));
}

/** 锈斑：几片不规则的暖褐色。旧船、旧桶、旧集装箱上一定有。 */
export function rustPatch(ctx, x, y, w, h, seed, k = 1) {
  if (k <= 0.02) return;
  ctx.fillStyle = `rgba(122,64,30,${0.3 * k})`;
  for (let i = 0; i < 5; i++) {
    const rx = x + hash2(seed, i * 3 + 1) * w;
    const ry = y + hash2(seed, i * 3 + 2) * h;
    const rw = w * (0.06 + hash2(seed, i * 3 + 3) * 0.16);
    ctx.fillRect(rx, ry, rw, rw * (0.4 + hash2(seed, i + 40) * 0.7));
  }
}

/** 水泥面：模数缝 + 一片霉。桥墩、挡墙、筒仓底座。 */
export function concreteFace(ctx, x, y, w, h, base, seed = 1) {
  ctx.fillStyle = hgrad(ctx, x, x + w, y + h / 2, [
    [0, shade(base, 0.2)], [0.46, base], [1, shade(base, -0.3)],
  ]);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(0,0,0,.2)";
  const n = Math.max(1, Math.round(h / 2.6));
  for (let i = 1; i < n; i++) ctx.fillRect(x, y + i * (h / n), w, 0.026);
  ctx.fillStyle = "rgba(0,0,0,.13)";
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(x + hash2(seed, i + 5) * w * 0.8, y, 0.05, h * (0.2 + hash2(seed, i + 9) * 0.5));
  }
}

/** 一层雪：物件顶上的白帽子 + 悬着的一道边。`k` 是厚薄。 */
export function snowCap(ctx, x, y, w, h, k = 1) {
  if (k <= 0.05) return;
  const t = h * clamp01(k);
  ctx.fillStyle = vgrad(ctx, x, y - t, y, [
    [0, "#ffffff"], [0.5, "#eef4fb"], [1, "#cdd8e6"],
  ]);
  ctx.fillRect(x, y - t, w, t);
  ctx.fillStyle = "rgba(180,198,220,.55)";
  ctx.fillRect(x, y - t, w, Math.max(0.014, t * 0.16));
  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.fillRect(x, y - t, w, Math.max(0.02, t * 0.3));
}

/** 一块玻璃（正面）。亮着 / 暗着都走这一个，区别只在 `lit`。 */
export function glassPane(ctx, x, y, w, h, { lit = false, alpha = 1 } = {}) {
  ctx.fillStyle = lit
    ? vgrad(ctx, x, y, y + h, [
      [0, `rgba(255,232,178,${0.8 * alpha})`], [1, `rgba(240,178,96,${0.5 * alpha})`],
    ])
    : vgrad(ctx, x, y, y + h, [
      [0, `rgba(128,158,204,${0.34 * alpha})`], [0.34, `rgba(14,20,32,${0.86 * alpha})`],
      [1, `rgba(8,11,19,${0.9 * alpha})`],
    ]);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = `rgba(255,255,255,${lit ? 0.14 : 0.1})`;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w * 0.5, y + h);
  ctx.lineTo(x, y + h * 0.34);
  ctx.closePath();
  ctx.fill();
}

/** 一颗灯泡（外面套一圈光晕）。夜里的道具全靠它。 */
export function bulb(ctx, x, y, r, color, lit = true, strength = 1) {
  if (lit) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.22 * strength;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = lit ? color : shade(color, -0.45);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.65)";
  ctx.beginPath();
  ctx.arc(x - r * 0.28, y + r * 0.28, r * 0.34, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 一丛灌木 / 草垛的底：三到五团叠加的圆，左亮右暗。
 * 伪 3D 的路边最缺的就是"高度不到一米的东西"，它们撑起近处的地面感。
 */
export function bush(ctx, x, y, w, h, t, seed = 1) {
  const n = 4;
  for (let i = 0; i < n; i++) {
    const bx = x + w * (0.1 + i * 0.26) + hash2(seed, i) * w * 0.08;
    const r = h * (0.34 + hash2(seed, i + 7) * 0.22);
    ctx.fillStyle = hgrad(ctx, bx - r, bx + r, y + r, [
      [0, shade(t.leaf2, 0.2)], [0.4, t.leaf2], [1, shade(t.leaf, -0.2)],
    ]);
    ctx.beginPath();
    ctx.arc(bx, y + r * 0.86, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * 一块**牌子上的字**。画布是 y 轴向上的，所以要先把局部坐标翻回来，
 * 否则字是倒着的——这一条当年踩过。
 */
export function label3d(ctx, x, y, size, text, color, { align = "center" } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, -1);
  ctx.font = `700 ${Math.max(0.05, size)}px system-ui, "Microsoft YaHei", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** 一个梯形/多边形的快捷方式（道具里到处都是）。 */
export const shape = poly;
