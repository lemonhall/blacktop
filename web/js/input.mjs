/**
 * 输入采集：键盘、触屏 → 一帧操作意图。
 *
 * 摩托车的操作只有七个：**油门、刹车、压车（左右连续量）、氮气、前打、回身打、
 * 换家伙**。没有准星、没有鼠标——这一层因此比射击版干净得多：它只回答"这一帧你
 * 想怎么骑"，坐标一个字节都不上行，这是"改一行 JS 就能瞬移"的唯一根治法。
 *
 * 方向键与 WASD **同时生效**，不是二选一：`THROTTLE` 这样的表里把两种键都列上，
 * 谁按哪个都算数。攻击按原版的路子分前后两个方向（不是两套招式）——详见 `sim/racer.mjs`。
 */

const LEFT = ["KeyA", "ArrowLeft"];
const RIGHT = ["KeyD", "ArrowRight"];
const THROTTLE = ["KeyW", "ArrowUp"];
const BRAKE = ["KeyS", "ArrowDown"];
const NITRO = ["Space"];
/** 正前方一拳：`J` 主键，`F` 是上一版的兼容键（老玩家改不过来，留着不碍事）。 */
const PUNCH_FRONT = ["KeyJ", "KeyF"];
/** 回身一拳：打身后追上来的那个人。 */
const PUNCH_BACK = ["KeyK"];
/** 换家伙：腰里那几件轮着用。只有一件时按了也没反应（见 `cycleWeapon`）。 */
const CYCLE = ["KeyQ"];

/** 触屏那几个按钮 → 同一个位掩码（1 前打 / 2 回身打 / 4 换家伙）。 */
const TOUCH_ACT = { punchFront: 1, punchBack: 2, cycle: 4 };

const any = (keys, list) => list.some(code => keys.has(code));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function attachInput(S, { onPunch, onNitro } = {}) {
  document.addEventListener("keydown", event => {
    // 按住不放的键：氮气是"持续"的（它读 keys 集合，这里拦的只是重复触发音效），
    // 换家伙是**一次性**的——按住 Q 一路把四件轮一圈，那不是操作，那是抽奖。
    if (event.repeat && (NITRO.includes(event.code) || CYCLE.includes(event.code) || event.code === "Space")) return;
    // 方向键与空格会滚动页面——赛车游戏里这尤其致命（画面一顿就甩出弯道）。
    if (/^Arrow/u.test(event.code) || event.code === "Space") event.preventDefault();
    S.keys.add(event.code);
    if (PUNCH_FRONT.includes(event.code)) { S.actions |= 1; onPunch?.(); }
    else if (PUNCH_BACK.includes(event.code)) { S.actions |= 2; onPunch?.(); }
    else if (CYCLE.includes(event.code)) S.actions |= 4;
    if (NITRO.includes(event.code)) onNitro?.();
  });
  document.addEventListener("keyup", event => S.keys.delete(event.code));
  window.addEventListener("blur", () => clearInputs(S));
  document.addEventListener("visibilitychange", () => { if (document.hidden) clearInputs(S); });
}

export function clearInputs(S) {
  S.keys.clear();
  S.actions = 0;
  S.touch = { steer: 0, throttle: 0, brake: 0, nitro: 0 };
  document.querySelectorAll(".touch-pad>i").forEach(node => { node.style.transform = ""; });
  document.querySelectorAll(".touch-button").forEach(node => node.classList.remove("on"));
}

/** 这一帧的操作意图。连续量保留原样——摇杆不该被退化成"左右两档"。 */
export function readControls(S) {
  const keys = S.keys;
  const steer = (any(keys, RIGHT) ? 1 : 0) - (any(keys, LEFT) ? 1 : 0);
  const locked = S.countdown > 0;             // 发车倒数里油门/刹车是锁死的
  return {
    th: locked ? 0 : (any(keys, THROTTLE) || S.touch.throttle ? 1 : 0),
    br: locked ? 1 : (any(keys, BRAKE) || S.touch.brake ? 1 : 0),
    st: clamp(steer + S.touch.steer, -1, 1),
    nos: !locked && (any(keys, NITRO) || !!S.touch.nitro),
  };
}

/**
 * 触屏：一根"压车"滑杆 + 三个按住式按钮。**不做虚拟摇杆**——赛车只需要一个轴，
 * 摇杆的二维自由度在这里纯属负担，而左右滑条盲操的成功率高得多。
 */
export function bindTouch(S, root) {
  const pad = root.querySelector("#steerPad");
  if (pad) {
    const knob = pad.querySelector("i");
    let pointer = null;
    const set = event => {
      const rect = pad.getBoundingClientRect();
      const limit = rect.width * 0.42;
      const dx = clamp(event.clientX - rect.left - rect.width / 2, -limit, limit);
      knob.style.transform = `translateX(${dx}px)`;
      S.touch.steer = dx / limit;
    };
    pad.addEventListener("pointerdown", event => {
      event.preventDefault(); pointer = event.pointerId;
      pad.setPointerCapture(pointer); set(event);
    });
    pad.addEventListener("pointermove", event => { if (event.pointerId === pointer) set(event); });
    const release = event => {
      if (event.pointerId !== pointer) return;
      pointer = null; knob.style.transform = ""; S.touch.steer = 0;
    };
    pad.addEventListener("pointerup", release);
    pad.addEventListener("pointercancel", release);
  }
  for (const button of root.querySelectorAll("[data-hold]")) {
    const field = button.dataset.hold;
    const act = TOUCH_ACT[field] | 0;
    const down = event => {
      event.preventDefault(); button.classList.add("on");
      if (act) { S.actions |= act; return; }
      S.touch[field] = 1;
    };
    const up = () => { button.classList.remove("on"); if (!act) S.touch[field] = 0; };
    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
    button.addEventListener("pointerleave", up);
  }
}

/*
 * 上行报文的组装**不在这里**：一条命令要走"方向变了就收尾、每格计数、定期发送"
 * 那套时间线，那套东西住在 `cmd.mjs`。这一层只回答"这一帧按着什么"。
 */
