/**
 * 仪表盘上那两只表。
 *
 * 为什么单独一个文件：HUD 的其余部分都是 DOM（便宜、能上 CSS、文本只在变的时候写），
 * 只有这两只表必须每帧重画——指针的角速度是竞速里**唯一不用看数字**就知道自己在加速
 * 还是在掉速的东西。它是这块 HUD 里唯一有状态的一块，所以它自己住一间。
 *
 * 长相照着 1996 年那几版的实机照片来（`refs/three-do-hud-alt.jpg`、`refs/pc-city-hud.png`）：
 * 真车的表不是"一个深色圆盘加一道弧"，而是**镀铬圈箍着一块暖白色的底盘**，黑刻度黑数字
 * 围着圈排，一根**红针**从中心的金属盖里伸出来，正中间嵌一块方玻璃里程窗。指针是红的，
 * 这一点那几版都一样——红针在浅底盘上的对比度，是"扫一眼就知道"的全部秘密。
 *
 * **左边是速度表、右边是转速表**，和原版一样：真车就是这两只表并排装在同一个舱里。
 * 两者共用这一段画法，差别只有刻度参数（`major` / `minor` / `redline` / 小数位）——
 * 于是"表"这件事只写了一遍，而换一台车、换一套刻度不用碰任何画图代码。
 *
 * 表被"焊"在一块黑色舱壳里：外壳一圈近黑的壳子、上沿受光、下沿压暗。所以画一只表
 * 是从外往里画的——壳 → 铬圈 → 内影 → 底盘 → 玻璃反光 → 刻度 → 红针 → 中心盖 → 里程窗。
 */

import { clamp01 } from "./art.mjs";
import { bakePixels } from "./spritecache.mjs";

const TAU = Math.PI * 2;
/** 刻度弧：从**左下**（140°）顺时针绕过正上方，收在**右下**（400°）。和真车的排布一致。 */
const A0 = Math.PI * 0.78;
const A1 = Math.PI * 2.22;
const angleOf = k => A0 + (A1 - A0) * k;

/** 老表的数字是窄体大写无衬线，不是等线。窄一点，刻度才排得开。 */
const FONT = '"Arial Narrow", "Helvetica Neue", Arial, system-ui, sans-serif';

const lg = (ctx, x0, y0, x1, y1, stops) => {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
};
const rg = (ctx, x, y, r0, r1, stops) => {
  const g = ctx.createRadialGradient(x, y, Math.max(1e-3, r0), x, y, Math.max(1e-3, r1));
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
};

/**
 * **盘面**：从舱壳到刻度数字的那一层，一帧一帧长一个样。
 *
 * 它是这只表上最贵的部分（两圈弧、镀铬渐变、玻璃反光、十几个刻度数字，其中数字
 * 还要描边），而它**只跟"这只表怎么刻度"有关**，跟读数一点关系都没有。所以它
 * 整块烘成一张贴图，每帧只贴一次，剩下的针、中心盖、里程窗才现画。
 *
 * 拿真实 Chrome 量过：这一笔省掉的是 HUD 里最大的一块 `strokeText`。
 */
function paintFace(ctx, { size, c, R, faceR, I, max, major, minor, redRatio, color, labelPx }) {
  const N = Math.max(1, Math.round(max / minor));
  // 1) 舱壳：壳子比表大一圈，上沿受光、下沿沉进黑里，表就有了"嵌在仪表舱里"的感觉。
  ctx.beginPath(); ctx.arc(c, c, R, 0, TAU);
  ctx.fillStyle = lg(ctx, 0, c - R, 0, c + R,
    [[0, "#3d4756"], [0.3, "#1a1f28"], [0.7, "#0a0e15"], [1, "#05070b"]]);
  ctx.fill();

  // 2) 镀铬圈：真表最显眼的一笔。斜着打光，左上一段高光、右下回一点反射。
  ctx.beginPath(); ctx.arc(c, c, R * 0.925, 0, TAU);
  ctx.lineWidth = 3.6 * I;
  ctx.strokeStyle = lg(ctx, c - R, c - R, c + R, c + R,
    [[0, "#f6fafe"], [0.24, "#9caab9"], [0.48, "#fcfeff"], [0.72, "#75818f"], [1, "#dbe4ee"]]);
  ctx.stroke();

  // 3) 识别环：一圈细到几乎只是"铬圈上的一点色"，左右两只表靠它区分。
  ctx.beginPath(); ctx.arc(c, c, R * 0.855 + 5.6 * I, 0, TAU);
  ctx.lineWidth = 1.6 * I;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 4) 内影：底盘是**凹**进去的，所以盘沿要压一圈黑。
  ctx.beginPath(); ctx.arc(c, c, faceR + 2.4 * I, 0, TAU);
  ctx.lineWidth = 3.6 * I;
  ctx.strokeStyle = "rgba(4,7,12,.78)";
  ctx.stroke();

  // 5) 暖白底盘：上亮下暗。纯白会显得像塑料，老表的盘面是发黄的米白。
  ctx.beginPath(); ctx.arc(c, c, faceR, 0, TAU);
  ctx.fillStyle = lg(ctx, 0, c - faceR, 0, c + faceR,
    [[0, "#fffdf4"], [0.46, "#f2eddd"], [1, "#d3cab3"]]);
  ctx.fill();

  ctx.save();
  ctx.clip(); // 之后的所有刻度、数字都裁在盘面里

  // 6) 玻璃反光：左上那一片。真表上它永远在，而且正好压在刻度上——盘子立刻"有玻璃"。
  ctx.beginPath();
  ctx.ellipse(c - faceR * 0.18, c - faceR * 0.8, faceR * 0.96, faceR * 0.6, -0.26, 0, TAU);
  ctx.fillStyle = rg(ctx, c - faceR * 0.3, c - faceR * 0.92, 0, faceR * 1.2,
    [[0, "rgba(255,255,255,.58)"], [0.5, "rgba(255,255,255,.18)"], [1, "rgba(255,255,255,0)"]]);
  ctx.fill();

  // 7) 红区：最后那一段。它必须在刻度的**里侧**，压住数字就成了糊。
  ctx.beginPath();
  ctx.arc(c, c, faceR * 0.775, angleOf(redRatio), A1);
  ctx.lineWidth = 5 * I;
  ctx.strokeStyle = "#c23127";
  ctx.stroke();

  // 8) 刻度 + 数字。
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= N; i++) {
    const v = i * minor;
    const k = v / max;
    const a = angleOf(k);
    const big = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    const cos = Math.cos(a), sin = Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(c + cos * faceR * 0.985, c + sin * faceR * 0.985);
    ctx.lineTo(c + cos * faceR * (big ? 0.845 : 0.915), c + sin * faceR * (big ? 0.845 : 0.915));
    ctx.lineWidth = (big ? 3.2 : 1.5) * I;
    ctx.strokeStyle = "#1b1f26";
    ctx.stroke();
    if (!big) continue;
    ctx.font = `700 ${Math.round((labelPx || 9) * I)}px ${FONT}`;
    ctx.fillStyle = k >= redRatio - 1e-6 ? "#bd2f26" : "#171a20";
    ctx.fillText(String(Math.round(v)), c + cos * faceR * 0.805, c + sin * faceR * 0.805);
  }
  ctx.restore();
}

/**
 * 画一只表。
 *
 * `opts.readout` 是表壳外面那块液晶的 DOM id（表盘上已经有里程窗了，外面那块负责
 * 在窄屏上把读数留大），`opts.unit` 印在盘面下沿，`opts.color` 只用来点一圈极细的
 * 识别环——左表右表全靠它区分，但它是"表圈上的一道色",不是"一个彩色圆盘"。
 */
export function drawGauge(canvas, value, max, color, opts = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  const c = size / 2;
  const R = c - 1;
  const faceR = R * 0.855;
  const shown = Math.max(0, Math.round(value));
  const ratio = clamp01(max > 0 ? shown / max : 0);
  const I = size / 124; // 所有尺寸按 124 的底稿写，换画布大小也不走样
  // 刻度规格：`major` 是"隔多少画一个数字"，`minor` 是最小一格，`redline` 是红区起点。
  // 速度表 260/40/20，转速表 9/1/0.5 —— 两种表的刻度逻辑是同一套，只是参数不同。
  const major = opts.major || max / 6.5;
  const minor = opts.minor || major / 2;
  const redRatio = opts.redline != null ? clamp01(opts.redline / max) : 0.84;
  const decimals = opts.decimals | 0;
  const fmt = v => (decimals ? v.toFixed(decimals) : String(Math.round(v)));

  const face = {
    size, c, R, faceR, I, max, major, minor, redRatio, color,
    labelPx: opts.labelPx || 9,
  };
  const key = `gauge|${size}|${opts.labelPx || 9}|${max}|${major}|${minor}|${redRatio}|${color}`;
  const baked = bakePixels(key, size, size, c2 => paintFace(c2, face));
  ctx.clearRect(0, 0, size, size);
  if (baked) ctx.drawImage(baked.canvas, 0, 0);
  else paintFace(ctx, face);

  // 9) 红针：从中心盖里长出来的细楔子。尾端有一小截配重，不然它像一根悬空的棍。
  //    局部坐标里针尖朝 **-y**（正上），所以旋转 `角度 + π/2` 之后针尖正好指到读数。
  //    （踩过的坑：写成 +y 会让整根针反向 180°，115 km/h 指到 240 上去。）
  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(angleOf(ratio) + Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(-2.6 * I, 0);
  ctx.lineTo(0, -faceR * 0.93);
  ctx.lineTo(2.6 * I, 0);
  ctx.closePath();
  ctx.fillStyle = "#c9302a";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.9 * I, 0);
  ctx.lineTo(0, -faceR * 0.88);
  ctx.lineTo(0.5 * I, 0);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,232,220,.5)";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-2.4 * I, 0);
  ctx.lineTo(0, -7.6 * I);
  ctx.lineTo(2.4 * I, 0);
  ctx.closePath();
  ctx.fillStyle = "#8f221c";
  ctx.fill();
  ctx.restore();

  // 10) 中心盖：镀铬小圆盖，光从左上来。它把针"钉"在盘上。
  ctx.beginPath(); ctx.arc(c, c, 7.6 * I, 0, TAU);
  ctx.fillStyle = rg(ctx, c - 2.4 * I, c - 2.4 * I, 0, 11 * I,
    [[0, "#ffffff"], [0.5, "#c3ccd8"], [1, "#5a6574"]]);
  ctx.fill();
  ctx.beginPath(); ctx.arc(c, c, 4.4 * I, 0, TAU);
  ctx.fillStyle = "#12171e";
  ctx.fill();
  ctx.beginPath(); ctx.arc(c - 1 * I, c - 1 * I, 1.4 * I, 0, TAU);
  ctx.fillStyle = "rgba(255,255,255,.72)";
  ctx.fill();

  // 11) 里程窗：正中间那块方玻璃，黑边、米白底、黑数字。老表就是这么报精确读数的。
  const ww = faceR * 0.92, wh = 18 * I;
  const wx = c - ww / 2, wy = c + faceR * 0.26;
  ctx.beginPath(); ctx.rect(wx, wy, ww, wh);
  ctx.fillStyle = "#fcfaf1";
  ctx.fill();
  ctx.lineWidth = 2 * I;
  ctx.strokeStyle = "#15181e";
  ctx.stroke();
  ctx.beginPath(); ctx.rect(wx + 2 * I, wy + 2 * I, ww - 4 * I, 5 * I);
  ctx.fillStyle = "rgba(20,24,32,.16)";
  ctx.fill();
  ctx.font = `800 ${Math.round(15 * I)}px ${FONT}`;
  ctx.fillStyle = "#15181e";
  ctx.fillText(fmt(value), c, wy + wh / 2 + 1.4 * I);

  // 12) 盘面下沿的单位字。老表刻的是 MPH，我们跑的是公制。
  ctx.font = `700 ${Math.round(9 * I)}px ${FONT}`;
  ctx.fillStyle = "#22262e";
  ctx.fillText(opts.unit || "km/h", c, wy + wh + 9 * I);

  const node = opts.readout && typeof document !== "undefined"
    && document.getElementById(opts.readout);
  if (node) node.textContent = fmt(value);
}
