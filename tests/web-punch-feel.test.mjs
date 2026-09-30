/**
 * 客户端这一半的"打击手感"：**冷却中的那一拳不许被吞掉**。
 *
 * 线上实测按 21 次 J，有 7 次**一点回音都没有**——不是"你打空了"，是"你按了，
 * 游戏没理你"。原因很朴素：手里的家伙越好，冷却越长（`attackCd × spec.cd`），
 * 而玩家连按的节奏是均匀的，于是有一部分必然落在冷却里，被服务端一句
 * `attackCd > 0` 直接丢掉。
 *
 * 现在这一票先记在客户端（`S.actWait`），胳膊一能动就立刻兑现。这一份钉住它
 * 的三条边界：空着手直接出、收着的时候先记、记太久就作废。
 *
 * 顺带钉住上行报文的 `vt === cvt`：整幅画只有一个时刻（`view.mjs` 的 `leadTime`），
 * 这两个字段说的是同一件事，分开取值只会在服务端拼出一个不存在的世界。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { attachInput, clearInputs, pumpActions } from "../web/js/input.mjs";
import { flushCmd, frameInput, initCmds, resetCmds } from "../web/js/cmd.mjs";
import { S } from "../web/js/state.mjs";

/** 一块只认 `keydown`/`keyup` 的假 DOM。返回一个"敲一下某键"的把手。 */
function fakeDom() {
  const handlers = {};
  const prevDoc = globalThis.document, prevWin = globalThis.window;
  globalThis.document = {
    addEventListener: (type, fn) => { (handlers[type] ||= []).push(fn); },
    querySelectorAll: () => [],
  };
  globalThis.window = { addEventListener: () => {} };
  return {
    press(code) { for (const fn of handlers.keydown || []) fn({ code, repeat: false, preventDefault() {} }); },
    restore() { globalThis.document = prevDoc; globalThis.window = prevWin; },
  };
}

/** 一条干净的输入线：按键集合、动作位、待兑现的那一拳都清空。 */
function fresh(cd) {
  const dom = fakeDom();
  clearInputs(S);
  S.predictMe = { attackCd: cd };
  attachInput(S, {});
  return dom;
}

test("胳膊空着：按 J 就是直接出手，不进等待", () => {
  const dom = fresh(0);
  try {
    dom.press("KeyJ");
    assert.equal(S.actions & 1, 1, "没在冷却，立刻挥出去");
    assert.equal(S.actWait, null, "不需要记");
  } finally { dom.restore(); }
});

test("胳膊还在收：这一拳先记下来，冷却一结束就兑现", () => {
  const dom = fresh(0.4);
  try {
    dom.press("KeyK");
    assert.equal(S.actions & 2, 0, "冷却里不白挥");
    assert.ok(S.actWait, "但这一票记着");
    assert.equal(S.actWait.act, 2, "记的是回身那一拳，方向不许丢");
    S.predictMe.attackCd = 0;
    pumpActions(S);
    assert.equal(S.actions & 2, 2, "胳膊一能动就兑现");
    assert.equal(S.actWait, null);
  } finally { dom.restore(); }
});

test("记太久就丢掉：四百多毫秒之后还不等，说明玩家早忘了这一下", () => {
  const dom = fresh(9);
  try {
    dom.press("KeyJ");
    assert.ok(S.actWait);
    pumpActions(S, S.actWait.until + 1);
    assert.equal(S.actWait, null, "过期的等待要被清掉");
    assert.equal(S.actions & 1, 0, "而且不该在很久之后突然自己挥出去");
  } finally { dom.restore(); }
});

test("等待只留最后一票：冷却里又按了一次，方向按最后一次算", () => {
  const dom = fresh(0.4);
  try {
    dom.press("KeyJ");
    dom.press("KeyK");
    assert.equal(S.actWait.act, 2, "后按的那一下说了算（按住 J 连打的语义也是这样）");
    assert.equal(S.actions & 3, 0, "冷却里一票都不发");
    S.predictMe.attackCd = 0;
    pumpActions(S);
    assert.equal(S.actions & 3, 2, "兑现的是回身那一拳");
  } finally { dom.restore(); }
});

test("上行报文里 `vt` 和 `cvt` 是同一个时刻", () => {
  const dom = fakeDom();
  try {
    const sent = [];
    initCmds(payload => sent.push(payload));
    resetCmds();
    clearInputs(S);
    S.carTm = 12.5;
    const cmd = frameInput(1000, { th: 1, br: 0, st: 0, nos: false });
    cmd.n = 3;
    flushCmd(1000, true);
    assert.equal(sent.length, 1, "真的发出了一条");
    assert.equal(sent[0].vt, 12.5, "人看见的那一刻");
    assert.equal(sent[0].cvt, 12.5, "车流也在同一个时刻上——画里只有一个时刻");
    assert.equal(sent[0].n, 3, "走了三格");
  } finally { dom.restore(); }
});
