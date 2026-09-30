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

import { clock } from "../../sim/constants.mjs";
import { NITRO_CD } from "../../sim/racer.mjs";
import { WEAPONS } from "../../sim/weapons.mjs";
import { BIKES } from "../../sim/data.mjs";
import { FX } from "./state.mjs";
import { drawGauge } from "./gauge.mjs";
import { rangeLamps } from "./rangelamp.mjs";
import { revs, TACH } from "./tach.mjs";

/** 两只表共用满量程，指针偏角才能横向比较：我比他快多少，看角度差就够了。 */
const MAX_KMH = 260;

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
  const pick = pickRival(view);
  const rival = pick && pick.racer;
  const spec = me ? BIKES[me.bike] || BIKES[0] : null;
  const tach = revs(speed, spec ? spec.vmax * 3.6 : 0);
  drawGauge($("gaugeL"), speed, MAX_KMH, "#6ef0ff", { readout: "gaugeLSpeed" });
  // 右表是**转速表**：1996 那版两只表就是"速度 + 转速"，不是"我 + 他"。
  // 对手的速度并没有丢——中间那行有名次榜里每个人的速度，"前车"那行的名字也还在。
  drawGauge($("gaugeR"), tach.rpm, TACH.max, "#ffb03a", {
    readout: "gaugeRSpeed", unit: "RPM ×1000", major: 1, minor: 0.5,
    redline: TACH.redline, decimals: 1, labelPx: 11,
  });
  set("hudGear", String(tach.gear));
  set("hudSpeed", String(speed));
  set("hudRank", me ? String(me.rank || view.myRank) : "—");
  set("hudField", `/${view.field}`);
  set("hudTimer", clock(view.time));
  /*
   * 第几圈。`z` 是一路累加的总里程，所以圈数就是它除以一圈长度——**不出圈数这个
   * 字段、也不按圈排名**，理由见 `sim/racer.mjs` 的 `crossFinish`。
   */
  const lapLen = view.finishZ / (view.laps || 1);
  const lap = me ? Math.min(view.laps, Math.max(1, Math.floor(me.z / lapLen) + 1)) : 1;
  set("hudLap", view.laps > 1 ? `第 ${lap}/${view.laps} 圈` : "单程 · 到终点");
  set("hudName", me ? me.name : "—");
  set("hudGap", gapText(view, me));
  set("hudRival", rival ? rival.name : "独自领跑");
  set("hudRivalTag", pick ? (pick.side === "ahead" ? "前车" : "后车") : "对手");
  bar("hudSta", me ? me.stamina / 100 : 0);
  bar("hudRSta", rival ? rival.stamina / 100 : 0);
  // 氮气槽：充好了是满格，用掉之后按冷却往回爬。能不能踩，一眼就知道。
  bar("hudNos", me ? (me.nitroCd > 0 ? 1 - me.nitroCd / NITRO_CD : 1) : 0);
  set("hudStaText", me ? String(Math.round(me.stamina)) : "");
  set("hudRStaText", rival ? String(Math.round(rival.stamina)) : "");
  belt(me);
  rangeLamps(view);
  progress(view, me);
  ranks(view);
  feed();
  respawn(me);
}

/**
 * 腰里那几件：一行小牌子，亮着的是**此刻举在手里**的那一件。
 *
 * 为什么非要摆出来：1996 那版的乐趣有一半在"我攒了三件、现在该用哪一件"，
 * 而这个决定只有在"看得见自己有什么"的前提下才成立。充能家伙还剩几次也必须
 * 写在牌子上——油桶挥空和油桶用光是两件完全不同的事。
 */
function belt(me) {
  const box = $("hudBelt");
  if (!box) return;
  const items = (me && me.belt) || [];
  const at = me ? me.wi | 0 : 0;
  const signature = `${at}|${items.map(b => `${b.i}:${b.charges}`).join(",")}`;
  if (last.beltSig === signature) return;
  last.beltSig = signature;
  box.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("b");
    empty.className = "belt-chip empty";
    empty.textContent = "空手";
    box.append(empty);
    return;
  }
  items.forEach((item, i) => {
    const spec = WEAPONS[item.i];
    if (!spec) return;
    const chip = document.createElement("b");
    chip.className = `belt-chip${i === at ? " on" : ""}`;
    chip.textContent = spec.charges > 0 ? `${spec.name} ×${item.charges}` : spec.name;
    box.append(chip);
  });
}

const bar = (id, ratio) => {
  const node = $(id);
  if (node) node.style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
};

/**
 * 右表盯的是**离我最近的那个人**：前面有谁就先看前面那个（追谁、什么时候动手都看他），
 * 前面没人就看屁股后面那个（被追的时候得知道是谁）。
 *
 * 这里有一条必须守住的边界：**绝不能把自己选成"对手"**。上一版就是这样——领跑的时候
 * "前车"显示的是我自己的名字，右表还跟着左表一起转，看着像一套坏掉的仪表。
 */
function pickRival(view) {
  const me = view.mine;
  const others = view.racers.filter(r => !me || r.id !== me.id);
  if (!others.length) return null;
  if (!me) return { racer: others[0], side: "ahead" };
  let ahead = null, behind = null;
  for (const r of others) {
    if (r.z >= me.z) {
      if (!ahead || r.z < ahead.z) ahead = r;
    } else if (!behind || r.z > behind.z) {
      behind = r;
    }
  }
  // 返回的是"谁"加"在哪边"——`side` 只用来决定中间那行写"前车"还是"后车"。
  // 不往 racer 对象上挂字段：那是 view 里的共享对象，挂上去会顺着快照漏出去。
  return ahead ? { racer: ahead, side: "ahead" } : { racer: behind, side: "behind" };
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

/** 表本身住在 `gauge.mjs`（它是这块 HUD 里唯一每帧重画、唯一有状态的一块）。 */
export { drawGauge };
