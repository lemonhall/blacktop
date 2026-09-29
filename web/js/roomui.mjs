/**
 * 候场页：房间条 + 参战名册 + 房主控制 + 选车。
 *
 * 这一层是"权限"在界面上的投影：同一份房间视图到了不同的人手里长得不一样——
 * 房主看到的机器人加减按钮是可点的，别人看到的是灰的。**但真正的拒绝发生在
 * 服务端**（`isHost`），这里只是别让人白点。界面永远不是安全边界。
 *
 * 射击版里的"选边"在这里换成了"选车"：赛车各自为战，没有队可分，而车型是
 * 三种取舍（极速 / 起步 / 抗撞），正好占据同一个位置。
 */

import { BIKES, DIFFICULTIES, MODES } from "/sim/data.mjs";
import { renderRoster } from "./roster.mjs";
import { S } from "./state.mjs";

const $ = id => document.getElementById(id);

let hooks = {};
let view = null;
/**
 * 房里的一次性提示：选车被拒、开局被拒这类"服务端说了不行"的话，必须写在
 * **玩家正看着的那一屏**上。大厅那条 `#roomsNote` 在候场页是隐藏的，写在那儿
 * 等于没说——玩家点一下"出发"，界面毫无动静，只会以为按钮坏了。
 */
let noteHoldUntil = 0;

export function bindRoom(next) {
  hooks = next;
  $("botStepper").querySelectorAll("[data-bot]").forEach(button => {
    button.addEventListener("click", () => {
      if (!isHost()) return;
      const step = Number(button.dataset.bot);
      hooks.onBots?.(Math.max(0, Math.min(maxBots(), (view?.bots || 0) + step)));
    });
  });
  document.querySelectorAll("[data-mode]").forEach(card => {
    card.addEventListener("click", () => { if (isHost()) hooks.onConfig?.({ mode: card.dataset.mode }); });
  });
  document.querySelectorAll("[data-difficulty]").forEach(button => {
    button.addEventListener("click", () => {
      if (isHost()) hooks.onConfig?.({ difficulty: Number(button.dataset.difficulty) });
    });
  });
  $("bikePicker").querySelectorAll("[data-bike]").forEach(card => {
    card.addEventListener("click", () => {
      if (!canPickBike()) return;
      hooks.onBike?.(Number(card.dataset.bike));
    });
  });
  $("startButton").addEventListener("click", () => { if (isHost()) hooks.onStart?.(); });
  // 分享是每个人都能做的事——"拉人"不该只有房主干得了。
  $("shareRoomButton").addEventListener("click", () => { if (view) hooks.onShare?.(view.id); });
  $("leaveRoomButton").addEventListener("click", () => hooks.onLeave?.());
  $("readyButton").addEventListener("click", () => {
    if (isHost()) return;
    hooks.onReady?.(!(view && view.you && view.you.ready));
  });
  $("joinLiveToggle").addEventListener("change", event => {
    if (isHost()) hooks.onConfig?.({ joinLive: event.target.checked });
  });
  setHostUi(false);
}

const isHost = () => !!(view && view.you && view.you.host);
const maxBots = () => (view ? Math.min(view.maxBots, (MODES[view.mode] || MODES.city).bots) : 13);
/** 选车只在候场有意义：发车格上的号码布不会中途换。 */
const canPickBike = () => !!(view && view.ph === "staging");

function setHostUi(host) {
  $("rosterPanel").classList.toggle("guest", !host);
  $("botStepper").querySelectorAll("button").forEach(b => { b.disabled = !host; });
  document.querySelectorAll("[data-mode],[data-difficulty]").forEach(el => {
    el.disabled = !host;
    el.title = host ? "" : "只有房主能改房间配置";
  });
  $("joinLiveField").classList.toggle("guest", !host);
  $("joinLiveToggle").disabled = !host;
  $("joinLiveField").title = host ? "关掉之后，开跑期间不再收新人" : "只有房主能改";
  $("startButton").disabled = !host;
}

/** 服务端每次广播房间状态都会走到这里，所以界面永远只是它的投影。 */
export function renderRoom(next) {
  view = next;
  const mode = MODES[view.mode] || MODES.city;
  $("roomPhase").textContent = view.ph === "live" ? "对局中" : view.ph === "over" ? "已结算" : "准备中";
  $("roomPhase").className = `phase-badge ${view.ph === "live" ? "live" : view.ph === "over" ? "over" : ""}`;
  $("roomTitle").textContent = view.name;
  $("roomCodeLabel").textContent = `#${view.id}`;
  $("roomMeta").textContent =
    `${mode.name} · ${view.trackDesc} · ${view.members.length} 人 + ${view.bots} 机器人 · 难度 ${DIFFICULTIES[view.diff].name}` +
    (view.join ? " · 可中途加入" : " · 开跑后谢客");
  $("rosterCount").textContent = `${view.members.length} / ${view.capacity}`;
  renderRoster(view, hooks);
  $("botCount").textContent = view.bots;
  $("startModeLabel").textContent = `${mode.name} · ${mode.sub}`;
  syncModeCards(mode.id);
  syncDifficulty(view.diff);
  setHostUi(isHost());
  renderReadyState(view);
  renderBikes(view);
  $("joinLiveToggle").checked = !!view.join;
  renderNotes(view);
}

function renderReadyState(current) {
  const button = $("readyButton");
  const staging = current.ph === "staging";
  const meReady = !!(current.you && current.you.ready);
  button.classList.toggle("hidden", !staging || isHost());
  button.classList.toggle("on", meReady);
  button.disabled = !staging || isHost();
  button.textContent = meReady ? "已举手 · 点一下取消" : "我准备好了";
  // 开跑按钮只在"房主 + 全员举手 + 人数够 + 没超编"的时候才是亮的；服务端还会再拦一次。
  const enough = current.members.length + current.bots >= 2;
  const over = current.members.length + current.bots > current.capacity + current.maxBots;
  const ready = isHost() && current.allReady && enough && !over && current.ph === "staging";
  $("startButton").disabled = !ready;
  $("startButton").classList.toggle("hold", !ready);
  $("startButton").querySelector("span").firstChild.textContent =
    isHost() ? (ready ? "出发" : "等大家举手") : "等待房主开始";
}

/** 选车：三张卡片，选中态由服务端回推的 `you.bike` 决定。 */
function renderBikes(current) {
  const mine = current.you ? current.you.bike : 0;
  $("bikePicker").querySelectorAll("[data-bike]").forEach(card => {
    const on = Number(card.dataset.bike) === mine;
    card.classList.toggle("selected", on);
    card.setAttribute("aria-pressed", String(on));
    card.disabled = !canPickBike();
  });
  const bike = BIKES[mine] || BIKES[0];
  $("bikeNote").textContent = bike.note;
  S.bike = mine;
}

function renderNotes(current) {
  const note = $("rosterNote");
  const enough = current.members.length + current.bots >= 2;
  const over = current.members.length + current.bots > current.capacity + current.maxBots;
  // 刚闪过一次性提示就先让它把话说完，别立刻被例行文案盖掉。
  if (Date.now() < noteHoldUntil) return;
  if (over) {
    note.textContent = `人太多了：现在 ${current.members.length} 人 + ${current.bots} 机器人，`
      + `而这间房最多带 ${current.capacity} 人 + ${current.maxBots} 机器人。请几位出去，或者少放几个机器人。`;
    note.classList.add("warn");
  } else if (!enough) {
    note.textContent = "至少要有两个参战者才能开跑（加个机器人就行）";
    note.classList.add("warn");
  } else if (isHost()) {
    note.textContent = current.allReady ? "全员举手，可以出发了" : `还在等：${(current.pending || []).join("、")}`;
    note.classList.toggle("warn", !current.allReady);
  } else {
    note.textContent = current.you && current.you.ready ? "已举手，等房主发车…" : "点「我准备好了」，房主才能发车";
    note.classList.remove("warn");
  }
  const join = current.join ? "对局中仍可加入" : "开跑后谢客";
  $("teamNote").textContent = `${current.members.length} 名真人 + ${current.bots} 个机器人 · 各自为战 · ${join}`;
}

function syncModeCards(mode) {
  document.querySelectorAll("[data-mode]").forEach(card => {
    const on = card.dataset.mode === mode;
    card.classList.toggle("selected", on);
    card.setAttribute("aria-pressed", String(on));
  });
}

function syncDifficulty(difficulty) {
  document.querySelectorAll("[data-difficulty]").forEach(button => {
    const on = Number(button.dataset.difficulty) === difficulty;
    button.classList.toggle("selected", on);
    button.setAttribute("aria-pressed", String(on));
  });
}

export const currentRoom = () => view;
export const roomIsHost = isHost;

/** 服务端拒了一次我的动作：把它写在候场页看得见的地方。 */
export function flashRoomNote(text, warn = true) {
  noteHoldUntil = Date.now() + 6000;
  const note = $("rosterNote");
  note.textContent = text;
  note.classList.toggle("warn", warn);
}
