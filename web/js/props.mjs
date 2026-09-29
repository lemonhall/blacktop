/**
 * 路边的东西：**一张尺寸表 + 一张分发表 + 一个贴图缓存**。
 *
 * 它们**不是状态**——位置由赛道种子现算（`sim/track.mjs` 的 `propsBetween`），
 * 两个宿主算出来的每一棵树都在同一个地方。这一层只负责把它们画出来。
 *
 * 为什么值得花力气：伪 3D 路面上唯一能提供**速度感**的就是"路边的东西刷得多快"。
 * 一条空荡荡的路，哪怕仪表盘写着 200 也像在散步；密到一根根掠过去，60 的时速
 * 就已经吓人了。所以密度和种类都是刻意堆的——八条路一共三十九种道具。
 *
 * 画法本身住在四个兄弟文件里，按"长出来的 / 人造的 / 盖起来的 / 楼房"分开：
 *   - `propsnature.mjs` 树、仙人掌、石头、草垛、风滚草；
 *   - `propsroad.mjs`   路灯、路牌、护栏、雪杆、候车亭、招牌、龙门架；
 *   - `propsbuild.mjs`  谷仓、风车、水塔、井架、灯塔、木屋、筒仓、集装箱；
 *   - `buildings.mjs`   楼房（它的尺寸跨度和分层都比别的道具大一号）；
 *   - `parts.mjs`       材质：木头、钢、水泥、雪、玻璃、锈。
 *
 * 小件预先画进离屏画布再缩放贴上去——每帧几十个 `drawImage` 远比每帧几十次路径
 * 描边便宜，而这些形状一局之内不会变。
 */

import { hash2 } from "../../sim/rng.mjs";
import { themeOf } from "./parts.mjs";
import * as nature from "./propsnature.mjs";
import * as road from "./propsroad.mjs";
import * as build from "./propsbuild.mjs";

/** 每种道具的**实际尺寸（米）**：宽 × 高。贴图与判定都按它走。 */
export const PROP_SIZE = {
  // 长出来的
  tree: [2.8, 6.6], pine: [3.2, 8.4], redwood: [3.6, 24], palm: [3.4, 7.6],
  cactus: [2.2, 4.6], deadtree: [3.2, 4.6], stump: [1.6, 1.1], logpile: [3.2, 1.6],
  boulder: [3.4, 2.2], rock: [2.6, 1.7], haybale: [2.4, 1.5], tumble: [1.1, 1],
  // 人造的
  lamp: [1.9, 7.4], sign: [1.7, 3.3], trafficlight: [2.2, 6.2], guardrail: [4.2, 1.3],
  chainfence: [4.4, 2.4], fence: [3.6, 1.4], snowpole: [1, 3], hydrant: [0.9, 1.15],
  busstop: [3.6, 3], bench: [2.2, 1.2], floodlight: [2.6, 9], billboard: [5.4, 4.4],
  neonsign: [2.6, 5.2], gantry: [5.6, 7.2], pipe: [3.2, 1.6],
  // 盖起来的
  kiosk: [3, 3.2], barn: [7.4, 6.2], windmill: [4.6, 7.6], watertower: [5.2, 9.4],
  derrick: [4.2, 12.6], lighthouse: [4.4, 13], rangerhut: [4.4, 3.6], lodge: [6.4, 4.6],
  silo: [3.4, 9.6], container: [6.4, 2.7], barrel: [1.1, 1.5],
  // 楼房（不走贴图缓存，见 `buildings.mjs`）
  building: [13, 21],
};

/** 每一种道具画给谁。**用表而不是一长串 if**：加一种道具 = 加一行。 */
const DRAWERS = {
  tree: nature.tree, pine: nature.pine, redwood: nature.redwood, palm: nature.palm,
  cactus: nature.cactus, deadtree: nature.deadtree, stump: nature.stump,
  logpile: nature.logpile, boulder: nature.boulder, rock: nature.rock,
  haybale: nature.haybale, tumble: nature.tumble,
  lamp: road.lamp, sign: road.sign, trafficlight: road.trafficlight,
  guardrail: road.guardrail, chainfence: road.chainfence, fence: road.fence,
  snowpole: road.snowpole, hydrant: road.hydrant, busstop: road.busstop,
  bench: road.bench, floodlight: road.floodlight, billboard: road.billboard,
  neonsign: road.neonsign, gantry: road.gantry, pipe: road.pipe,
  kiosk: build.kiosk, barn: build.barn, windmill: build.windmill,
  watertower: build.watertower, derrick: build.derrick, lighthouse: build.lighthouse,
  rangerhut: build.rangerhut, lodge: build.lodge, silo: build.silo,
  container: build.container, barrel: build.barrel,
};

/**
 * 所有画得出来的道具种类。测试拿它验"`maps.mjs` 里写的名字都有画法"。
 * `building` 单列：它由 `buildings.mjs` **现画**（尺寸跨度太大，缓存成贴图会糊），
 * 所以它不在这张分发表里，但它照样是一种有画法的道具。
 */
export const PROP_KINDS = [...Object.keys(DRAWERS), "building"];
export const hasProp = kind => kind === "building" || Object.hasOwn(DRAWERS, kind);

/**
 * 一个道具的种子：**由名字定死**，不随时间变。
 * 所以同一棵树在每一帧、每一台机器上长得一模一样（窗户不会自己乱跳）。
 */
function kindSeed(kind) {
  let h = 2166136261;
  for (let i = 0; i < kind.length; i++) h = (h ^ kind.charCodeAt(i)) * 16777619 >>> 0;
  return h % 100000;
}

/** 贴图的像素密度。64 px/米 对 6 米高的树正好是 400 像素，够近处看，也不占内存。 */
const PX = 64;
/** 单张贴图的最高像素数——24 米的红杉也不能把显存吃掉。 */
const MAX_PX = 1600;

const cache = new Map();

/** 取（或现画）一份道具贴图。返回的 canvas 底边中点就是它的"接地点"。 */
export function propImage(ground, kind) {
  const key = `${ground}:${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [w, h] = PROP_SIZE[kind] || PROP_SIZE.tree;
  const px = Math.min(PX, MAX_PX / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(8, Math.round(w * px));
  canvas.height = Math.max(8, Math.round(h * px));
  const ctx = canvas.getContext("2d");
  ctx.translate(canvas.width / 2, canvas.height);
  ctx.scale(px, -px);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  drawProp(ctx, ground, kind, w, h, kindSeed(kind));
  cache.set(key, canvas);
  return canvas;
}

/** 把一件道具画进"米"空间。`kind` 没有画法时什么都不做（旧存档里的陌生名字）。 */
export function drawProp(ctx, ground, kind, w, h, seed = kindSeed(kind)) {
  const painter = DRAWERS[kind];
  if (!painter) return;
  painter(ctx, w, h, themeOf(ground), seed);
}

/** 道具里用的哈希（给需要"某一件和别的不一样"的画法用）。 */
export const propHash = hash2;

/*
 * 楼房住在 `buildings.mjs`（它比这个文件里的任何一件道具都复杂，值得单独一间）。
 * 这里转出去，是为了让"路边的东西"始终只有一个入口可以 import。
 */
export { drawBuilding } from "./buildings.mjs";
