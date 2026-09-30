/**
 * 世界里的文字：头顶的名字、踹飞的播报、捡到钱的跳字。
 *
 * 为什么值得单独一间、而且要缓存：`strokeText` 是整条渲染管线上**最贵的一次调用**。
 * 拿真实 Chrome 量过——每帧只发三次（名字牌 + 两台起飞的车的播报），却吃掉 0.9ms，
 * 是一次 `fillText` 的十倍。原因是描边要按字形轮廓重新生成一圈几何，再逐字光栅化。
 *
 * 而名字牌的文字**一秒钟也不会变**：同一个人、同一个颜色、同一个字号，每帧重描
 * 一遍纯属浪费。所以按（文字 + 颜色 + 字号）烘成一张小图，之后每帧只是一次
 * `drawImage`。
 *
 * 跳字（`+400`、`悬赏 1500`）的取值有限，也会被缓存命中；万一某个房间里文字
 * 千变万化，表到上限就停止往里放——不会因为缓存本身把内存吃光。
 */

import { offscreen } from "./spritecache.mjs";

const SHEET = new Map();
const LIMIT = 96;

/** 只有真浏览器才有字形度量。Node / 没有画布时走现画，测试量到的就是现画。 */
const canMeasure = ctx => typeof ctx.measureText === "function";

const fontOf = px => `700 ${px}px system-ui, "Microsoft YaHei", sans-serif`;

/** 描边有多粗。上下左右各留半个线宽，字才不会被贴图的边切成直角。 */
const strokeOf = px => Math.max(2, px * 0.28);

/** 现画：和以前一模一样的三笔（设字体 → 描边 → 填色）。 */
function drawLive(ctx, x, y, text, color, px, scale = 1) {
  ctx.save();
  if (scale !== 1) { ctx.translate(x, y); ctx.scale(scale, scale); x = 0; y = 0; }
  ctx.font = fontOf(px);
  ctx.textAlign = "center";
  ctx.lineWidth = strokeOf(px);
  ctx.strokeStyle = "rgba(4,7,14,.85)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * 量一行字有多宽——**量之前必须先把字体设成要烘的那一号**。
 *
 * 这是"MISS 的 M 和 S 像被竖着切开"的根因：`measureText` 量的是 `ctx` **当前**的
 * 字体，而这里以前从没设过。画布刚建好时那号字体是 `10px sans-serif`，于是不管
 * 要烘的字有多大，量出来的宽度都是"10 像素下的那一行"——贴图比字形窄一大截，
 * `fillText` 画出去的部分被画布边缘切掉，左右各少一块。字号越大切得越狠，而
 * `MISS` 恰恰是跳字里字号最大的那几个之一。
 *
 * `save/restore` 不是装饰：这只是一次测量，不许把别人的字体改掉。
 */
function measureWidth(ctx, text, px) {
  if (!canMeasure(ctx)) return 0;
  try {
    ctx.save();
    ctx.font = fontOf(px);
    const w = ctx.measureText(text).width;
    ctx.restore();
    return Number.isFinite(w) ? w : 0;
  } catch {
    // 有的假上下文只认 `measureText` 一个方法（老测试里的记账上下文就是这样）。
    // 量不出来就当"量不出来"处理——退回现画，而不是把整帧炸掉。
    return 0;
  }
}

/** 一块文字的贴图：底边对齐用的是**基线上方 `top` 像素**，贴的时候照它摆回去。 */
function tile(ctx, text, color, px) {
  const key = `${text}\u0000${color}\u0000${px}`;
  const hit = SHEET.get(key);
  if (hit) {
    // 命中就把它挪到队尾：名字牌一秒也不会变，跳字却一分钟能来二十个。
    // 淘汰最久没用过的那张，常用的就永远在。
    SHEET.delete(key);
    SHEET.set(key, hit);
    return hit;
  }
  const width = measureWidth(ctx, text, px);
  if (!(width > 0)) return null;
  // 留白 = 半个描边 + 2 像素。**只按 `measureText` 的宽度留是不够的**：那量的是
  // 字形的**前进宽度**，不含描边往外扩的那半圈，也不含两侧的字距边白。
  const pad = Math.ceil(strokeOf(px) / 2) + 3;
  const top = Math.ceil(px * 1.08);
  const canvas = offscreen(Math.ceil(width) + pad * 2, top + Math.ceil(px * 0.45));
  if (!canvas) return null;
  const c = canvas.getContext("2d");
  if (!c) return null;
  c.font = fontOf(px);
  c.textAlign = "center";
  c.lineWidth = strokeOf(px);
  c.strokeStyle = "rgba(4,7,14,.85)";
  c.strokeText(text, canvas.width / 2, top);
  c.fillStyle = color;
  c.fillText(text, canvas.width / 2, top);
  const entry = { canvas, top };
  if (SHEET.size >= LIMIT) SHEET.delete(SHEET.keys().next().value);
  SHEET.set(key, entry);
  return entry;
}

/**
 * 在 `(x, y)` 画一行字。`y` 是**基线**——和 `ctx.fillText` 一个规矩，
 * 所以调用方原来怎么摆，现在还怎么摆。
 */
export function label(ctx, x, y, text, color, size, scale = 1) {
  // 字号按 1 像素取整（大字号按 2 像素）：不然"跟着距离连续变小的字号"会让每一个
  // 新尺寸都变成一张新贴图，缓存等于没做。
  const px = size >= 16 ? Math.round(size / 2) * 2 : Math.max(9, Math.round(size));
  const art = tile(ctx, text, color, px);
  if (!art) { drawLive(ctx, x, y, text, color, px, scale); return; }
  // `scale` 走的还是那张烘好的贴图，只是目标矩形放大——**绝不能拿放大后的字号去
  // 再烘一张**：跳字是"跟着距离连续变大变小"的，每个新尺寸都烘一张，缓存等于没做。
  if (scale === 1) { ctx.drawImage(art.canvas, x - art.canvas.width / 2, y - art.top); return; }
  const w = art.canvas.width * scale, h = art.canvas.height * scale;
  ctx.drawImage(art.canvas, x - w / 2, y - art.top * scale, w, h);
}

/** 测试与排错用。 */
export const labelCacheSize = () => SHEET.size;
export const clearLabels = () => SHEET.clear();
