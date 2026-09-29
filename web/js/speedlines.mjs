/**
 * 速度线：从消失点往外**放射**的短划痕。
 *
 * 上一版是"屏幕左右各几条固定角度的斜线，位置还跟着 `performance.now()` 抖"。
 * 那个毛病不在参数，在**语义**：起点和方向都钉在屏幕上，人眼一眼就认出是
 * "屏幕上划了几道"，而不是"景物在动"。所以怎么调都出戏。
 *
 * 真往前冲的时候，画面上每一点都是沿着"消失点 → 自己"这条射线往外走的，
 * 而且走得越远越快：屏幕速度正比于离消失点的距离。顺着这条物理直觉，四条
 * 规则就都定下来了：
 *   - 方向：一律从消失点放射；
 *   - 位置：离消失点多远，走得就有多快（半径用 `u²` 推出去）；
 *   - 长度：正比于离消失点的距离——贴近中心的短到看不见，四角的最长；
 *   - 亮度：同样正比——所以画面正中是干净的，只有边缘在糊。
 *
 * 消失点在 `cam.horizon`、画面正中：相机横向严格跟着自己，它不会横向漂移。
 *
 * 这个文件是**纯函数**：`now`（秒）从外面传进来，自己不读时钟。于是测试里可以
 * 逐帧推进、比对形状，也能验"这条线不会自己乱跳"。
 */

/** 黄金角。按序号乘上去，二十来条线就能把一圈铺得又均匀又不规则。 */
const GOLD = 2.399963229728653;
const FLOOR = 14; // m/s：低于这个速度一笔都不画
const SPAN = 26; // m/s：从 FLOOR 再往上加这么多就算满速
const RMIN = 0.2; // 最近画到离消失点多远（归一化半径）

const fract = x => x - Math.floor(x);
/** 每条线的相位。拿序号哈希出来，帧与帧之间**稳定**——线不能自己乱跳。 */
const phase = i => fract(Math.sin(i * 127.1 + 311.7) * 43758.5453);
/** 第二条哈希：这一条比别的长一点还是短一点。等长的线会排成一把梳子。 */
const wobble = i => 0.7 + 0.6 * fract(Math.sin(i * 269.5 + 183.3) * 24634.6345);

/** 速度 → 0..1。这个数字决定线有几条、多长、多亮、往窗外飞多快。 */
export function speedStrength(speed) {
  return Math.min(1, Math.max(0, ((speed || 0) - FLOOR) / SPAN));
}

/**
 * 第 `i` 条线此刻在哪儿。画不出来（刚出生、或在慢速里压根不该有）就返回 `null`。
 *
 * 返回的 `x0,y0` 是**尾巴**（靠里那一头）、`x1,y1` 是**头**（靠外那一头），
 * `a` 是透明度、`w` 是线宽。
 */
export function lineShape(i, s, now, cam) {
  if (s <= 0) return null;
  const W = cam.W, H = cam.H;
  const cx = W / 2, cy = cam.horizon;
  const ex = W * 0.54; // 横向半径：多给 8%，让线能划出画面边再淡掉
  const down = Math.max(24, H - cy);
  const ang = i * GOLD + 0.9;
  const co = Math.cos(ang), si = Math.sin(ang);
  // 一圈的长度固定，飞得越快圈数越多——所以 `rate` 跟着强度走。
  const u = fract(now * (0.5 + s * 1.5) + phase(i));
  const r = RMIN + (1 - RMIN) * u * u; // u² 让"越靠外越快"落在半径上
  const g = (r - RMIN) / (1 - RMIN); // 0 = 刚出生，1 = 已经贴到画面边
  if (g < 0.04) return null; // 刚出生那一点：短到画不出来，直接不画
  const ey = si < 0 ? cy * 0.94 : down;
  // 两头都要淡：`grow` 是刚从消失点里长出来那一下，`die` 是贴到画面边之后。
  // 没有这两头，线会"啪"地出现、"啪"地消失——一整圈里唯一一次位置突变
  // （从画面边绕回中心）必须落在**透明度几乎为零**的那一刻上。
  const grow = Math.min(1, g / 0.28);
  const die = Math.min(1, (1 - g) / 0.18);
  const len = (0.028 + 0.09 * g) * (0.6 + 0.4 * s) * grow * wobble(i);
  const tail = Math.max(RMIN, r - len);
  return {
    x0: cx + co * tail * ex, y0: cy + si * tail * ey,
    x1: cx + co * r * ex, y1: cy + si * r * ey,
    // 分量怎么分，上面还得再讲一条物理：**无穷远的东西不会拖影**。天空是一片
    // 天光、山在几公里外，相机只是往前平移的话它们不产生径向模糊；真正会糊的
    // 全在路面这一侧。所以往上的线按水平分量打折——贴着天际线横着走的留一点，
    // 直冲云霄的直接没有。
    a: grow * die * s * (si < 0 ? 0.13 * Math.abs(co) ** 1.2 : 0.3) * (0.72 + 0.28 * g),
    w: 1 + s * 1.6 * (0.4 + g),
  };
}

/**
 * 画一整屏速度线。返回画了几条（测试和探针都用得上这个数）。
 *
 * 每条线是**一条路径描两遍**：先拿粗一点、淡一点的一遍当外发光，再拿细而亮的
 * 芯压上去。单像素的硬线不管怎么调都像"有人拿钥匙划了屏幕"，加一层光晕才糊得起来。
 * 颜色仍然是常量，浓淡交给 `globalAlpha`。
 */
export function drawSpeedLines(ctx, cam, speed, now) {
  const s = speedStrength(speed);
  if (s <= 0) return 0;
  const n = Math.round(8 + s * 14);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(222,240,255,1)";
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    const L = lineShape(i, s, now, cam);
    if (!L) continue;
    ctx.beginPath();
    ctx.moveTo(L.x0, L.y0);
    ctx.lineTo(L.x1, L.y1);
    ctx.globalAlpha = L.a * 0.32;
    ctx.lineWidth = L.w * 2.6;
    ctx.stroke();
    ctx.globalAlpha = L.a;
    ctx.lineWidth = L.w;
    ctx.stroke();
    drawn++;
  }
  ctx.restore();
  return drawn;
}
