/**
 * 仪表盘：屏幕下方那一整块 HUD。
 *
 * 按 1996 年 PC 版《暴力摩托》的排布来——**左表 + 左体力条 / 中央名次与计时 /
 * 右表 + 右体力条**。这不是怀旧，是它恰好把竞速里同时要看的三件事排在了一条
 * 视线高度上：我在第几、我跑多快、我还剩多少体力能打人。
 *
 * 文字部分走 DOM（便宜、可选中、能上 CSS），两个圆表走 canvas（指针要每帧转）。
 * 每帧只写**变化过的**文本，否则 60Hz 的 textContent 赋值会让长局明显掉帧。
 */

import { clock } from "/sim/constants.mjs";
import { NITRO_CD } from "/sim/racer.mjs";
import { FX } from "./state.mjs";

const $ = id => document.getElementById(id);
const last = {};

/** 只在真的变了的时候写 DOM。一个字一个字地比，比"整块重画"便宜一个数量级。 */
function set(id, text) {
  if (last[id] === text) return;
  last[id] = text;
  const node = $(id);
  if (node) node.textContent = text;
}

export function updateHud(view) {
  if (!view) return;
  const me = view.mine;
  const speed = me ? Math.round(Math.max(0, me.v) * 3.6) : 0;
  const rival = pickRival(view);
  drawGauge($("gaugeL"), speed, 260, "#6ef0ff", "SPEED");
  drawGauge($("gaugeR"), rival ? Math.round(rival.v * 3.6) : 0, 260, "#ffb03a", "RIVAL");
  set("hudSpeed", String(speed));
  set("hudRank", me ? String(me.rank || view.myRank) : "—");
  set("hudField", `/${view.field}`);
  set("hudTimer", clock(view.time));
  set("hudName", me ? me.name : "—");
  set("hudGap", gapText(view, me));
  set("hudRival", rival ? rival.name : "独自领跑");
  bar("hudSta", me ? me.stamina / 100 : 0);
  bar("hudRSta", rival ? rival.stamina / 100 : 0);
  // 氮气槽：充好了是满格，用掉之后按冷却往回爬。能不能踩，一眼就知道。
  bar("hudNos", me ? (me.nitroCd > 0 ? 1 - me.nitroCd / NITRO_CD : 1) : 0);
  set("hudStaText", me ? String(Math.round(me.stamina)) : "");
  set("hudRStaText", rival ? String(Math.round(rival.stamina)) : "");
  progress(view, me);
  ranks(view);
  feed();
  respawn(me);
}

const bar = (id, ratio) => {
  const node = $(id);
  if (node) node.style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
};

/** 右表盯的是**紧挨着我前面那台车**：追谁、什么时候动手，看它就够了。 */
function pickRival(view) {
  const me = view.mine;
  if (!me) return view.racers[0] || null;
  let best = null;
  for (const r of view.racers) {
    if (r.id === me.id) continue;
    if (r.z < me.z - 4) continue;
    if (!best || r.z < best.z) best = r;
  }
  return best || view.leader;
}

function gapText(view, me) {
  if (!me) return "";
  const leader = view.racers.find(r => r.rank === 1);
  if (!leader || leader.id === me.id) return "领跑";
  const behind = me.finished ? me.finishTime - leader.finishTime : me.z - leader.z;
  if (me.finished) return `${behind >= 0 ? "+" : ""}${behind.toFixed(2)}s`;
  return `${Math.round(behind)}m`;
}

const progress = (view, me) => {
  const pct = me ? Math.max(0, Math.min(1, me.z / view.finishZ)) * 100 : 0;
  const node = $("hudMe");
  if (node) node.style.left = `${pct}%`;
};

/** 名次榜：前五名 + 我（在五名之外时）。中间那行永远是我，不让人找。 */
function ranks(view) {
  const box = $("rankList");
  if (!box) return;
  const rows = view.racers.slice(0, 5);
  const me = view.mine;
  if (me && !rows.includes(me)) rows.push(me);
  const signature = rows.map(r => `${r.id}:${r.rank}:${Math.round(r.z)}`).join("|");
  if (last.rankSig === signature) return;
  last.rankSig = signature;
  box.replaceChildren();
  for (const r of rows) {
    const el = document.createElement("div");
    el.className = `rank-row${r.id === (me && me.id) ? " me" : ""}`;
    const badge = document.createElement("b");
    badge.textContent = `${r.rank || "-"}`;
    const name = document.createElement("span");
    name.textContent = r.name;
    const stat = document.createElement("i");
    stat.textContent = `${Math.round(r.v * 3.6)}`;
    el.append(badge, name, stat);
    box.append(el);
  }
}

/** 播报条：摔车、踢飞大运、谁冲线了。四秒之后自己淡出。 */
function feed() {
  const box = $("feedList");
  if (!box) return;
  const now = performance.now();
  const live = FX.feed.filter(f => now - f.at < 4200);
  const signature = live.map(f => f.at).join(",");
  if (last.feedSig === signature) return;
  last.feedSig = signature;
  box.replaceChildren();
  for (const f of live) {
    const el = document.createElement("div");
    el.className = "feed-row";
    el.textContent = f.text;
    el.style.color = f.color;
    box.append(el);
  }
}

function respawn(me) {
  const node = $("respawn");
  if (!node) return;
  const wrecked = !!me && me.state === "wreck";
  node.classList.toggle("hidden", !wrecked);
  if (wrecked) set("respawnCount", Math.max(0, me.wreck).toFixed(1));
}

/**
 * 一只圆表。
 *
 * 画法刻意保持"老派"：一圈刻度 + 一根指针 + 一大一小两行数字。指针的角速度是
 * 唯一能让玩家**不用看数字**就知道自己在加速还是在掉速的东西，所以它必须有，
 * 还得够长够粗。
 */
export function drawGauge(canvas, value, max, color, caption) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  const c = size / 2, r = c - 6;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(8,11,20,.82)"; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = "rgba(150,180,215,.35)"; ctx.stroke();
  const from = Math.PI * 0.78, to = Math.PI * 2.22;
  for (let i = 0; i <= 10; i++) {
    const a = from + (to - from) * (i / 10);
    const big = i % 5 === 0;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * (r - 6), c + Math.sin(a) * (r - 6));
    ctx.lineTo(c + Math.cos(a) * (r - (big ? 18 : 12)), c + Math.sin(a) * (r - (big ? 18 : 12)));
    ctx.lineWidth = big ? 3 : 1.5;
    ctx.strokeStyle = i > 7 ? "#ff6a7a" : "rgba(190,214,240,.6)";
    ctx.stroke();
  }
  const ratio = Math.max(0, Math.min(1, value / max));
  if (ratio > 0.01) {
    ctx.beginPath();
    ctx.arc(c, c, r - 22, from, from + (to - from) * ratio);
    ctx.lineWidth = 6; ctx.strokeStyle = color; ctx.stroke();
  }
  const a = from + (to - from) * ratio;
  ctx.beginPath();
  ctx.moveTo(c, c);
  ctx.lineTo(c + Math.cos(a) * (r - 24), c + Math.sin(a) * (r - 24));
  ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.strokeStyle = "#f3f7ff"; ctx.stroke();
  ctx.beginPath(); ctx.arc(c, c, 5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  ctx.restore();
  const label = document.getElementById(caption === "SPEED" ? "gaugeLSpeed" : "gaugeRSpeed");
  if (label) label.textContent = `${Math.round(value)}`;
}
