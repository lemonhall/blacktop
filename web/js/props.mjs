/**
 * 路边的东西：树、路灯、路牌、石头、栅栏、楼房。
 *
 * 它们**不是状态**——位置由赛道种子现算（`sim/track.mjs` 的 `propsBetween`），
 * 两个宿主算出来的每一棵树都在同一个地方。这一层只负责把它们画出来。
 *
 * 为什么值得花力气：伪 3D 路面上唯一能提供**速度感**的就是"路边的东西刷得多快"。
 * 一条空荡荡的路，哪怕仪表盘写着 200 也像在散步；密到一根根掠过去，60 的时速
 * 就已经吓人了。所以密度和种类都是刻意堆的。
 *
 * 小件（树、灯、牌、石、栅栏）预先画进离屏画布再缩放贴上去——每帧几十个
 * `drawImage` 远比每帧几十次路径描边便宜，而这些形状一局之内不会变。
 */

import { TAU } from "/sim/constants.mjs";
import { hash2 } from "/sim/rng.mjs";
import { shade } from "./sprites.mjs";

/** 每种道具的**实际尺寸（米）**：宽 × 高。贴图与判定都按它走。 */
export const PROP_SIZE = {
  tree: [2.8, 6.6],
  lamp: [1.5, 7.4],
  sign: [1.7, 3.3],
  rock: [2.6, 1.7],
  fence: [3.4, 1.25],
  building: [13, 21],
};

/** 贴图的像素密度。64 px/米 对 6 米高的树正好是 400 像素，够近处看，也不占内存。 */
const PX = 64;

const cache = new Map();

/** 取（或现画）一份道具贴图。返回的 canvas 底边中点就是它的"接地点"。 */
export function propImage(ground, kind) {
  const key = `${ground}:${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [w, h] = PROP_SIZE[kind] || PROP_SIZE.tree;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(8, Math.round(w * PX));
  canvas.height = Math.max(8, Math.round(h * PX));
  const ctx = canvas.getContext("2d");
  ctx.translate(canvas.width / 2, canvas.height);
  ctx.scale(PX, -PX);
  ctx.lineJoin = "round";
  drawProp(ctx, ground, kind, w, h, hash2(7, kind.length * 31 + w));
  cache.set(key, canvas);
  return canvas;
}

function drawProp(ctx, ground, kind, w, h, seed) {
  if (kind === "tree") return tree(ctx, w, h, ground, seed);
  if (kind === "lamp") return lamp(ctx, w, h, ground);
  if (kind === "sign") return sign(ctx, w, h, ground);
  if (kind === "rock") return rock(ctx, w, h);
  if (kind === "fence") return fence(ctx, w, h);
}

function tree(ctx, w, h, ground, seed) {
  const dark = ground === "city" ? "#16321f" : "#1e3a22";
  ctx.fillStyle = "#3a2b21";
  ctx.fillRect(-w * 0.06, 0, w * 0.12, h * 0.34);
  for (let i = 0; i < 4; i++) {
    const y = h * (0.24 + i * 0.19);
    const rw = w * (0.62 - i * 0.09) * (0.85 + hash2(seed, i) * 0.3);
    ctx.fillStyle = i === 3 ? shade(dark, 0.22) : dark;
    ctx.beginPath();
    ctx.moveTo(0, y + h * 0.26);
    ctx.lineTo(-rw, y);
    ctx.lineTo(-rw * 0.4, y - h * 0.02);
    ctx.lineTo(0, y - h * 0.1);
    ctx.lineTo(rw * 0.4, y - h * 0.02);
    ctx.lineTo(rw, y);
    ctx.closePath(); ctx.fill();
  }
}

function lamp(ctx, w, h, ground) {
  ctx.fillStyle = "#4b5468";
  ctx.fillRect(-0.075, 0, 0.15, h * 0.94);
  ctx.fillRect(-0.075, h * 0.9, w * 0.5, 0.14);
  ctx.fillStyle = "#6d778c";
  ctx.fillRect(-0.22, 0, 0.44, 0.16);
  const lit = ground === "city";
  ctx.fillStyle = lit ? "#ffe9a8" : "#d7dbe4";
  ctx.beginPath(); ctx.ellipse(w * 0.5 - 0.3, h * 0.86, 0.34, 0.2, 0, 0, TAU); ctx.fill();
  if (lit) {
    const g = ctx.createLinearGradient(0, h * 0.84, 0, 0);
    g.addColorStop(0, "rgba(255,226,150,.28)");
    g.addColorStop(1, "rgba(255,226,150,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(w * 0.5 - 0.62, h * 0.84);
    ctx.lineTo(w * 0.5 + 0.02, h * 0.84);
    ctx.lineTo(w * 0.5 + 1.1, 0);
    ctx.lineTo(w * 0.5 - 1.7, 0);
    ctx.closePath(); ctx.fill();
  }
}

function sign(ctx, w, h, ground) {
  ctx.fillStyle = "#59637a";
  ctx.fillRect(-0.06, 0, 0.12, h * 0.72);
  ctx.fillStyle = ground === "city" ? "#1f7a52" : "#2b6ea8";
  ctx.fillRect(-w / 2, h * 0.66, w, h * 0.34);
  ctx.fillStyle = "#eef3ff";
  ctx.fillRect(-w / 2 + 0.11, h * 0.71, w - 0.22, h * 0.1);
  ctx.fillRect(-w / 2 + 0.11, h * 0.86, w * 0.5, h * 0.08);
}

function rock(ctx, w, h) {
  ctx.fillStyle = "#6b6f78";
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.lineTo(-w * 0.34, h * 0.72);
  ctx.lineTo(-w * 0.06, h);
  ctx.lineTo(w * 0.3, h * 0.8);
  ctx.lineTo(w / 2, h * 0.18);
  ctx.lineTo(w * 0.24, 0);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#8b909b";
  ctx.beginPath();
  ctx.moveTo(-w * 0.34, h * 0.72);
  ctx.lineTo(-w * 0.06, h);
  ctx.lineTo(w * 0.06, h * 0.5);
  ctx.closePath(); ctx.fill();
}

function fence(ctx, w, h) {
  ctx.strokeStyle = "#7d6a53";
  ctx.lineWidth = 0.11;
  for (let i = 0; i <= 4; i++) {
    const x = -w / 2 + (w / 4) * i;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  ctx.lineWidth = 0.09;
  for (const y of [h * 0.35, h * 0.72]) {
    ctx.beginPath(); ctx.moveTo(-w / 2, y); ctx.lineTo(w / 2, y); ctx.stroke();
  }
}

/**
 * 楼房：**现画**，不走贴图缓存。
 *
 * 理由是尺寸跨度太大——一栋 21 米的楼在 5 米外要占两千多像素高，贴图放大会糊成
 * 一坨；而它其实只是"几个矩形加一串窗户"，现画的代价比缩放一张大图还低。
 * `hash2(seed, i)` 保证同一栋楼每一帧长得一模一样（窗户不会自己乱跳）。
 */
export function drawBuilding(ctx, { sx, baseY, s, seed, width, height, tone }) {
  const w = width * s, h = height * s;
  if (w < 1 || h < 1) return;
  ctx.fillStyle = tone;
  ctx.fillRect(sx - w / 2, baseY - h, w, h);
  ctx.fillStyle = "rgba(4,6,12,.5)";
  ctx.fillRect(sx - w / 2, baseY - h, w * 0.14, h);
  const rows = Math.max(3, Math.min(11, Math.round(height / 3.2)));
  const cols = Math.max(2, Math.min(7, Math.round(width / 3)));
  const lit = Math.min(3, Math.max(1, s * 0.06));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const on = hash2(seed, r * 17 + c * 5) < 0.42;
      ctx.fillStyle = on ? `rgba(255,214,140,${0.28 + lit * 0.12})` : "rgba(12,16,26,.72)";
      const cw = (w * 0.72) / cols, ch = (h * 0.78) / rows;
      ctx.fillRect(sx - w * 0.36 + c * cw + cw * 0.16, baseY - h + h * 0.16 + r * ch, cw * 0.62, ch * 0.5);
    }
  }
  ctx.fillStyle = "rgba(255,255,255,.06)";
  ctx.fillRect(sx - w / 2, baseY - h, w, Math.max(1, h * 0.02));
}
