/**
 * 结算页：把服务端算出来的名次、赏金、战绩原样摆出来。
 *
 * 名次是**权威端**算的（`sim/world.mjs` 的 `settle`），客户端一个数都不改。
 * 唯一写在本地的是"我"的那点小心情——赢了放彩带，输了说句实话。
 */

import { clock1 } from "../../sim/constants.mjs";
import { MODES } from "../../sim/data.mjs";
import { prizeOf } from "./payout.mjs";
import { S } from "./state.mjs";

const $ = id => document.getElementById(id);

export function showResults(results) {
  const me = (results.players || []).find(p => p.ownerId === S.meId) || null;
  const rank = me ? me.rank : 0;
  const win = rank === 1;
  $("resultEyebrow").textContent = win ? "TAKE THE FLAG" : "RACE OVER";
  $("resultRank").textContent = `#${rank}`;
  $("resultRank").style.color = win ? "#ffd23f" : rank <= 3 ? "#7cf7a0" : "#edb0ba";
  $("resultTitle").textContent = win ? "第一个冲线。" : rank <= 3 ? "上领奖台了。" : "再练练那条弯。";
  $("resultDescription").textContent = win
    ? "这条路今晚归你。赏金、名次、还有那一脚把半挂踹上天的画面，都记在战绩里了。"
    : rank <= 3 ? "名次是有的，赏金也是有的——差的是第一个冲线的那一下。"
      : "撞车、摔车、被半挂顶回来，都是这条路的一部分。换台车试试。";
  $("resultTime").textContent = me && me.time !== null && me.time !== undefined ? clock1(me.time) : "未完赛";
  $("resultDowns").textContent = me ? me.downs : 0;
  $("resultKills").textContent = me ? me.kills : 0;
  $("resultCrashes").textContent = me ? me.crashes : 0;
  // 赏金的权威来源是 `results.payout`（见 `payout.mjs`），不是 `players[].cash`。
  $("resultPayout").textContent = money(me ? prizeOf(results, me.ownerId) : 0);
  // 赛道名从表里取——上一版这里写着一个二元三目，于是八条路里有六条会被叫成"夜色环路"。
  const mode = MODES[results.track];
  $("resultRecord").textContent =
    `${mode ? mode.name : results.track} · 全场 ${results.players.length} 台车`;
  standings(results, me);
  confetti(win);
  $("results").classList.remove("hidden");
  $("screenReaderStatus").textContent = win ? "你第一个冲线。" : `比赛结束，第 ${rank} 名。`;
  $("playAgainButton").focus({ preventScroll: true });
}

export function hideResults() {
  $("results").classList.add("hidden");
}

const money = n => "¥" + (n || 0).toLocaleString("zh-CN");

/** 完整成绩单：谁跑了多久、撂倒几个、赏金多少。这是赛后唯一能复盘的地方。 */
function standings(results, me) {
  const box = $("resultTable");
  box.replaceChildren();
  for (const p of results.players || []) {
    const row = document.createElement("div");
    const cls = ["result-row"];
    if (me && p.ownerId === me.ownerId) cls.push("me");
    if (p.kind === "bot") cls.push("bot");
    row.className = cls.join(" ");
    const cells = [
      String(p.rank),
      p.name,
      p.dnf ? "未完赛" : clock1(p.time || 0),
      String(p.downs),
      String(p.kills),
      money(prizeOf(results, p.ownerId)),
    ];
    for (const text of cells) {
      const cell = document.createElement("span");
      cell.textContent = text;
      row.append(cell);
    }
    box.append(row);
  }
}

function confetti(win) {
  const box = $("confetti");
  box.replaceChildren();
  if (!win || matchMedia("(prefers-reduced-motion:reduce)").matches) return;
  const colors = ["#ffd23f", "#6ef0ff", "#ff5f7e", "#7cf7a0"];
  for (let i = 0; i < 44; i++) {
    const bit = document.createElement("i");
    bit.style.left = `${Math.random() * 100}%`;
    bit.style.animationDelay = `${Math.random() * 4}s`;
    bit.style.animationDuration = `${3 + Math.random() * 2}s`;
    bit.style.background = colors[i % 4];
    box.append(bit);
  }
}

/** 「再来一局」的语义：房主能重开，其他人只能回到候场等。 */
export function bindResults({ onReset, onBack }) {
  $("playAgainButton").addEventListener("click", () => onReset?.());
  $("lobbyButton").addEventListener("click", () => onBack?.());
  $("lobbyButton").textContent = "回到房间候场";
}
