/**
 * 地面颗粒：几张 96×96 的重复贴图，一局各画一次。
 *
 * 为什么不用逐格撒点：路面一帧要铺 78 个梯形，每个再撒二十粒点就是一千多个圆，
 * 白白吃掉一半的帧时间。而"地面上有颗粒"这件事只需要一个 `pattern` 填充——
 * 一次调用，全屏铺满。
 *
 * 四张而不是一张：城市脚下是沥青、荒野两边是土、沙漠是细沙、雪地是盐粒。
 * 拿同一张灰噪点铺到底，沙漠那半边就成了一张干净的卡纸——那是伪 3D 里最
 * 廉价的一种穿帮。
 */

const TILE_SIZE = 96;

/** 每种颗粒的配方：底色、亮粒、暗粒的颜色与数量。 */
const RECIPES = {
  asphalt: { seed: 20260930, n: 700, light: "rgba(255,255,255,", dark: "rgba(0,0,0," },
  dirt: { seed: 7717, n: 900, light: "rgba(255,244,214,", dark: "rgba(58,50,26," },
  sand: { seed: 51413, n: 1100, light: "rgba(255,238,196,", dark: "rgba(120,96,54," },
  snow: { seed: 88231, n: 800, light: "rgba(255,255,255,", dark: "rgba(150,168,190," },
};

const tiles = new Map();
const patterns = new Map();

function tile(kind) {
  const hit = tiles.get(kind);
  if (hit) return hit;
  const r = RECIPES[kind] || RECIPES.asphalt;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = TILE_SIZE;
  const g = canvas.getContext("2d");
  let s = r.seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < r.n; i++) {
    const v = rnd();
    const a = kind === "asphalt"
      ? (v > 0.5 ? 0.05 + rnd() * 0.08 : 0.06 + rnd() * 0.1)
      : (v > 0.55 ? 0.06 + rnd() * 0.1 : 0.08 + rnd() * 0.15);
    g.fillStyle = (v > 0.5 ? r.light : r.dark) + a.toFixed(3) + ")";
    g.fillRect(rnd() * TILE_SIZE, rnd() * TILE_SIZE, 1 + rnd() * 1.3, 1 + rnd() * 1.3);
  }
  tiles.set(kind, canvas);
  return canvas;
}

function patternFor(ctx, kind) {
  const hit = patterns.get(kind);
  if (hit && hit.ctx === ctx) return hit.pattern;
  const pattern = ctx.createPattern(tile(kind), "repeat");
  patterns.set(kind, { ctx, pattern });
  return pattern;
}

/** 把颗粒铺在地平线以下。滚动的偏移跟着相机的 z 走，所以它会"往后退"。 */
export function grainOverlay(ctx, cam, kind, alpha) {
  const span = cam.H - cam.horizon;
  if (span < 12 || alpha <= 0) return;
  const pattern = patternFor(ctx, kind);
  if (!pattern) return;
  const shift = (((cam.camZ * 30) % TILE_SIZE) + TILE_SIZE) % TILE_SIZE;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(0, -shift);
  ctx.fillStyle = pattern;
  ctx.fillRect(0, cam.horizon, cam.W, span + TILE_SIZE);
  ctx.restore();
}

/** 测试与工具用：某一种颗粒的种子/密度配方。 */
export const recipeOf = kind => RECIPES[kind] || RECIPES.asphalt;
