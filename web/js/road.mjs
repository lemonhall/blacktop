/**
 * 投影伪 3D 路面：这个项目里唯一需要"想一下"的渲染部分。
 *
 * 核心只有一句话：**路本身永远是直的，弯的是视线。**
 * 真实世界里一条 240 米半径的弯道上，车子开出去 150 米已经横移了 47 米——
 * 所以我们把"曲率对 z 积分两次"当成相机的横移量，再用一个针孔相机把路面投出去。
 * 于是同一条 `curveAt(z)`：物理层拿它算离心力（`v²κ`），渲染层拿它算视线偏移。
 * 一份数据，两种用法，永远不会对不上。
 *
 * 投影是**各向同性**的：焦距 F 由画面高度决定，横向与纵向用同一个"像素/米"，
 * 所以"画出来的车宽"就等于"判定用的车宽"——玩家不会撞上一个看不见的角。
 */

// 共享内核用**相对路径**引用：浏览器从 `/js/road.mjs` 出发，"../sim/x.mjs" 仍然是
// `/sim/x.mjs`（和写死绝对路径完全等价），而 `node --test` 也能把同一份文件加载进来。
// 渲染层过去是测试盲区，就因为这里写死了一个只有服务器才知道的绝对路径。
import { LANE_W, clamp } from "../../sim/constants.mjs";
import { hash2 } from "../../sim/rng.mjs";
import { shade } from "./art.mjs";
import { grainOverlay } from "./grain.mjs";
import { tonesOf } from "./grounds.mjs";

/** 焦距 = 画面高度 × 这个数。1.25 对应约 70° 的水平视野，是追尾视角的舒适区。 */
const PROJ = 1.25;
/** 相机挂在自己车后多少米。太近会看不见自己的车，太远就变成"开别人的车"。 */
export const CAM_BACK = 8.6;
/** 相机离地高度（米）。 */
const CAM_Y = 2.72;
/** 地平线在画面的高度比例：留出上面一半给天空和远处的路。 */
const HORIZON = 0.42;
const NEAR = 2.4;
const FAR = 660;
/** 采样本数。近处密、远处疏（按 t² 分布）——远处差几米看不出来，近处差一米就是锯齿。 */
const SLICES = 78;

/*
 * 配色（`grounds.mjs`）与颗粒（`grain.mjs`）都搬去了兄弟文件：
 * 这个文件只留"怎么把三维的路投到二维画面上"，改配色不该需要先读懂透视。
 * `tonesOf` 还从这里转出去，是因为渲染层一直是这么 import 的。
 */
export { tonesOf };

/** 相机：横向**严格跟着我**（不跟就是"车自己在飘"），纵向贴着路面起伏。 */
export function createCamera(S) {
  const me = S.me;
  const camZ = (me ? me.z : 0) - CAM_BACK;
  return {
    W: S.view.w, H: S.view.h, F: S.view.h * PROJ,
    horizon: S.view.h * HORIZON,
    camX: me ? me.x : 0, camZ,
    camY: S.track.hillAt(camZ) + CAM_Y,
  };
}

/**
 * 把曲率沿视线积两次，得到每一片的"横移量"。
 *
 * 累加而不是解析式，是为了让**近处严格跟手、远处饱和**：解析式在 600 米外会给出
 * 上千公里的横移，画面直接飞走；逐片累加天然把误差留在看不见的地方。
 */
export function buildSlices(S, cam) {
  const track = S.track;
  const zs = new Float64Array(SLICES + 1);
  const bends = new Float64Array(SLICES + 1);
  const hills = new Float64Array(SLICES + 1);
  let bend = 0, rate = 0, prev = cam.camZ + NEAR;
  for (let i = 0; i <= SLICES; i++) {
    const t = i / SLICES;
    const z = cam.camZ + NEAR + (FAR - NEAR) * t * t;
    const dz = z - prev;
    rate = clamp(rate + track.curveAt(prev) * dz, -6, 6);
    bend = clamp(bend + rate * dz, -1400, 1400);
    zs[i] = z; bends[i] = bend; hills[i] = track.hillAt(z);
    prev = z;
  }
  return { zs, bends, hills };
}

const indexOf = (tbl, z) => {
  const span = tbl.zs[SLICES] - tbl.zs[0];
  const t = clamp((z - tbl.zs[0]) / span, 0, 1);
  return Math.sqrt(t) * SLICES;
};

/** 任意 z 处的视线横移（精灵要与路面共用它，否则车会浮在路外面）。 */
export function bendAt(tbl, z) {
  const idx = indexOf(tbl, z);
  const i = Math.min(SLICES - 1, Math.floor(idx));
  return tbl.bends[i] + (tbl.bends[i + 1] - tbl.bends[i]) * (idx - i);
}

export function hillAt(tbl, z) {
  const idx = indexOf(tbl, z);
  const i = Math.min(SLICES - 1, Math.floor(idx));
  return tbl.hills[i] + (tbl.hills[i + 1] - tbl.hills[i]) * (idx - i);
}

/**
 * 把一个世界点投到屏幕上。返回 `null` 表示"在相机后面"——调用方必须处理，
 * 否则一根倒插进画面的大灯会突然占满整个屏幕。
 */
export function project(cam, tbl, x, y, z) {
  const relZ = z - cam.camZ;
  if (relZ < 1.1) return null;
  const ppm = cam.F / relZ;
  return {
    sx: cam.W / 2 + ppm * (x - cam.camX - bendAt(tbl, z)),
    sy: cam.horizon - ppm * (y - cam.camY),
    ppm, relZ,
  };
}

/**
 * 地形遮挡：从相机到目标点连一条线，中途只要被地面顶穿，这个目标就看不见。
 * 没有它，上坡后面那台车会浮在半空——那是伪 3D 里最刺眼的一种穿帮。
 */
export function occluded(S, cam, x, y, z) {
  const steps = 10;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const zz = cam.camZ + (z - cam.camZ) * t;
    const yy = cam.camY + (y - cam.camY) * t;
    if (S.track.hillAt(zz) > yy) return true;
  }
  void x;
  return false;
}

function trapezoid(ctx, xA, wA, yA, xB, wB, yB) {
  ctx.beginPath();
  ctx.moveTo(xA - wA, yA); ctx.lineTo(xA + wA, yA);
  ctx.lineTo(xB + wB, yB); ctx.lineTo(xB - wB, yB);
  ctx.closePath(); ctx.fill();
}

/**
 * "第几格"的斑马纹下标，取值 0/1。
 *
 * 必须写成 `+2 % 2`：相机在自己车后 8.6 米，于是比赛刚开始时 z 是**负数**，
 * 而 JS 的 `-1 % 2 === -1`——上一版用 `tone.road[-1]` 取色，取到 undefined。
 * 那个 undefined 赋给 `fillStyle` 不会报错（浏览器直接忽略），所以它一直藏着，
 * 一直到某天有人拿这个颜色去做 `shade()` 才炸出来。
 */
const band2 = (z, span) => ((Math.floor(z / span) % 2) + 2) % 2;

/**
 * 整条路。**从远往近画**：近处最后上色，自然盖住远处——地形是一个高度场，
 * 远近排序就是正确的遮挡顺序，不需要任何深度缓冲。
 */
export function drawRoad(ctx, cam, tbl, S) {
  const track = S.track;
  // 地面配色跟着**赛道**走，不跟着"模式"走：一个模式可能在表里换过地面，
  // 而 `track.ground` 是编译进赛道的那一份，永远和这条路的其它参数一致。
  const tone = tonesOf(track.ground || S.mode);
  const W = cam.W;
  const half = track.halfWidth;
  const boundaries = [];
  for (let i = 0; i < track.lanes - 1; i++) {
    boundaries.push({ x: track.laneX(i) + LANE_W / 2, divider: i === track.sameLanes[0] - 1 });
  }
  for (let i = SLICES - 1; i >= 0; i--) {
    const near = sliceAt(cam, tbl, i, half), far = sliceAt(cam, tbl, i + 1, half);
    if (!near || !far) continue;
    const yF = far.y, yN = Math.max(near.y, yF);
    if (yN - yF < 0.6) continue;
    if (yF > cam.H + 2) break;
    const z = (tbl.zs[i] + tbl.zs[i + 1]) / 2;
    // 每一格的路面亮度抖一点点（按**世界坐标**抖，所以车往前开时纹路是静止的）。
    // 一整条纯色的路是这一版之前最"塑料"的地方。
    const wear = hash2(Math.floor(z / 3), 11) * 0.09 - 0.045;
    // 路肩（整幅铺满：地形是一个面，不是一个盒子）
    ctx.fillStyle = tone.shoulder[band2(z, 14)];
    ctx.fillRect(0, yF, W, yN - yF);
    // 路面
    const band = band2(z, 12);
    ctx.fillStyle = shade(tone.road[band], wear);
    trapezoid(ctx, far.x, far.hw, yF, near.x, near.hw, yN);
    // 路缘石
    ctx.fillStyle = tone.rumble[band];
    trapezoid(ctx, far.x - far.hw - far.rumble * 0.5, far.rumble * 0.5, yF,
      near.x - near.hw - near.rumble * 0.5, near.rumble * 0.5, yN);
    trapezoid(ctx, far.x + far.hw + far.rumble * 0.5, far.rumble * 0.5, yF,
      near.x + near.hw + near.rumble * 0.5, near.rumble * 0.5, yN);
    // 车道线：虚线用"隔一段画一段"实现，掠过的节奏就是速度感
    const dash = Math.floor(z / 9) % 2 === 0;
    for (const b of boundaries) {
      if (!b.divider && !dash) continue;
      const xF = far.x + b.x * far.ppm, xN = near.x + b.x * near.ppm;
      ctx.fillStyle = b.divider ? tone.divider : tone.lane;
      const wF = (b.divider ? 0.22 : 0.17) * far.ppm;
      const wN = (b.divider ? 0.22 : 0.17) * near.ppm;
      trapezoid(ctx, xF, wF, yF, xN, wN, yN);
    }
  }
  // 0.14 是试出来的：再高一点，路面就变成一张砂纸。
  // 两层颗粒：底下一层是这条路的"土质"，上面一层永远是沥青——因为路面是柏油，
  // 路肩外面才是土。少了上面那一层，沙漠里的路看起来就是一条沙丘。
  grainOverlay(ctx, cam, tone.grain, 0.17);
  if (tone.grain !== "asphalt") grainOverlay(ctx, cam, "asphalt", 0.13);
  // 湿路面：把地平线那一带的天色拉下来一层。雨天/夜里的路**必须**有这一笔，
  // 否则霓虹夜市的招牌就只是贴在黑纸上的一排彩色方块，脚下什么都没有。
  if (tone.wet > 0.01) {
    const refl = ctx.createLinearGradient(0, cam.horizon, 0, cam.horizon + cam.H * 0.3);
    refl.addColorStop(0, tone.fog.replace(/[\d.]+\)$/u, `${(tone.wet * 0.55).toFixed(2)})`));
    refl.addColorStop(0.45, "rgba(0,0,0,0)");
    ctx.fillStyle = refl;
    ctx.fillRect(0, cam.horizon, W, cam.H * 0.3);
  }
  finishBanner(ctx, cam, tbl, S);
  // 雾：远处融进天色，也让"路的尽头"不显得像一堵墙
  const fog = ctx.createLinearGradient(0, cam.horizon - 6, 0, cam.horizon + cam.H * 0.34);
  fog.addColorStop(0, tone.fog);
  fog.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = fog;
  ctx.fillRect(0, cam.horizon - 6, W, cam.H * 0.36);
  ctx.fillStyle = "rgba(0,0,0,.16)";
  ctx.fillRect(0, cam.horizon - 2, W, 2);
}

function sliceAt(cam, tbl, i, halfWidth) {
  const relZ = tbl.zs[i] - cam.camZ;
  if (relZ < 1.1) return null;
  const ppm = cam.F / relZ;
  return {
    ppm,
    x: cam.W / 2 - ppm * (cam.camX + tbl.bends[i]),
    y: cam.horizon - ppm * (tbl.hills[i] - cam.camY),
    hw: halfWidth * ppm, rumble: 0.5 * ppm,
  };
}

/** 终点横幅：格子旗拉在路面上方，是"这一局快结束了"最直观的信号。 */
function finishBanner(ctx, cam, tbl, S) {
  const z = S.track.length;
  const relZ = z - cam.camZ;
  if (relZ < 4 || relZ > 420) return;
  const ppm = cam.F / relZ;
  const x = cam.W / 2 - ppm * (cam.camX + bendAt(tbl, z));
  const y = cam.horizon - ppm * (S.track.hillAt(z) - cam.camY);
  const hw = S.track.halfWidth * ppm;
  const cell = Math.max(3, (hw * 2) / 16);
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 ? "#f4f7ff" : "#151922";
    ctx.fillRect(x - hw + i * cell, y - 0.5 * ppm, cell, 0.9 * ppm);
  }
  ctx.fillStyle = "#f4f7ff";
  ctx.fillRect(x - hw, y - 2.6 * ppm, hw * 2, 0.16 * ppm);
  ctx.fillRect(x - hw, y - 0.9 * ppm, hw * 2, 0.16 * ppm);
}
