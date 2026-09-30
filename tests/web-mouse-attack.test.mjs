/**
 * 鼠标左键 = 正前方一拳。
 *
 * 这条新输入最容易出的事故不是"打不出去"，而是**打得到处都是**：在大厅点一下卡片
 * 也挥一拳、点暂停按钮顺手把拳挥掉、右键弹出菜单的同时人往后仰。所以这里钉的是
 * 四个门槛（在赛道上 / 只认左键 / 落在控件上不算 / 暂停时不打）加上"按住不放
 * 和按住 J 等价"。
 *
 * 没有真 DOM：`attachInput` 只要一个能 `addEventListener` 的 document，所以按需要
 * 把事件收进一个表里，然后像浏览器那样把事件交给它——测的是**分派逻辑**，不是浏览器。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { attachInput, clearInputs, pumpActions } from "../web/js/input.mjs";

/** 装上假的 document / window，返回"事件怎么发"的那套工具。 */
function harness({ paused = false } = {}) {
  const on = new Map();
  // 遮罩的语义照抄真页面：**不暂停的时候它带着 `hidden` 这个 class**。
  const backdrop = { classList: { contains: name => (name === "hidden" ? !paused : false) } };
  const win = { addEventListener: () => {} };
  const doc = {
    hidden: false,
    addEventListener: (type, fn) => {
      if (!on.has(type)) on.set(type, []);
      on.get(type).push(fn);
    },
    getElementById: id => (id === "modalBackdrop" ? backdrop : null),
    querySelectorAll: () => [],
  };
  globalThis.window = win;
  globalThis.document = doc;
  /**
   * 发一个事件给所有听众。`target` 默认是画布：没有 `closest`，等于"点在路上"。
   * 每发一次都把全局换成**这一份** stub——同一段测试里建好几个 harness 时，
   * 谁的事件就该读到谁的 document，否则断言会为错误的理由通过。
   */
  const fire = (type, event = {}) => {
    globalThis.window = win;
    globalThis.document = doc;
    for (const fn of on.get(type) || []) fn({ preventDefault() {}, ...event });
  };
  const S = {
    screen: "play", keys: new Set(), touch: { steer: 0, throttle: 0, brake: 0, nitro: 0 },
    actions: 0, actWait: null, mouseHold: false, predictMe: { attackCd: 0 },
  };
  const punches = [];
  attachInput(S, { onPunch: () => punches.push(1) });
  return { S, fire, punches, down: extra => fire("mousedown", { button: 0, ...extra }) };
}

test("赛道上点一下左键：就等于按了一下 J", () => {
  const { S, down, punches } = harness();
  down();
  assert.equal(S.actions & 1, 1, "左键没有打出去");
  assert.equal(punches.length, 1, "出手了却没响");
  assert.equal(S.mouseHold, true, "按下之后该记着'还按着'");
});

test("按住不放 = 一直挥：冷却一好就再打一下", () => {
  const { S, down } = harness();
  down();
  S.actions = 0;
  // 胳膊还在收：这一下该记在 `actWait` 里，冷却一到就兑现，而不是被吞掉。
  S.predictMe.attackCd = 0.4;
  pumpActions(S, 0);
  assert.equal(S.actions & 1, 0, "冷却里不该打出去");
  assert.ok(S.actWait, "冷却里的那一下没被记下来");
  S.predictMe.attackCd = 0;
  pumpActions(S, 0);
  assert.equal(S.actions & 1, 1, "冷却好了，记着的那一拳没有兑现");
});

test("松手就不再挥", () => {
  const { S, down, fire } = harness();
  down();
  fire("mouseup");
  S.actions = 0;
  pumpActions(S, 0);
  assert.equal(S.actions & 1, 0, "手都松开了还在打");
  assert.equal(S.mouseHold, false);
});

test("大厅、候场、结算页点一下：不出拳（那是在点界面）", () => {
  for (const screen of ["rooms", "staging", "over"]) {
    const { S, down, punches } = harness();
    S.screen = screen;
    down();
    assert.equal(S.actions, 0, `${screen} 上点一下也出拳了`);
    assert.equal(punches.length, 0);
  }
});

test("右键、按钮、暂停遮罩：都不出拳", () => {
  const right = harness();
  right.fire("mousedown", { button: 2 });
  assert.equal(right.S.actions, 0, "右键也出拳——那是留给上下文菜单的");

  const onButton = harness();
  onButton.down({ target: { closest: () => ({ tagName: "BUTTON" }) } });
  assert.equal(onButton.S.actions, 0, "点暂停按钮顺手把拳挥了");

  const paused = harness({ paused: true });
  paused.down();
  assert.equal(paused.S.actions, 0, "暂停遮罩里还能出拳");
});

test("切到后台 / 失焦：按住的状态要被熄掉", () => {
  const { S, down } = harness();
  down();
  clearInputs(S);
  assert.equal(S.mouseHold, false, "切后台之后鼠标还按着——回来看见人一直在挥拳");
  S.actions = 0;
  pumpActions(S, 0);
  assert.equal(S.actions & 1, 0);
});
