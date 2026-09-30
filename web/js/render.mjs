/**
 * 把一帧画面拼出来：天空 → 路面 → 精灵 → 屏幕上层的字与光。
 *
 * 顺序就是全部的设计：伪 3D 没有深度缓冲，**谁后画谁在上面**。
 * 所以这里只维护一件事——所有立体物按 z 从远到近排好队，一个接一个贴上去。
 * 天与路是背景，字是前景，中间夹着的那一层才是"世界"。
 */

import { FX, S } from "./state.mjs";
import { backdrop } from "./sky.mjs";
import { buildSlices, createCamera, drawRoad, occluded, project, tonesOf } from "./road.mjs";
import { drawCritter } from "./critters.mjs";
import { label } from "./labels.mjs";
import { drawRider } from "./sprites.mjs";
import { drawVehicle } from "./vehicles.mjs";
import { CAR_NAME } from "./fxevent.mjs";
import { PROP_SIZE, drawBuilding, propBox, propImage } from "./props.mjs";
import { WEAPONS } from "../../sim/weapons.mjs";
import { drawPickup } from "./weaponsart.mjs";
import { CRITTERS } from "../../sim/critters.mjs";
import { drawOverlays } from "./overlays.mjs";
import { drawPuff, drawSpark, variantOf } from "./particles.mjs";

/**
 * 跳字的字号：**按距离长，但封顶**。
 *
 * 跳字（`+400`、`悬赏 1500`）挂在"那一件东西"上，而那件东西常常就贴在我车头前面
 * 两三米——刚踹飞的那台车、刚捡起来的那件家伙。那一处的 ppm 能到三四百，字号跟着
 * 长就是一个字铺满半个屏幕，比当时发生的事还大。所以到 28/44 像素就到顶。
 */
export function floaterSize(ppm, big) {
  return Math.min(big ? 44 : 28, (big ? 1.15 : 0.85) * ppm + 8);
}

export function renderGame(ctx, view) {
  if (!view || !S.track) return;
  const W = S.view.w, H = S.view.h;
  ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
  const cam = createCamera(S);
  const tbl = buildSlices(S, cam);
  const tone = tonesOf(S.mode);

  ctx.save();
  if (S.shake > 0.05) {
    ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
    // 位移之外再拧一点点角度：只有平移的震动看着像画面在"抖"，加上滚转才像
    // 整台摄像机被人从侧面撞了一下。幅度按像素比例给，换分辨率不会变重。
    ctx.rotate((Math.random() - 0.5) * S.shake * 0.0009);
  }
  // 天色读的是**赛道**（`maps.mjs` 里的 `sky`），不是房间里的模式名：
  // 一条路的天和地是一对，分开写迟早会出现"沙漠上挂着红杉林的天"。
  const sky = backdrop(S.track.sky || S.mode, W, Math.ceil(cam.horizon) + 2, cam.horizon);
  ctx.drawImage(sky, 0, 0);
  ctx.fillStyle = tone.shoulder[0];
  ctx.fillRect(0, cam.horizon - 1, W, H - cam.horizon + 1);
  drawRoad(ctx, cam, tbl, S);
  drawSkid(ctx, cam, tbl);
  drawWorld(ctx, cam, tbl, view);
  drawFx(ctx, cam, tbl);
  ctx.restore();

  drawOverlays(ctx, view, cam);
}

/** 胎痕：压在路面上，所以画在精灵之前——它是路面的一部分，不是空气里的东西。 */
function drawSkid(ctx, cam, tbl) {
  ctx.fillStyle = "rgba(16,16,20,.42)";
  for (const k of FX.skid) {
    const p = project(cam, tbl, k.x, S.track.hillAt(k.z), k.z);
    if (!p || p.ppm < 0.3) continue;
    const w = 0.26 * p.ppm, h = 1.1 * p.ppm;
    ctx.globalAlpha = Math.min(0.5, k.life / k.max * 0.6);
    ctx.fillRect(p.sx - w / 2, p.sy - h, w, h);
  }
  ctx.globalAlpha = 1;
}

/**
 * 粒子与跳字：在"世界的空气里"，所以画在所有立体物之后。
 *
 * **粒子的 `y` 是"离地多高"，而 `project` 要的是"世界多高"**（车、道具、骑手
 * 传进去的都是 `hillAt(z) + 离地`）。少了这一步换算，粒子就是拿"离地 0.1 米"
 * 去减"相机的世界高度"：在洼地里（`hillAt` 为负）这一减是正的，于是自己后轮
 * 扬起的土会一路飘到天上，变成几枚横在天上的大圆饼——远看像镜头光斑，其实
 * 是扬尘。上坡时错在另一头：土沉到路面以下，白撒。
 */
const worldY = (z, y) => S.track.hillAt(z) + y;

export function drawFx(ctx, cam, tbl) {
  const W = cam.W, H = cam.H;
  // 冲击环画在粒子**之前**：它在空气里是最大的一圈，压在它后面的火花才看得见。
  for (const r of FX.rings) {
    const q = project(cam, tbl, r.x, worldY(r.z, r.y), r.z);
    if (!q || q.ppm < 0.2) continue;
    const p = r.t / r.max;
    const rad = (0.7 + p * 7.5) * r.k * q.ppm * 0.5;
    if (rad < 1) continue;
    ctx.strokeStyle = `${r.color}${((1 - p) * 0.75).toFixed(3)})`;
    ctx.lineWidth = Math.max(1, (1 - p) * 1.8 * r.k * Math.min(1, q.ppm / 60));
    ctx.beginPath();
    ctx.ellipse(q.sx, q.sy, rad, rad * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const p of FX.smoke) {
    const q = project(cam, tbl, p.x, worldY(p.z, p.y), p.z);
    // 屏幕外的不画：撞车那一瞬间，烟和火星子会往两侧甩出去几十团，其中一大半
    // 落在画面左右之外。以前它们照样要各画一笔——`project` 算了、`arc` 也发了，
    // 只是最后没落在屏幕上。
    if (!q || q.ppm < 0.25 || q.sx < -30 || q.sx > W + 30 || q.sy < -30 || q.sy > H + 30) continue;
    // 一团烟是**软边贴图**，不是一枚实心圆：好几团叠在一起时，圆片会变成一碗看得见
    // 圈数的肥皂泡。画法见 `particles.mjs`。
    drawPuff(ctx, q.sx, q.sy, Math.max(1, p.size * q.ppm), p.color,
      Math.max(0, p.life / p.max) * 0.75, variantOf(p));
  }
  for (const p of FX.sparks) {
    // 火星子是**一道往回拖的短划**（见 `particles.mjs`），不是屏幕上的小方块。
    drawSpark(ctx, cam, tbl, S.track.hillAt, p);
  }
  ctx.globalAlpha = 1;
  for (const f of FX.floaters) {
    const q = project(cam, tbl, f.x, worldY(f.z, f.y), f.z);
    if (!q || q.ppm < 0.4) continue;
    ctx.globalAlpha = Math.max(0, f.life / f.max);
    // 字号按距离长，但**必须封顶**：跳字是挂在"那一件东西"上的，而它常常就贴在
    // 我车头前面两三米（刚刚踹飞的那台车、刚捡起来的那件家伙），那一处的 ppm 能到
    // 三四百——一个字于是铺满半个屏幕，比当时发生的事还大。
    label(ctx, q.sx, q.sy, f.text, f.color, floaterSize(q.ppm, f.big));
  }
  ctx.globalAlpha = 1;
}

/** 所有立体物：按 z 从远到近排队，一个队列解决遮挡。 */
function drawWorld(ctx, cam, tbl, view) {
  const queue = [];
  const far = cam.camZ + 660;
  for (const prop of S.track.propsBetween(cam.camZ - 8, far)) {
    queue.push({ z: prop.z, kind: "prop", item: prop });
  }
  // 地上的家伙和道具走同一条排队规则：按 z 从远到近。它们躺在路面上，
  // 所以谁在谁前面、谁挡着谁，全靠这一条。
  for (const p of view.pickups || []) queue.push({ z: p.z, kind: "pickup", item: p });
  for (const v of view.traffic) queue.push({ z: v.z, kind: "traffic", item: v });
  for (const c of view.critters || []) queue.push({ z: c.z, kind: "critter", item: c });
  for (const r of view.racers) queue.push({ z: r.z, kind: "racer", item: r });
  queue.sort((a, b) => b.z - a.z);
  for (const entry of queue) {
    if (entry.kind === "prop") drawProp(ctx, cam, tbl, entry.item);
    else if (entry.kind === "pickup") drawGroundWeapon(ctx, cam, tbl, entry.item);
    else if (entry.kind === "traffic") drawTraffic(ctx, cam, tbl, entry.item);
    else if (entry.kind === "critter") drawCritterSprite(ctx, cam, tbl, entry.item);
    else drawRacerSprite(ctx, cam, tbl, entry.item, view);
  }
}

/** 躺在地上的家伙。和车一样走投影，所以它会随距离缩小、也会被地形挡住。 */
function drawGroundWeapon(ctx, cam, tbl, p) {
  const spec = WEAPONS[p.i];
  if (!spec) return;
  const q = project(cam, tbl, p.x, S.track.hillAt(p.z), p.z);
  if (!q || q.ppm < 0.06) return;
  drawPickup(ctx, q.sx, q.sy, q.ppm * 0.9, spec.id, p.charges);
}

function drawProp(ctx, cam, tbl, prop) {
  const track = S.track;
  const size = PROP_SIZE[prop.kind];
  if (!size) return;
  const ground = track.hillAt(prop.z);
  if (occluded(S, cam, prop.x, ground, prop.z)) return;
  const p = project(cam, tbl, prop.x, ground, prop.z);
  if (!p || p.ppm < 0.02) return;
  // 贴图框由 `propBox` 算：发光的道具（路灯、探照灯）画布要留余量，
  // 否则光锥会被裁成一条硬边。留的是透明的边，不影响道具本身的大小。
  const box = propBox(prop.kind, p.ppm * prop.s);
  const w = box.w, h = box.h;
  if (p.sx + w < -40 || p.sx - w > cam.W + 40 || h < 2) return;
  // 大气透视：远处的东西往天色里化。没有这一步，两百米外的树和眼前的树一样黑，
  // 画面就是一张平贴的贴纸——这是伪 3D 里最便宜也最有效的一笔纵深感。
  const fogK = Math.max(0, Math.min(1, (prop.z - cam.camZ - 70) / 500));
  if (prop.kind === "building") {
    // 墙身本色来自这条路的地面配色——八条路各有各的楼，以前只有城市和荒野两种。
    const tone = tonesOf(track.ground).building;
    drawBuilding(ctx, {
      sx: p.sx, baseY: p.sy, s: p.ppm * prop.s, seed: prop.i,
      width: size[0], height: size[1], tone, hazeK: fogK, ground: track.ground,
    });
    return;
  }
  const img = propImage(track.ground, prop.kind);
  ctx.globalAlpha = 1 - fogK * 0.55;
  ctx.drawImage(img, p.sx - w / 2, p.sy - h, w, h);
  ctx.globalAlpha = 1;
}

function drawTraffic(ctx, cam, tbl, v) {
  const ground = S.track.hillAt(v.z);
  if (v.state === "run" && occluded(S, cam, v.x, ground, v.z)) return;
  const p = project(cam, tbl, v.x, ground, v.z);
  if (!p || p.ppm < 0.03) return;
  drawVehicle(ctx, {
    cx: p.sx, baseY: p.sy, s: p.ppm, kind: v.kind, id: v.id,
    dir: v.dir, spin: v.spin, air: v.y > 0.05 ? v.y : 0,
    // 被踹过的车会瘪：`dmg` 不传进去，这一脚在画面上就白踹了。
    dmg: v.dmg || 0,
  });
  // 飞在天上的车值得头顶挂一行字——只在近处挂，远了反而乱。
  if (p.ppm > 1.1 && v.state === "flung") {
    const name = CAR_NAME[v.kind] || "车";
    label(ctx, p.sx, p.sy - 5.2 * p.ppm, `${name}起飞!`, "#ffd23f", 1.05 * p.ppm);
  }
}

/**
 * 一头畜生。它躺在路面上，所以只做投影、不做遮挡判定——被踹飞的牛也不该
 * 突然消失在一根电线杆后面。尺寸从 `sim/critters.mjs` 取，画多宽就是撞多宽。
 */
function drawCritterSprite(ctx, cam, tbl, c) {
  const info = CRITTERS[c.kind];
  if (!info) return;
  const ground = S.track.hillAt(c.z);
  const p = project(cam, tbl, c.x, ground, c.z);
  if (!p || p.ppm < 0.05) return;
  drawCritter(ctx, {
    cx: p.sx, baseY: p.sy, s: p.ppm, kind: c.kind, dir: c.dir,
    spin: c.spin, air: c.y > 0.05 ? c.y : 0, w: info.len, h: info.h,
  });
}

function drawRacerSprite(ctx, cam, tbl, r, view) {
  const ground = S.track.hillAt(r.z);
  if (r.state === "ride" && occluded(S, cam, r.x, ground, r.z)) return;
  const p = project(cam, tbl, r.x, ground, r.z);
  if (!p || p.ppm < 0.05) return;
  const me = r.id === (view.mine ? view.mine.id : -1);
  const swing = me && S.swing > 0 ? Math.max(r.swing, S.swing) : r.swing;
  const held = r.belt && r.belt.length ? r.belt[r.wi | 0] || r.belt[0] : null;
  const weapon = held && WEAPONS[held.i] ? WEAPONS[held.i].id : "";
  // 出拳方向只有我自己这一台能画准：快照里的 `sw` 只带"还剩多久"，回身打的那一
  // 下只有本机知道。别人的胳膊一律按前打画——反正镜头在自己车后面，看不出来。
  const swingBack = me && S.swing > 0 && S.swingBack;
  drawRider(ctx, {
    cx: p.sx, baseY: p.sy, s: p.ppm, palette: r.palette,
    lean: r.lean, swing, swingBack, wreck: r.state === "wreck" ? Math.max(0.2, r.wreck) : 0,
    nitro: r.nitro, flameSeed: r.id, weapon,
  });
  /*
   * 头顶挂名字：只有真人挂——14 个机器人全挂上就成了一片文字墙。
   *
   * **自己这一台也挂，而且是琥珀色**：这就是"哪个是我"的全部答案。上一版给自己
   * 脚下画过一圈青色光环，那是科幻片的语言，1996 年那条公路上没有这种东西——
   * 它和那个圆角矩形的 HUD 是同一类毛病：一眼看去就不像是这台车身上的。
   */
  if ((r.kind === "human" || me) && p.ppm > 0.3) {
    label(ctx, p.sx, p.sy - 2.9 * p.ppm, r.name, me ? "#ffd88a" : "#dfe8ff",
      Math.min(15, 0.55 * p.ppm + 8));
  }
}

