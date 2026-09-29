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
import { drawRider } from "./sprites.mjs";
import { drawVehicle } from "./vehicles.mjs";
import { CAR_NAME } from "./fx.mjs";
import { PROP_SIZE, drawBuilding, propImage } from "./props.mjs";
import { WEAPONS } from "/sim/weapons.mjs";
import { drawPickup } from "./weaponsart.mjs";
import { CRITTERS } from "/sim/critters.mjs";

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

/** 粒子与跳字：在"世界的空气里"，所以画在所有立体物之后。 */
function drawFx(ctx, cam, tbl) {
  for (const p of FX.smoke) {
    const q = project(cam, tbl, p.x, p.y, p.z);
    if (!q || q.ppm < 0.25) continue;
    ctx.globalAlpha = Math.max(0, p.life / p.max) * 0.75;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(q.sx, q.sy, Math.max(1, p.size * q.ppm), 0, Math.PI * 2);
    ctx.fill();
  }
  for (const p of FX.sparks) {
    const q = project(cam, tbl, p.x, p.y, p.z);
    if (!q || q.ppm < 0.25) continue;
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(q.sx - p.size * q.ppm, q.sy - p.size * q.ppm, p.size * q.ppm * 2, p.size * q.ppm * 2);
  }
  ctx.globalAlpha = 1;
  for (const f of FX.floaters) {
    const q = project(cam, tbl, f.x, f.y, f.z);
    if (!q || q.ppm < 0.4) continue;
    ctx.globalAlpha = Math.max(0, f.life / f.max);
    label(ctx, q.sx, q.sy, f.text, f.color, (f.big ? 1.15 : 0.85) * q.ppm + 8);
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
  const w = size[0] * prop.s * p.ppm, h = size[1] * prop.s * p.ppm;
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

function label(ctx, x, y, text, color, size) {
  ctx.save();
  ctx.font = `700 ${Math.max(9, size).toFixed(1)}px system-ui, "Microsoft YaHei", sans-serif`;
  ctx.textAlign = "center";
  ctx.lineWidth = Math.max(2, size * 0.28);
  ctx.strokeStyle = "rgba(4,7,14,.85)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** 前景：倒数、播报、速度线、暗角。全部是"屏幕上"的东西，不参与世界坐标。 */
function drawOverlays(ctx, view, cam) {
  const W = cam.W, H = cam.H;
  const me = view.mine;
  const speed = me ? Math.max(0, me.v) : 0;
  if (speed > 14) {
    const strength = Math.min(1, (speed - 14) / 26);
    const n = Math.round(4 + strength * 9);
    ctx.strokeStyle = `rgba(220,240,255,${0.06 + strength * 0.16})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      const y = cam.horizon + (i / n) * H * 0.72 + Math.sin(i * 2.7 + performance.now() / 220) * 12;
      const len = H * (0.06 + strength * 0.14);
      ctx.beginPath();
      ctx.moveTo(W / 2 + side * W * 0.28, y);
      ctx.lineTo(W / 2 + side * (W * 0.28 + len * 0.5), y + len);
      ctx.stroke();
    }
  }
  const vig = ctx.createRadialGradient(W / 2, H * 0.52, H * 0.3, W / 2, H * 0.5, H * 0.95);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  // 暗角是"把视线压回路面"的一招，但 0.5 会把荒野正午的四角直接压成黑橄榄色
  // （拿像素探针量过：路面 #565550 不变、路肩 #8c7c56 被压成 #453e28）。
  vig.addColorStop(1, "rgba(0,0,0,.44)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  if (view.countdown > 0) {
    const n = Math.ceil(view.countdown);
    const text = n > 3 ? "准备" : n > 1 ? String(n - 1) : "GO!";
    const frac = 1 - (view.countdown % 1);
    ctx.save();
    ctx.globalAlpha = Math.min(1, 0.35 + frac * 1.4);
    ctx.translate(W / 2, H * 0.34);
    ctx.scale(1 + (1 - frac) * 0.5, 1 + (1 - frac) * 0.5);
    ctx.font = `900 ${Math.round(H * 0.18)}px system-ui, "Microsoft YaHei", sans-serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = H * 0.02; ctx.strokeStyle = "rgba(6,9,18,.9)";
    ctx.strokeText(text, 0, 0); ctx.fillStyle = "#ffe874"; ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  if (FX.announce) {
    const age = (performance.now() - FX.announce.at) / 1000;
    if (age < 2.4) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age / 2.4);
      ctx.translate(W / 2, H * 0.24 - age * 14);
      ctx.textAlign = "center";
      ctx.font = `900 ${Math.round(H * 0.062)}px system-ui, "Microsoft YaHei", sans-serif`;
      ctx.lineWidth = H * 0.012; ctx.strokeStyle = "rgba(6,9,18,.9)";
      ctx.strokeText(FX.announce.title, 0, 0);
      ctx.fillStyle = FX.announce.color || "#ffd23f";
      ctx.fillText(FX.announce.title, 0, 0);
      ctx.font = `600 ${Math.round(H * 0.026)}px system-ui, "Microsoft YaHei", sans-serif`;
      ctx.fillStyle = "#dfe8ff"; ctx.fillText(FX.announce.sub || "", 0, H * 0.05);
      ctx.restore();
    } else FX.announce = null;
  }
}
