/**
 * 选车台：房间列表与候场页共用的那块"展示区"。
 *
 * 它承担两件事：让玩家在开跑之前**看清自己骑的是什么**，以及让这两屏不至于
 * 是一片空白。所以画法上只做一件事——把同一台车放大到占满画面，底下铺一条
 * 会往后退的透视网格：那是"待会儿你要在这上面跑"的预告。
 *
 * 三种车是**取舍**不是升级（见 `sim/data.mjs` 的注释），所以每台车旁边写的
 * 是"它的代价"，不是"它的等级"。
 */

import { BIKES, PALETTES } from "../../sim/data.mjs";
import { drawRider } from "./sprites.mjs";

const $ = id => document.getElementById(id);
const BIKE_KEY = "blacktop.bike";
const PALETTE_KEY = "blacktop.palette";

let hooks = {};
let selected = 0;
let palette = 0;
let scroll = 0;

export function prefsOf() {
  try {
    const b = Number(localStorage.getItem(BIKE_KEY));
    const p = Number(localStorage.getItem(PALETTE_KEY));
    return { bike: Number.isFinite(b) ? b : 0, palette: Number.isFinite(p) ? p : 0 };
  } catch { return { bike: 0, palette: 0 }; }
}

function save(bike, pal) {
  try {
    localStorage.setItem(BIKE_KEY, String(bike));
    localStorage.setItem(PALETTE_KEY, String(pal));
  } catch { /* 隐私模式：认了，只是记不住 */ }
}

export const selectedBike = () => selected;
export const selectedPalette = () => palette;
export function chooseBike(index) {
  selected = Math.max(0, Math.min(BIKES.length - 1, index));
  save(selected, palette);
  syncCards();
  hooks.onBike?.(selected);
}

export function initShowcase(next = {}) {
  hooks = next;
  const saved = prefsOf();
  selected = saved.bike;
  palette = saved.palette;
  document.querySelectorAll("[data-bike]").forEach(card => {
    card.addEventListener("click", () => chooseBike(Number(card.dataset.bike)));
  });
  document.querySelectorAll("[data-palette]").forEach(dot => {
    dot.addEventListener("click", () => {
      palette = Number(dot.dataset.palette) % PALETTES.length;
      save(selected, palette);
      paintSwatches();
    });
  });
  paintSwatches();
  syncCards();
}

function syncCards() {
  document.querySelectorAll("[data-bike]").forEach(card => {
    const on = Number(card.dataset.bike) === selected;
    card.classList.toggle("selected", on);
    card.setAttribute("aria-pressed", String(on));
  });
  const bike = BIKES[selected];
  if ($("bikeName")) $("bikeName").textContent = bike.name;
  if ($("bikeEn")) $("bikeEn").textContent = bike.en;
  if ($("bikeNote")) $("bikeNote").textContent = bike.note;
  stat("statTop", bike.vmax / 70);
  stat("statAccel", bike.accel / 14);
  stat("statTurn", (bike.turn - 0.7) / 0.7);
  stat("statGrip", (bike.grip - 0.8) / 0.5);
}

const stat = (id, ratio) => {
  const node = $(id);
  if (node) node.style.width = `${Math.round(Math.max(0.08, Math.min(1, ratio)) * 100)}%`;
};

function paintSwatches() {
  document.querySelectorAll("[data-palette]").forEach(dot => {
    const on = Number(dot.dataset.palette) === palette;
    dot.classList.toggle("selected", on);
    dot.setAttribute("aria-pressed", String(on));
    dot.style.background = (PALETTES[Number(dot.dataset.palette) % 8] || PALETTES[0]).jacket;
  });
}

export function resizeShowcase() {
  for (const id of ["showcase", "showcaseStage"]) {
    const canvas = $(id);
    if (!canvas) continue;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(2, Math.round(rect.width * dpr));
    canvas.height = Math.max(2, Math.round(rect.height * dpr));
  }
}

/**
 * 每帧画一次展示台。背景（透视网格）与车都是现画的——这一层没有性能压力，
 * 因为它在候场页面上，一屏最多跑两个。
 */
export function renderShowcase(now) {
  // 一块展示台画两屏：谁当前可见就画谁，隐藏的那块量出来是 0 像素。
  const canvas = visibleStage();
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.width / dpr, H = canvas.height / dpr;
  if (W < 4 || H < 4) return;
  scroll += 0.9;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  grid(ctx, W, H, scroll);
  const s = Math.min(W, H * 1.9) / 22;
  const bob = Math.sin(now * 1.6) * 0.05 * s;
  ctx.save();
  ctx.translate(W * 0.5, H * 0.86 - bob);
  ctx.scale(1, 0.92);
  drawRider(ctx, {
    cx: 0, baseY: 0, s, palette,
    // 号牌别写死：大厅里那台车就是玩家自己那台，牌上的数字要和他的配色对得上
    number: palette * 3 + 1,
    lean: Math.sin(now * 0.7) * 0.16, swing: 0, wreck: 0,
    nitro: Math.sin(now * 2.2) > 0.86, flameSeed: 3,
  });
  ctx.restore();
  spotlight(ctx, W, H, now);
}

/** 两屏各有一块展示区（`#showcase` 在大厅、`#showcaseStage` 在候场）。谁可见画谁。 */
function visibleStage() {
  for (const id of ["showcase", "showcaseStage"]) {
    const canvas = $(id);
    if (!canvas) continue;
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 8 && rect.height > 8) return canvas;
  }
  return null;
}

/** 往后退的透视网格：便宜的"速度预告"，也把画面下半部填满。 */
function grid(ctx, W, H, offset) {
  const horizon = H * 0.46;
  const g = ctx.createLinearGradient(0, horizon, 0, H);
  g.addColorStop(0, "rgba(10,14,26,.1)");
  g.addColorStop(1, "rgba(6,9,18,.72)");
  ctx.fillStyle = g;
  ctx.fillRect(0, horizon, W, H - horizon);
  ctx.strokeStyle = "rgba(110,220,255,.16)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 22; i++) {
    const t = ((i + (offset / 90) % 1) / 22);
    const y = horizon + (H - horizon) * t * t;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  for (let i = -9; i <= 9; i++) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + i * W * 0.03, horizon);
    ctx.lineTo(W / 2 + i * W * 0.34, H);
    ctx.stroke();
  }
}

function spotlight(ctx, W, H, now) {
  const pulse = 0.5 + Math.sin(now * 1.1) * 0.08;
  const g = ctx.createRadialGradient(W * 0.5, H * 0.7, 0, W * 0.5, H * 0.7, W * 0.42);
  g.addColorStop(0, `rgba(120,220,255,${0.14 * pulse})`);
  g.addColorStop(1, "rgba(120,220,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/**
 * 名册上的小头像：一顶头盔 + 一件皮衣。
 *
 * 名册的每一格只有 26 像素，画整个人是不可能的——但**头盔和外套的配色**
 * 恰好就是玩家在赛道上认出队友的全部线索，所以只画这两样反而最有用。
 */
export function drawPortrait(canvas, pal) {
  const p = PALETTES[(pal | 0) & 7] || PALETTES[0];
  const ctx = canvas.getContext("2d");
  const size = canvas.width, c = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#0d1220";
  ctx.beginPath(); ctx.arc(c, c, c, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = p.jacket;
  ctx.beginPath(); ctx.arc(c, size * 1.02, size * 0.46, Math.PI, Math.PI * 2); ctx.fill();
  ctx.fillStyle = p.helmet;
  ctx.beginPath(); ctx.arc(c, c * 0.82, size * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(10,14,24,.62)";
  ctx.fillRect(c - size * 0.3, c * 0.78, size * 0.6, size * 0.11);
  ctx.strokeStyle = p.bike;
  ctx.lineWidth = Math.max(1.5, size * 0.07);
  ctx.beginPath(); ctx.arc(c, c, c - ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
}
