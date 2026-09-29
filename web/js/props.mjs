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
 * 画法本身住在五个兄弟文件里，按"长出来的 / 地上的 / 人造的 / 盖起来的 / 楼房"分开：
 *   - `propsnature.mjs` 树、红杉、棕榈、仙人掌、枯树、树桩；
 *   - `propsrock.mjs`   原木堆、巨石、石头、草垛、风滚草；
 *   - `propsroad.mjs`   路灯、路牌、信号灯、护栏、雪杆（沿路一根接一根的那种）；
 *   - `propsstreet.mjs` 消防栓、候车亭、长椅、探照灯、招牌、龙门架（一段冒一个）；
 *   - `propsbuild.mjs`  地标：报刊亭、谷仓、风车、水塔、井架、灯塔；
 *   - `propsyard.mjs`   近处：护林站、山地木屋、筒仓、集装箱、油桶；
 *   - `buildings.mjs`   楼房（它的尺寸跨度和分层都比别的道具大一号）；
 *   - `parts.mjs`       材质：木头、钢、水泥、雪、玻璃、锈。
 *
 * 小件预先画进离屏画布再缩放贴上去——每帧几十个 `drawImage` 远比每帧几十次路径
 * 描边便宜，而这些形状一局之内不会变。
 */

import { hash2 } from "../../sim/rng.mjs";
import { themeOf } from "./parts.mjs";
import * as nature from "./propsnature.mjs";
import * as rock from "./propsrock.mjs";
import * as road from "./propsroad.mjs";
import * as street from "./propsstreet.mjs";
import * as build from "./propsbuild.mjs";
import * as yard from "./propsyard.mjs";
import * as eggWild from "./eggwild.mjs";
import * as eggWood from "./eggwood.mjs";
import * as eggCarve from "./eggcarve.mjs";
import * as eggUrban from "./eggurban.mjs";
import * as eggYard from "./eggyard.mjs";

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
  // 彩蛋：一条路一个（画法分在五本里：荒野 `eggwild` / 木头 `eggwood` /
  // 雕件 `eggcarve` / 人烟 `eggurban` / 院子 `eggyard`，共用零件在 `eggart.mjs`）
  skull: [1.2, 2.6], snowman: [1.7, 2.3], boat: [3.4, 1.8], totem: [1.2, 3.4],
  mailbox: [1.4, 1.9], phonebooth: [1.4, 2.9], stall: [3.4, 2.7], warnsign: [1.7, 2.5],
  // 楼房（不走贴图缓存，见 `buildings.mjs`）
  building: [13, 21],
};

/**
 * 贴图画布往**两边**和**上面**多留的余量倍数。
 *
 * 为什么必须有这张表：一件道具的贴图是一块固定大小的离屏画布，**画到画布外面的
 * 部分会被直接切掉**，画面上就是一条笔直的硬边。路灯和工地探照灯的光锥、地面上
 * 那块亮斑，宽度都是道具本身的好几倍——不留余量，它们就只剩灯头底下那一小条，
 * 剩下的全被裁没了。这是"看着像贴了张半透明纸"的真正原因。
 *
 * 留余量等于把画布放宽（或加高），"米 → 像素"的比例不变、接地点仍在画布底边的
 * 中点，所以道具本身的大小和落点都不受影响，多出来的部分只是透明的。
 */
export const DEFAULT_PAD = [1.25, 1.1];
/** `[横向余量, 纵向余量]`，两个都是"倍数"。纵向那一位给"比声明的高度还高"的道具。 */
export const PROP_PAD = {
  // 发光的东西：光锥和地面亮斑按米算，比杆子本身宽出好几倍。
  lamp: [3.9, 1.05], floodlight: [4.6, 1.1], trafficlight: [2.0, 1.05],
  lighthouse: [4.95, 1.15],
  // 枝叶、屋檐、涵管口这类"本体之外还有东西"的：张开的叶子和挑出去的檐口
  // 都是本体宽度的 1.3~2 倍，正好是被切得最难看的一类。
  palm: [2.2, 1.05], deadtree: [1.75, 1.1], pipe: [1.7, 1.1], lodge: [1.7, 1.1],
  redwood: [1.4, 1.05],
  watertower: [1.5, 1.05], silo: [1.45, 1.05], barrel: [1.45, 1.1],
  billboard: [1.45, 1.05], busstop: [1.4, 1.05],
  // 彩蛋里的几件：破船的缆绳拖在沙里、船头又翘出去；电话亭的压顶挑出亭身一截，
  // 顶上那条 "TEL" 还带着光晕，纵向得多留一档。
  boat: [1.3, 2.2], phonebooth: [1.3, 1.15],
  // 风滚草：一团乱枝，最长的几根本来就伸到本体外面，切齐了就成了一个圆饼。
  tumble: [1.35, 1.25],
  // 光打得很高 / 架子搭得很高：往上也得多留一截，不然塔顶那一层齐头切。
  gantry: [1.25, 1.2], derrick: [1.25, 1.15], pine: [1.25, 1.1],
};
/**
 * 一件道具的贴图该留多宽的余量（横向、纵向）。表里只写**比默认值宽**的那些。
 * 数字不是拍脑袋来的，是 `tests/web-land-art.test.mjs` 拿画笔轨迹量出来的：
 * 它会记下每一笔，谁画出了框就报"你需要多少"。改了画法的宽度，测试会指名道姓
 * 地告诉你该把哪一个数字调大。
 */
export const propPad = kind => PROP_PAD[kind] || DEFAULT_PAD;

/** 每一种道具画给谁。**用表而不是一长串 if**：加一种道具 = 加一行。 */
const DRAWERS = {
  tree: nature.tree, pine: nature.pine, redwood: nature.redwood, palm: nature.palm,
  cactus: nature.cactus, deadtree: nature.deadtree, stump: nature.stump,
  logpile: rock.logpile, boulder: rock.boulder, rock: rock.rock,
  haybale: rock.haybale, tumble: rock.tumble,
  lamp: road.lamp, sign: road.sign, trafficlight: road.trafficlight,
  guardrail: road.guardrail, chainfence: road.chainfence, fence: road.fence,
  snowpole: road.snowpole, hydrant: street.hydrant, busstop: street.busstop,
  bench: street.bench, floodlight: street.floodlight, billboard: street.billboard,
  neonsign: street.neonsign, gantry: street.gantry, pipe: street.pipe,
  kiosk: build.kiosk, barn: build.barn, windmill: build.windmill,
  watertower: build.watertower, derrick: build.derrick, lighthouse: build.lighthouse,
  rangerhut: yard.rangerhut, lodge: yard.lodge, silo: yard.silo,
  container: yard.container, barrel: yard.barrel,
  // 彩蛋：一条路一件，见各条赛道的 `scenery` 权重（都很小，所以是"偶尔遇上"）
  skull: eggWild.skull, snowman: eggWild.snowman, boat: eggWood.boat, totem: eggCarve.totem,
  mailbox: eggYard.mailbox, phonebooth: eggUrban.phonebooth,
  stall: eggUrban.stall, warnsign: eggYard.warnsign,
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

/**
 * 一件道具在屏幕上占多宽多高（像素）。**贴图和贴图框必须用同一个函数算**，
 * 否则留了余量的道具会被拉伸成另一个尺寸——那是比裁切更难查的一种错。
 */
export function propBox(kind, ppm) {
  const [w, h] = PROP_SIZE[kind] || PROP_SIZE.tree;
  const [px, py] = propPad(kind);
  return { w: w * px * ppm, h: h * py * ppm };
}

/** 取（或现画）一份道具贴图。返回的 canvas 底边中点就是它的"接地点"。 */
export function propImage(ground, kind) {
  const key = `${ground}:${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [w, h] = PROP_SIZE[kind] || PROP_SIZE.tree;
  const [padX, padY] = propPad(kind);
  const px = Math.min(PX, MAX_PX / Math.max(w * padX, h * padY));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(8, Math.round(w * padX * px));
  canvas.height = Math.max(8, Math.round(h * padY * px));
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
