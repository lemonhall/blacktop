/**
 * 编排层：主循环、输入上行、启动接线。
 *
 * 这里刻意不写任何规则。它只做三件事：
 *   1. 以固定 60Hz 跑**只预测我自己**的那台车，并按 25Hz 把输入意图发出去；
 *   2. 每帧把最新快照插值成画面，再把 HUD 同步到 DOM；
 *   3. 把界面上的按钮接到"发一条消息"上。
 *
 * 房间与对局的协议处理在 `session.mjs`，屏幕切换在 `screens.mjs`，
 * 渲染在 `render.mjs` / `road.mjs` / `sprites.mjs`。这个文件只负责串起来。
 */

import { DT } from "../../sim/constants.mjs";
import { S } from "./state.mjs";
import { attachInput, bindTouch, readControls } from "./input.mjs";
import { buildView } from "./view.mjs";
import { stepPredict } from "./predict.mjs";
import { flushCmd, frameInput, initCmds, noteTick } from "./cmd.mjs";
import { renderGame } from "./render.mjs";
import { consumeEvents, stepFx } from "./fx.mjs";
import { engineSound, initAudio, resumeAudio, toggleSound } from "./audio.mjs";
import { connect, initRooms } from "./rooms.mjs";
import { bindRoom, roomIsHost } from "./roomui.mjs";
import { updateHud } from "./hud.mjs";
import { bindResults, hideResults } from "./results.mjs";
import { initShowcase, renderShowcase, resizeShowcase } from "./showcase.mjs";
import { joinRoom, leaveRoom, send } from "./session.mjs";
import { setScreen, togglePause } from "./screens.mjs";
import { copyInvite, joinFromLink } from "./invite.mjs";

const $ = id => document.getElementById(id);
const ctx = () => $("game").getContext("2d");

/** 单帧最多补几格（60Hz 下 400ms）：浏览器卡一下之后要把时间补回来，不能丢时间混过去。 */
const MAX_TICKS_PER_FRAME = 24;

const state = { last: 0, acc: 0, screen: "rooms" };

// ---------------------------------------------------------------- 主循环

function frame(now) {
  const delta = Math.min((now - state.last) / 1000, 0.25) || 0;
  state.last = now;
  if (state.screen !== S.screen) { state.acc = 0; state.screen = S.screen; }
  // 候场与大厅都要那块展示台：既让页面不空，也让人开跑之前先看清自己骑什么。
  if (S.screen === "rooms" || S.screen === "staging") renderShowcase(now / 1000);
  if (S.screen === "play" || S.screen === "over") tickArena(delta, now);
  requestAnimationFrame(frame);
}

function tickArena(delta, now) {
  const view = buildView(S);
  if (!view) return;
  // 事件先消费再画：播报和震屏必须和这一帧的车在同一张画上。
  if (S.pendingEvents.length) { consumeEvents(S.pendingEvents, view); S.pendingEvents = []; }
  stepFx(delta, view);

  const me = S.predictMe;
  if (me) {
    const controls = readControls(S);
    // `act` 是待发出的动作位（1 前打 / 2 回身打 / 4 换家伙）。它同时喂给本地预测
    // 与画面：判定在服务端，但"我的胳膊什么时候出去"必须本帧就有反应，否则每一下
    // 都慢半拍。换家伙不算挥拳——只按下 Q 的时候，胳膊不该跟着甩一下。
    const act = S.actions | 0;
    if ((act & 3) && S.countdown <= 0) { S.swing = 0.32; S.swingBack = (act & 2) !== 0; }
    const cmd = frameInput(now, controls);
    state.acc = Math.min(state.acc + delta, DT * MAX_TICKS_PER_FRAME);
    let guard = 0;
    while (state.acc >= DT && guard++ < MAX_TICKS_PER_FRAME) {
      state.acc -= DT;
      // 发车倒数里油门是锁死的，两边的世界也都在等——这几格不该算作"我走了"。
      if (S.countdown > 0) continue;
      S.predictW.events.length = 0;
      stepPredict(S, DT, controls, act);
      noteTick(cmd);
    }
    // 世界是被消息驱动的：就算这一帧一格都没走（倒数中、或者人还躺在地上），
    // 也必须让上行流活着——否则倒数永远走不完，结算只能靠 alarm 兜底。
    if (S.screen === "play") flushCmd(now);
    engineSound(me.v, controls.th, controls.nos);
  }
  S.swing = Math.max(0, S.swing - delta);
  renderGame(ctx(), view);
  updateHud(view);
}

// ---------------------------------------------------------------- 尺寸

function resize() {
  S.dpr = Math.min(window.devicePixelRatio || 1, 2);
  S.view.w = window.innerWidth;
  S.view.h = window.innerHeight;
  const canvas = $("game");
  canvas.width = Math.max(2, Math.round(S.view.w * S.dpr));
  canvas.height = Math.max(2, Math.round(S.view.h * S.dpr));
  resizeShowcase();
  const view = buildView(S);
  if (view) renderGame(ctx(), view);
}

// ---------------------------------------------------------------- 接线

function openHelp() {
  $("modalBackdrop").classList.remove("hidden");
  $("pauseModal").classList.add("hidden");
  $("helpModal").classList.remove("hidden");
}

function bindShell() {
  $("pauseButton").addEventListener("click", () => togglePause(true));
  $("resumeButton").addEventListener("click", () => {
    togglePause(false);
    $("game").focus({ preventScroll: true });
  });
  $("exitButton").addEventListener("click", () => { togglePause(false); leaveRoom(true); });
  $("helpLobby").addEventListener("click", openHelp);
  $("helpHeader").addEventListener("click", openHelp);
  $("closeHelp").addEventListener("click", () => togglePause(false));
  document.querySelectorAll(".sound-toggle").forEach(button => {
    button.addEventListener("click", () => {
      const on = toggleSound();
      button.textContent = on ? "♪" : "✕";
      button.classList.toggle("off", !on);
    });
  });
  document.querySelectorAll(".fullscreen-button").forEach(button => {
    button.addEventListener("click", () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      else document.exitFullscreen?.();
    });
  });
  document.querySelector(".brand")?.addEventListener("click", event => event.preventDefault());
  window.addEventListener("resize", resize);
  // 浏览器的音频闸门：第一次真的碰一下键盘或屏幕，才允许出声。
  const wake = () => {
    resumeAudio();
    window.removeEventListener("pointerdown", wake);
    window.removeEventListener("keydown", wake);
  };
  window.addEventListener("pointerdown", wake);
  window.addEventListener("keydown", wake);
}

function bindKeys() {
  document.addEventListener("keydown", event => {
    if (event.code !== "Escape" && event.code !== "KeyP") return;
    if (S.screen !== "play") return;
    event.preventDefault();
    togglePause($("modalBackdrop").classList.contains("hidden"));
  });
}

function bindGame() {
  // 命令时间线的出口交给编排层：`cmd.mjs` 只管攒命令，不碰 socket。
  initCmds(send);
  bindRoom({
    onBots: n => send({ t: "bots", n }),
    onConfig: patch => send({ t: "config", ...patch }),
    onStart: () => send({ t: "start" }),
    onLeave: () => leaveRoom(true),
    // 举手 / 选车 / 踢人：三个都是"我的意图"，拍板的是服务端。
    onReady: v => send({ t: "ready", v }),
    onBike: b => send({ t: "bike", b }),
    onKick: id => send({ t: "kick", id }),
    // 分享：一条链接把朋友直接拉进这间房。
    onShare: id => void copyInvite(id),
  });
  bindResults({
    // 「再来一局」的语义：房主能重开，其他人只能回到候场等。
    onReset: () => {
      if (roomIsHost()) send({ t: "reset" });
      else { hideResults(); setScreen("staging"); }
    },
    onBack: () => { hideResults(); setScreen("staging"); },
  });
  initRooms({ onJoin: roomId => void joinRoom(roomId) });
  initShowcase({});
  attachInput(S, {});
  bindTouch(S, document);
}

async function boot() {
  if (matchMedia("(pointer:coarse)").matches || navigator.maxTouchPoints > 0) {
    document.documentElement.classList.add("touch-device");
  }
  resize();
  bindShell();
  bindKeys();
  bindGame();
  initAudio();
  setScreen("rooms");
  await connect();
  // `?room=CODE`：拿到邀请链接的人直接进场，不必先在列表里翻房间。
  await joinFromLink();
  requestAnimationFrame(frame);
  window.BLACKTOP = {
    version: "1.0",
    S,
    snapshot: () => ({ screen: S.screen, room: S.room?.id || null, map: !!S.map, rtt: S.rtt, snaps: S.snaps.length }),
  };
}

void boot();
