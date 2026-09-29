/**
 * 贴图缓存：**把每一帧都一模一样的那半张画烘成一张图**。
 *
 * 为什么需要它：车手是全场画得最细的东西（一台车 + 一个人 ≈ 1000 次画布调用），
 * 而十五台车里有十四台**姿势完全不变**——它们只是"在路上的某个位置、某个大小"。
 * 每一帧把同一幅画重画十五遍，是这台机器上最贵也最没必要的一笔开销。
 *
 * 拿真实 Chrome 量过（`tools/` 外的探针，见提交说明）：进赛道之后主线程每帧要发
 * 一万四千次画布调用，其中七成来自车手。烘成贴图之后，一个车手从一千次调用变成
 * **一次 `drawImage`**，而画面一模一样。
 *
 * 三条硬规矩：
 *   1. **缓存只装"不动的部分"**。会动的东西（挥拳、手里的家伙、氮气火）仍然现画，
 *      叠在贴图上面——它们的调用次数少、而且必须跟着状态变。
 *   2. **烘的精度要够**。同一档细节按 `ppm` 分两三级烘，屏幕上要多大就用最接近的
 *      那一级，最多放大一倍以内，免得糊。宁可多烘两级，也不要让主角的车变模糊。
 *   3. **没有画布就现画**。`node --test` 里没有 `document`，这时整个模块退化成
 *      直通——测试量到的永远是"真画法"，不是"贴图有没有被贴上去"。
 */

/** 烘好的贴图：`key → { canvas, box, ppm }`。 */
const BAKED = new Map();

/** 盘面这种"一张就是一块画布"的贴图上限（车手那边另有各档细节，不跟它抢）。 */
const PIXEL_LIMIT = 24;

/** 测试与排错用：现在烘了几张、全部丢掉。 */
export const bakedCount = () => BAKED.size;
export const clearBaked = () => BAKED.clear();

/** 一块离屏画布。Node 里（没有 `document`）返回 `null`，调用方据此退回现画。 */
export function offscreen(w, h) {
  const make = typeof document !== "undefined" && document.createElement
    ? () => document.createElement("canvas")
    : typeof OffscreenCanvas !== "undefined" ? () => new OffscreenCanvas(w, h) : null;
  if (!make) return null;
  const canvas = make();
  if (!canvas || !canvas.getContext) return null;
  if (w > 0) canvas.width = Math.ceil(w);
  if (h > 0) canvas.height = Math.ceil(h);
  return canvas;
}

/**
 * 烘一张。`box` 是米空间里要留住的矩形（左上角 `(x0, y1)`、右下角 `(x1, y0)`），
 * `paint` 拿到的是**已经摆好坐标系**的上下文：原点仍在接送地点、y 向上、单位是米，
 * 和现画时看到的完全一样。所以 `paint` 里可以原样粘贴原来那段画法。
 */
export function bake(key, { ppm, box, paint }) {
  const hit = BAKED.get(key);
  if (hit) return hit;
  const w = (box.x1 - box.x0) * ppm, h = (box.y1 - box.y0) * ppm;
  if (!(w >= 1) || !(h >= 1)) return null;
  const canvas = offscreen(w, h);
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.translate(-box.x0 * ppm, box.y1 * ppm);
  ctx.scale(ppm, -ppm);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  paint(ctx);
  const entry = { canvas, box, ppm };
  BAKED.set(key, entry);
  return entry;
}

/**
 * 把烘好的图贴回去。`s` 是当前屏幕上的"像素/米"。
 *
 * 贴图在米空间里占 `box`；调用方当前的变换原点就是接送地点、y 轴向下。
 */
export function blit(ctx, s, entry) {
  const { canvas, box, ppm } = entry;
  const k = s / ppm;
  ctx.drawImage(canvas, box.x0 * s, -box.y1 * s, canvas.width * k, canvas.height * k);
}

/**
 * 烘一张**像素坐标系**的贴图：`paint(ctx)` 拿到的是左上角为原点的画布，单位是像素。
 *
 * 表和车手要的东西不一样：车手是"米空间里的一幅画"（需要 `bake` 那套换算），
 * 而一只表的盘面本来就画在它自己的像素坐标里——刻度数字、铬圈、玻璃反光，
 * 一帧一帧重描它们纯属浪费。两者共用同一张缓存表，只是键的前缀不同。
 */
export function bakePixels(key, w, h, paint) {
  const hit = BAKED.get(key);
  if (hit) return hit;
  if (BAKED.size >= PIXEL_LIMIT) return null;
  const canvas = offscreen(w, h);
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  paint(ctx);
  const entry = { canvas, box: null, ppm: 1 };
  BAKED.set(key, entry);
  return entry;
}
