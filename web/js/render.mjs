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
import { drawRider } from "./sprites.mjs";
import { drawVehicle } from "./vehicles.mjs";
import { PROP_SIZE, drawBuilding, propImage } from "./props.mjs";

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
  const sky = backdrop(S.mode, W, Math.ceil(cam.horizon) + 2, cam.horizon);
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
  for (const v of view.traffic) queue.push({ z: v.z, kind: "traffic", item: v });
  for (const r of view.racers) queue.push({ z: r.z, kind: "racer", item: r });
  queue.sort((a, b) => b.z - a.z);
  for (const entry of queue) {
    if (entry.kind === "prop") drawProp(ctx, cam, tbl, entry.item);
    else if (entry.kind === "traffic") drawTraffic(ctx, cam, tbl, entry.item);
    else drawRacerSprite(ctx, cam, tbl, entry.item, view);
  }
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
  if (prop.kind === "building") {
    const tone = S.mode === "wild" ? "#8a8479" : "#2c2f3f";
    drawBuilding(ctx, { sx: p.sx, baseY: p.sy, s: p.ppm * prop.s, seed: prop.i, width: size[0], height: size[1], tone });
    return;
  }
  const img = propImage(track.ground, prop.kind);
  ctx.drawImage(img, p.sx - w / 2, p.sy - h, w, h);
}

function drawTraffic(ctx, cam, tbl, v) {
  const ground = S.track.hillAt(v.z);
  if (v.state === "run" && occluded(S, cam, v.x, ground, v.z)) return;
  const p = project(cam, tbl, v.x, ground, v.z);
  if (!p || p.ppm < 0.03) return;
  drawVehicle(ctx, {
    cx: p.sx, baseY: p.sy, s: p.ppm, kind: v.kind, id: v.id,
    dir: v.dir, spin: v.spin, air: v.y > 0.05 ? v.y : 0,
  });
  // 大运是这一局的笑点，值得头顶挂一行字——只在近处挂，远了反而乱。
  if (v.kind === "dayun" && p.ppm > 1.1 && v.state === "flung") {
    label(ctx, p.sx, p.sy - 5.2 * p.ppm, "大运起飞!", "#ffd23f", 1.05 * p.ppm);
  }
}

function drawRacerSprite(ctx, cam, tbl, r, view) {
  const ground = S.track.hillAt(r.z);
  if (r.state === "ride" && occluded(S, cam, r.x, ground, r.z)) return;
  const p = project(cam, tbl, r.x, ground, r.z);
  if (!p || p.ppm < 0.05) return;
  const me = r.id === (view.mine ? view.mine.id : -1);
  const swing = me && S.swing > 0 ? Math.max(r.swing, S.swing) : r.swing;
  // 出拳方向只有我自己这一台能画准：快照里的 `sw` 只带"还剩多久"，回身打的那一
  // 下只有本机知道。别人的胳膊一律按前打画——反正镜头在自己车后面，看不出来。
  const swingBack = me && S.swing > 0 && S.swingBack;
  drawRider(ctx, {
    cx: p.sx, baseY: p.sy, s: p.ppm, palette: r.palette,
    lean: r.lean, swing, swingBack, wreck: r.state === "wreck" ? Math.max(0.2, r.wreck) : 0,
    nitro: r.nitro, flameSeed: r.id,
  });
  if (me) {
    // 自己脚下的一圈光环：15 台车挤在一起时，"哪个是我"必须一眼看得见。
    ctx.strokeStyle = "rgba(110,240,255,.75)";
    ctx.lineWidth = Math.max(1, p.ppm * 0.05);
    ctx.beginPath();
    ctx.ellipse(p.sx, p.sy, p.ppm * 0.95, p.ppm * 0.28, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 只有真人挂名字：14 个机器人全挂上就成了一片文字墙。
  if (r.kind === "human" && !me && p.ppm > 0.35) {
    label(ctx, p.sx, p.sy - 2.9 * p.ppm, r.name, "#dfe8ff", Math.min(15, 0.55 * p.ppm + 8));
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
  vig.addColorStop(1, "rgba(0,0,0,.5)");
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
