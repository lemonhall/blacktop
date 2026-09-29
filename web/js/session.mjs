/**
 * 对局会话：一条 WebSocket 上的全部收发与分发。
 *
 * 它只做三件事：
 *   1. 开关连接，把消息分派到各个模块（房间视图 → roomui，地图 → render，
 *      快照 → view/predict，事件 → fx，结算 → results）；
 *   2. 在服务端说"出发 / 结算"时切屏幕；
 *   3. 给上层一个 `send()`，别的模块不碰 socket。
 *
 * 一条最容易被忽略的约定：**界面跟着服务端走**。收到 `room` 说还在 staging，
 * 哪怕我这边已经切到赛道上了，也要乖乖切回候场——反过来就会两边不一致。
 */

import { decodeMap, decodeRacer, mineIn } from "../../sim/wire.mjs";
import { createTrack } from "../../sim/track.mjs";
import { S } from "./state.mjs";
import { openSocket, startPing } from "./net.mjs";
import { ensureSession, refresh, notice } from "./rooms.mjs";
import { pushSnapshot } from "./view.mjs";
import { initPredict, reconcile } from "./predict.mjs";
import { seedFx } from "./fx.mjs";
import { play } from "./audio.mjs";
import { renderRoom, flashRoomNote } from "./roomui.mjs";
import { showResults, hideResults } from "./results.mjs";
import { selectedBike } from "./showcase.mjs";
import { resetMatchState, setScreen } from "./screens.mjs";

const $ = id => document.getElementById(id);

let link = null;
let stopPing = null;

/** 别的模块要发消息时统一走这里，socket 的生命周期只由本模块管。 */
export const send = payload => link?.send(payload);
export const linkState = () => link;

export async function joinRoom(roomId) {
  leaveRoom(false);
  // 等身份落定再连：建房用的令牌和这条 socket 用的必须是**同一张**，
  // 否则服务端认不出"我是房主"（跨境链路上这曾经是个必现的 bug）。
  await ensureSession();
  resetMatchState();
  link = openSocket(roomId, { onMessage: onServerMessage, onClose: onSocketClose });
  stopPing = startPing(link);
  $("roomTitle").textContent = "正在进入房间…";
  setScreen("staging");
}

export function leaveRoom(goRooms = true) {
  if (stopPing) { stopPing(); stopPing = null; }
  if (link) { link.close(); link = null; }
  resetMatchState();
  if (goRooms) { void refresh(); setScreen("rooms"); }
}

/**
 * 断了。两种情形要说两种话：**握手就没成**（房间散了、码打错了、被谢客的房拒了）
 * 与**进房之后掉线**。混为一谈的话，拿着过期邀请链接来的人只会看到
 * "连接已断开"，然后自己猜。
 */
function onSocketClose(info = {}) {
  if (S.screen === "rooms") return;
  if (info.opened === false) {
    notice("这一间进不去：房间可能已经散了，或者链接里的房间码不对。", true);
  } else {
    $("screenReaderStatus").textContent = "与房间的连接已断开。";
  }
  leaveRoom(true);
}

function onServerMessage(msg) {
  switch (msg.t) {
    case "hello":
      S.room = msg.room;
      renderRoom(msg.room);
      // 连上就把我的车型报上去：服务端才是名册的唯一真相，本地选的只是意图。
      send({ t: "bike", b: selectedBike() });
      return;
    case "room":
      S.room = msg;
      renderRoom(msg);
      if (msg.ph === "staging" && S.screen !== "staging") { hideResults(); setScreen("staging"); }
      return;
    case "begin":
      S.room = msg.room;
      renderRoom(msg.room);
      resetMatchState();
      setScreen("play");
      play("go");
      return;
    case "map":
      applyMap(msg);
      // 中途加入的人不会收到 `begin`（那是对局开始那一刻的广播），所以他必须靠
      // "房间已经是 live" 来判断该进场。少这一条，人就会卡在候场页看别人跑。
      if (S.room?.ph === "live" && S.screen !== "play") setScreen("play");
      return;
    case "s": return onSnapshot(msg);
    case "over":
      S.results = msg.results;
      showResults(msg.results);
      setScreen("over");
      play(winFrom(msg.results) ? "win" : "lose");
      return;
    case "pong": S.rtt = Math.round(performance.now() - S.lastPingAt); return;
    case "kicked":
      notice("房主把你请出了房间（十分钟内不能重进这一间）。", true);
      leaveRoom(true);
      return;
    case "error":
      onServerError(msg);
      return;
    default: return;
  }
}

/**
 * 地图只在**开局**和**有人补位**这两个时刻下发，第二种情况下的地图和第一条
 * 是同一颗种子、同一条赛道——变的只有名册（多了一个人）。
 *
 * 所以这里必须分开处理：同一条路重发就只换名册。整个重建一遍的话，
 * `S.track` 会被换成新对象，而本地预测的迷你世界还指着旧的那一个，两边
 * 从此各算各的路——画面上就是"车沿着一条看不见的线骑"。
 */
function applyMap(msg) {
  const next = decodeMap(msg);
  if (S.map && S.map.seed === next.seed && S.map.mode === next.mode) {
    S.map.roster = next.roster;
    return;
  }
  S.map = next;
  S.mode = next.mode;
  S.seed = next.seed;
  S.track = createTrack({ seed: next.seed, mode: next.mode });
  seedFx(next.seed);
}

function onSnapshot(snapshot) {
  pushSnapshot(S, snapshot);
  // 身份在名册里，不在快照里——见 `sim/wire.mjs` 的 `racerIdOf`。
  const mine = mineIn(snapshot, S.map ? S.map.roster : null, S.meId);
  // 事件先屯着：播报里要区分"是我干的"还是别人干的，而那需要一帧插值后的
  // 完整画面（谁在第几名、离我多远）。所以由渲染循环在 `buildView` 之后再消费。
  if (snapshot.ev && snapshot.ev.length) S.pendingEvents.push(...snapshot.ev);
  if (!mine || !S.map) return;
  const me = decodeRacer(mine, S.map.roster);
  if (!S.predictMe && S.track) initPredict(S, me);
  reconcile(S, me);
}

const winFrom = results => {
  const me = (results.players || []).find(p => p.ownerId === S.meId);
  return !!me && me.rank === 1;
};

/**
 * 服务端的拒绝分两种：**还能接着说**的（还有人没举手、这一边坐满了），
 * 和**必须散场**的（房间满了、房主关了中途加入、被踢了）。
 *
 * "还能接着说"的那几种要**两边都写**：大厅的提示条是给回到大厅之后看的，
 * 而人此刻还站在候场页上——候场页看不到 `#roomsNote`，写一处等于什么都没说。
 */
function onServerError(msg) {
  const waiting = msg.pending && msg.pending.length ? `（还没举手：${msg.pending.join("、")}）` : "";
  $("screenReaderStatus").textContent = `服务端拒绝：${msg.error}${waiting}`;
  if (msg.error === "not_ready") {
    const names = (msg.pending || []).join("、");
    notice(`还有人没举手：${names}`, true);
    flashRoomNote(`还有人没举手：${names}`);
    return;
  }
  if (msg.error === "join_closed") { notice("这间房谢客：房主没允许中途加入。", true); return leaveRoom(true); }
  if (msg.error === "kicked") { notice("你被这间房请出去了，十分钟内不能再进。", true); return leaveRoom(true); }
  if (msg.error === "room_full") { notice("这间房满员了。", true); return leaveRoom(true); }
  if (msg.error === "too_many") {
    const text = "人太多了：换回装得下的赛道，或者请几位出去。";
    notice(text, true); flashRoomNote(text);
  }
}
