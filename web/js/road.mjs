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
import { shade, trapezoid } from "./art.mjs";
import { grainOverlay } from "./grain.mjs";
import { tonesOf } from "./grounds.mjs";
import { seaBand, shoulderDetail, tyreTracks } from "./roadwear.mjs";
import { fieldDetail } from "./fieldwear.mjs";
import { drawLapLines } from "./finishline.mjs";

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
  /*
   * 速度感的一半在**镜头**上，不在路上。
   *
   * 静止时镜头贴得近、视野窄，一切四平八稳；上了两百公里，镜头往后拉一截半、
   * 视野往外张十分之一，路面两边的东西以更陡的角度往画面外划——人不会说
   * "视野变宽了"，只会说"快了"。上一版这两样全是常数，所以快慢只体现在
   * 车道线跑得多快上。
   *
   * 幅度刻意做得**小**：这是油门踩到底才该有的东西，不是全程都在的鱼眼。
   */
  const fast = me ? clamp((me.v || 0) / 52, 0, 1) : 0;
  /*
   * 第二半在**挨的那一下**上：`S.punch` 是表现层砸过来的一拳（打中人、被撞、踹飞
   * 社会车辆各自不同份量），在这里换算成"画面往外张一下"，三百毫秒左右回位。
   * 幅度压得很小：这是挨了一下，不是开了鱼眼。
   */
  const punch = S.punch || 0;
  const camZ = (me ? me.z : 0) - (CAM_BACK + fast * 1.5);
  return {
    W: S.view.w, H: S.view.h, F: S.view.h * (PROJ - fast * 0.1 + punch * 0.09),
    horizon: S.view.h * HORIZON,
    camX: me ? me.x : 0, camZ,
    camY: S.track.hillAt(camZ) + CAM_Y + fast * 0.1,
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
  // 每条车道的中心线：轮胎痕和油渍都挂在它上面
  const laneXs = [];
  for (let i = 0; i < track.lanes; i++) laneXs.push(track.laneX(i));
  for (let i = SLICES - 1; i >= 0; i--) {
    const near = sliceAt(cam, tbl, i, half), far = sliceAt(cam, tbl, i + 1, half);
    if (!near || !far) continue;
    const yF = far.y, yN = Math.max(near.y, yF);
    if (yN - yF < 0.6) continue;
    if (yF > cam.H + 2) break;
    const z = (tbl.zs[i] + tbl.zs[i + 1]) / 2;
    // `dz` 是这一片沿 z 的长度：路外那些**贴在地上**的东西（土斑、落叶）要按它
    // 算出"纵向被压扁了多少"。不压的话，脚下那些斑会画成正圆——像浮在空中的圆片。
    const geom = { far, near, yF, yN, z, dz: tbl.zs[i + 1] - tbl.zs[i] };
    /*
     * **这一片到底有多高**——低于两个像素的那几片，路肩上的砂砾、轮胎压出来的沟、
     * 水滴的倒影全都画不出一个像素来，却要照样发几十次画布调用。八条路的痕迹是
     * 这条路上最贵的一笔（每条车道两条沟，四条车道就是八条），所以这里按"看得见
     * 看不见"来分级：近处画全套，远处只留路、路缘石和车道线。
     *
     * 2.2 是试出来的：再低一点，中景的路面上会看见轮胎痕"断"了一截。
     */
    const tall = yN - yF > 2.2;
    // 每一格的路面亮度抖一点点（按**世界坐标**抖，所以车往前开时纹路是静止的）。
    // 一整条纯色的路是这一版之前最"塑料"的地方。
    const wear = hash2(Math.floor(z / 3), 11) * 0.09 - 0.045;
    // 路肩（整幅铺满：地形是一个面，不是一个盒子）
    ctx.fillStyle = tone.shoulder[band2(z, 14)];
    ctx.fillRect(0, yF, W, yN - yF);
    // 海：有水的赛道在路肩外面直接铺一片水——它得压在路肩之上、路面之下
    seaBand(ctx, track.ground, geom, W);
    // 路面
    const band = band2(z, 12);
    ctx.fillStyle = shade(tone.road[band], wear);
    trapezoid(ctx, far.x, far.hw, yF, near.x, near.hw, yN);
    if (tall) {
      // 车轮压出来的沟：两条一起，一左一右
      tyreTracks(ctx, laneXs, geom, tone.rut);
      // 路肩之外那一片地（干草、沙纹、雪脊、落叶）：先铺它，再铺贴着路缘的东西，
      // 于是"从路里往外长"的那几笔自然压在它上面。
      fieldDetail(ctx, track.ground, geom);
      // 路肩上的痕迹**在路面之后画**：沙漠的沙是从路肩往路面上爬的，先画就被路面盖掉了
      shoulderDetail(ctx, track.ground, geom);
    }
    // 路缘石
    ctx.fillStyle = tone.rumble[band];
    // 左右两条路缘石**合成一个路径**再填一次：同色、同片，分开画等于白多两次
    // beginPath/fill。远看是两条，近看还是两条，中间那段空白由路面自己盖住。
    ctx.beginPath();
    ctx.moveTo(far.x - far.hw - far.rumble, yF);
    ctx.lineTo(far.x - far.hw, yF);
    ctx.lineTo(near.x - near.hw, yN);
    ctx.lineTo(near.x - near.hw - near.rumble, yN);
    ctx.closePath();
    ctx.moveTo(far.x + far.hw, yF);
    ctx.lineTo(far.x + far.hw + far.rumble, yF);
    ctx.lineTo(near.x + near.hw + near.rumble, yN);
    ctx.lineTo(near.x + near.hw, yN);
    ctx.closePath();
    ctx.fill();
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
  // 圈线与终点横幅：投影函数由这里交出去，那一层于是不必反过来 import 这个文件。
  drawLapLines(ctx, cam, tbl, S, { bendAt, hillAt });
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

