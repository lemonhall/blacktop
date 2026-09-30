/**
 * 画家的工具箱：颜色、路径、光照。
 *
 * 为什么值得单独一层：整幅画的"像不像一个东西"，九成来自**规矩统一**——同一个
 * 光源方向、同一种描边、同一套明暗关系。这些东西一旦散落在十几个绘制函数里，
 * 每一处都会自己发明一套，最后就是一堆互不相干的色块（那正是这一版之前的毛病）。
 *
 * 三条约定，所有绘制函数都得守：
 *   1. **光从左上来**。左边亮、右边暗，右下角背光。想画凸起就照这个来。
 *   2. **每一块形状都压一圈深色描边**。伪 3D 里没有景深模糊，轮廓只能靠对比度
 *      把主体从路面上"抠"出来。
 *   3. **远处的东西要化进天色**。`haze()` 把颜色往雾色上拉；没有这一步，一百米
 *      外的车和眼前的车一样黑，画面就永远是一张平贴的贴纸。
 *
 * 颜色一律用 `#rrggbb` 十六进制，返回的也是——这样调用方可以继续往里插值。
 */

export const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 描边色。伪 3D 里没有景深模糊，"从路面上跳出来"只能靠对比度，所以每一个
 * 独立的形状都要压一圈它。三处绘制层（人、腿、车流）共用同一个值，轮廓才统一。
 */
export const INK = "rgba(4,6,12,.9)";

const hex2rgb = hex => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgb2hex = (r, g, b) =>
  `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;

/**
 * 调色函数的**记忆化**。
 *
 * 为什么要加：`shade` / `mix` / `haze` 都是"字符串进、字符串出"的纯函数，一次调用
 * 要 `parseInt` 一次、再拼一次十六进制。画一栋楼要调它几十次，一帧几百次，而它
 * 输入的颜色**就那么几十种**——同一栋楼的墙面颜色每一帧都一模一样，却每一帧都从
 * 字符串重新算一遍。
 *
 * 拿真实 Chrome 量过：十三台车 + 十五个车手 + 一条路的那一帧里，主线程有一大半
 * 花在这些零碎上。缓存之后 `shade` 的重复调用几乎为零成本。
 *
 * 表有上限：`haze` 的 `k` 是连续的（雾量按距离插值），键会无限多，所以放不下就
 * 整表丢掉重来。丢一次只损失一次缓存命中，不会泄漏。
 */
const MEMO_LIMIT = 4096;
const memo = (fn, key) => {
  const table = fn.__memo || (fn.__memo = new Map());
  const hit = table.get(key);
  if (hit !== undefined) return hit;
  const out = fn(key);
  if (table.size >= MEMO_LIMIT) table.clear();
  table.set(key, out);
  return out;
};

/** 往亮里推（`amount > 0`）或往暗里推（`amount < 0`）。所有体积感都是它造的。 */
export function shade(hex, amount) {
  return memo(shadeOnce, `${amount}|${hex}`);
}

function shadeOnce(key) {
  const bar = key.indexOf("|");
  const amount = Number(key.slice(0, bar));
  const hex = key.slice(bar + 1);
  const [r, g, b] = hex2rgb(hex);
  const mix = c => Math.max(0, Math.min(255, Math.round(c + (amount > 0 ? (255 - c) : c) * amount)));
  return rgb2hex(mix(r), mix(g), mix(b));
}

/** 两种颜色之间插值：`t = 0` 取 a，`t = 1` 取 b。 */
export function mix(a, b, t) {
  return memo(mixOnce, `${t}|${a}|${b}`);
}

function mixOnce(key) {
  const parts = key.split("|");
  const k = clamp01(Number(parts[0]));
  const a = parts[1], b = parts[2];
  const [r1, g1, b1] = hex2rgb(a), [r2, g2, b2] = hex2rgb(b);
  return rgb2hex(
    Math.round(r1 + (r2 - r1) * k),
    Math.round(g1 + (g2 - g1) * k),
    Math.round(b1 + (b2 - b1) * k),
  );
}

/** 大气透视：把颜色往远处的雾色上拉。`k` 是"有多远"，0 近 1 贴到地平线。 */
export const FOG = { city: "#3a2b46", wild: "#c3d3e2" };
/**
 * 雾量按 1/64 取整再插值。
 *
 * `k` 是**连续**的（按距离算出来，每帧都在动），直接丢给 `mix` 会让记忆化表
 * 每一帧都换一批键——楼一多，缓存等于没做，还白搭一次 Map 查找。取整到 1/64
 * 之后，同一栋楼在几十帧里用的是同一个键；颜色差最多 4/255，比雾本身的变化
 * 小一个数量级，眼睛看不出来。
 */
export const haze = (hex, k, mode = "city") =>
  mix(hex, FOG[mode] || FOG.city, Math.round(clamp01(k) * 64) / 64);

/**
 * 一个**上窄下宽的梯形**：伪 3D 里所有"贴着路面的一横条"都用它。
 *
 * 参数是两条平行边的中点与半宽，外加它们各自的 y。路面的每一片、路缘石、
 * 车道线、轮胎痕都长这个样子——它该住在这里，而不是住在 `road.mjs` 里被复制。
 */
export function trapezoid(ctx, xA, wA, yA, xB, wB, yB) {
  ctx.beginPath();
  ctx.moveTo(xA - wA, yA); ctx.lineTo(xA + wA, yA);
  ctx.lineTo(xB + wB, yB); ctx.lineTo(xB - wB, yB);
  ctx.closePath(); ctx.fill();
}

/** 一段竖直渐变的填充色：`[[0, "#111"], [1, "#333"]]`。 */
export function vgrad(ctx, x, y0, y1, stops) {
  const g = ctx.createLinearGradient(x, y0, x, y1);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}

/** 一段水平渐变的填充色：用来做"左亮右暗"的受光面。 */
export function hgrad(ctx, x0, x1, y, stops) {
  const g = ctx.createLinearGradient(x0, y, x1, y);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}

/** 圆角矩形**路径**（只建路径，填还是描由调用方决定）。 */
export function roundPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

export function fillRound(ctx, x, y, w, h, r, style) {
  roundPath(ctx, x, y, w, h, r);
  ctx.fillStyle = style;
  ctx.fill();
}

/** 多边形填充。点集是 `[[x, y], …]`，坐标一律是"米"。 */
export function poly(ctx, points, style) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
}

export function circle(ctx, x, y, r, style) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = style;
  ctx.fill();
}

export function ring(ctx, x, y, r, width, style) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.lineWidth = width;
  ctx.strokeStyle = style;
  ctx.stroke();
}

/**
 * 把一个颜色（`#rrggbb` 或 `rgba(r,g,b,a)`）的整体不透明度乘上 `k`。
 *
 * 光晕要的是"一串同样颜色、不同浓淡"的停靠点，而调用方递进来的颜色自带 alpha
 * （`rgba(255,246,207,.5)`），所以必须能**读出现有的 alpha 再改**。
 */
export function withAlpha(color, k) {
  if (typeof color !== "string") return color;
  const hex = /^#([0-9a-f]{6})$/iu.exec(color);
  if (hex) {
    const [r, g, b] = hex2rgb(color);
    return `rgba(${r},${g},${b},${clamp01(k).toFixed(3)})`;
  }
  const m = /^rgba?\(([^)]+)\)$/iu.exec(color);
  if (!m) return color;
  const parts = m[1].split(",").map(v => v.trim());
  const a = parts.length > 3 ? Number(parts[3]) : 1;
  return `rgba(${parts.slice(0, 3).join(",")},${clamp01(a * k).toFixed(3)})`;
}

/**
 * 一粒光晕。夜里所有"在发光"的东西都用它，位置与半径都在米坐标系里。
 *
 * **亮度必须从圆心一路往外掉**。上一版前 45% 的半径是**平的**（`addColorStop(0)`
 * 与 `(0.45)` 同一个颜色），再加一个突然开始的衰减——半径一大就不是"光"了，
 * 而是一张边缘微柔的圆饼。栽在这上面的最大一件是**迎面的大运**：它的远光半径
 * 1.1 米，开到你面前时两盏灯变成两块直径两米多的暖白灰饼压在路面上（车本身反而
 * 被盖住）。现在的停靠点是 1 → 0.62 → 0.22 → 0，衰减从圆心就开始，边缘落在 0。
 */
export function bloom(ctx, x, y, r, color, strength = 1) {
  const rr = Math.max(1e-3, r);
  const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
  const c = k => withAlpha(color, k);
  g.addColorStop(0, c(1));
  g.addColorStop(0.18, c(0.72));
  g.addColorStop(0.45, c(0.28));
  g.addColorStop(0.72, c(0.08));
  g.addColorStop(1, c(0));
  ctx.save();
  ctx.globalAlpha = clamp01(strength);
  ctx.beginPath();
  ctx.arc(x, y, rr, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

/**
 * 一根**圆柱**：中间亮、两边暗、边缘压一道反光。金属管子（排气管、车把、护栏）
 * 全靠它一次成形——它的本质就是"把横向渐变套在一个圆角矩形上"。
 *
 * `edge` 是可选的一圈描边粗细。给了它，这根管子就带上和车身一致的墨线——
 * 伪 3D 画面里所有主体都压着墨线，只有一根光溜溜的管子会显得"没画完"。
 */
export function tube(ctx, x0, y0, x1, y1, th, base, { bright = 0.55, edge = 0 } = {}) {
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const len = Math.hypot(x1 - x0, y1 - y0);
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(ang);
  const g = ctx.createLinearGradient(0, -th / 2, 0, th / 2);
  g.addColorStop(0, shade(base, -0.45));
  g.addColorStop(0.28, shade(base, bright * 0.5));
  g.addColorStop(0.52, shade(base, bright));
  g.addColorStop(0.78, shade(base, -0.2));
  g.addColorStop(1, shade(base, -0.5));
  fillRound(ctx, 0, -th / 2, len, th, th / 2, g);
  if (edge > 0) {
    roundPath(ctx, 0, -th / 2, len, th, th / 2);
    ctx.lineWidth = edge;
    ctx.strokeStyle = "rgba(4,6,12,.85)";
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 贴一层"材质噪点"：沥青、砂石、皮革都靠它去掉塑料感。
 * 用固定种子的伪随机，所以同一帧重画两次的结果一致，不会自己抖。
 *
 * **`r` 是半粒噪点的半径，单位是调用方的单位**（米或像素）。这个参数是必须的：
 * 上一版把半径写死成 0.4～1.9，于是画在"米"坐标系里的皮衣噪点变成了半径两米的
 * 黑团——每个骑手都顶着一圈三十厘米宽的光晕，查了半天才发现是它。
 */
export function speckle(ctx, x, y, w, h, count, color, seed = 1, r = 0.02) {
  let s = (seed | 0) || 1;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const px = x + rnd() * w, py = y + rnd() * h;
    const rr = r * (0.6 + rnd() * 0.9);
    ctx.beginPath();
    ctx.arc(px, py, rr, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 一层"主角光"：从左上打过来的一道斜亮带，铺在任何形状上都成立。 */
export function sheen(ctx, x, y, w, h, alpha = 0.16) {
  const g = ctx.createLinearGradient(x, y + h, x + w, y);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.46, `rgba(255,255,255,${alpha})`);
  g.addColorStop(0.54, `rgba(255,255,255,${alpha * 0.7})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}
