/**
 * 距离灯：**"现在按 J 够不够得着"**，以及"够不着时该往哪边靠"。
 *
 * 这条灯的来历是一组线上实测的数字：人按 51 次 J 命中 4 次，同一个房间的机器人
 * 91%。差别不在手快，在人**不知道自己站在哪**——并排跑在邻道上，画面上两台车贴着，
 * 判定却差一条车道。所以灯要回答两个问题：能不能打、往哪边蹭。
 *
 * 这里钉的头一条不是颜色，而是**灯的答案必须来自 `sim/combat.mjs` 的 `aimAt`**。
 * 两处各写一份窗口，迟早漂成"灯亮着却打空"——那比没有灯更伤，因为它教会玩家
 * 不信任界面。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { rangeLamps } from "../web/js/rangelamp.mjs";
import { TUNE } from "../sim/spec.mjs";
import { LANE_W } from "../sim/constants.mjs";
import { WEAPONS } from "../sim/weapons.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = p => readFileSync(path.join(ROOT, p), "utf8");
const MACE = WEAPONS.findIndex(w => w.id === "mace");
const BELT_MACE = [{ i: MACE, charges: 10 }];

/** 一块只认 id 的假 DOM：业务代码里拿到的就是这么两个字段。 */
function fakeDoc() {
  const nodes = new Map();
  return {
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, { textContent: "", className: "range-chip" });
      return nodes.get(id);
    },
  };
}

const rider = o => ({ id: 7, kind: "human", x: 0, z: 100, v: 30, state: "ride", belt: [], wi: 0, lastHit: -1, ...o });
const car = o => ({ id: 90, kind: "car", x: 0, z: 100, dir: -1, v: 20, state: "run", ...o });

/** 一盏灯的全部状态：写在牌子上的字 + 决定颜色的类名。 */
function lamps({ me, others = [], traffic = [], critters = [] }) {
  const doc = fakeDoc();
  const view = { time: 10, carTime: 10, mine: me, racers: [me, ...others], traffic, critters };
  rangeLamps(view, doc);
  const fwd = doc.getElementById("hudRangeFwd");
  const back = doc.getElementById("hudRangeBack");
  return { fwd: fwd.textContent, back: back.textContent, fwdCls: fwd.className, backCls: back.className };
}

const OFF_FWD = "前 ▶";
const OFF_BACK = "◀ 后";

test("正前方够得着的人：前打那盏亮起来", () => {
  const me = rider({});
  const r = lamps({ me, others: [rider({ id: 8, z: me.z + 2.4 })] });
  assert.equal(r.fwd, "前 ▶ 人");
  assert.match(r.fwdCls, /on man/u);
  assert.equal(r.back, OFF_BACK, "身后没人，回身那盏不该亮");
  assert.equal(r.backCls, "range-chip");
});

test("身后够得着的人：回身那盏亮，前打那盏不亮", () => {
  const me = rider({});
  const r = lamps({ me, others: [rider({ id: 8, z: me.z - 3 })] });
  assert.equal(r.back, "◀ 后 人");
  assert.match(r.backCls, /on man/u);
  assert.equal(r.fwd, OFF_FWD);
});

test("并排跑在邻道：亮的是「靠右／靠左」，不是打不到的死灯", () => {
  const me = rider({});
  const right = lamps({ me, others: [rider({ id: 8, z: me.z + 1, x: me.x + LANE_W })] });
  assert.equal(right.fwd, "前 ▶ 靠右", "邻道有人在前面：告诉玩家往右蹭");
  assert.match(right.fwdCls, /on right/u);

  const left = lamps({ me, others: [rider({ id: 8, z: me.z - 1, x: me.x - LANE_W })] });
  assert.equal(left.back, "◀ 后 靠左");
  assert.match(left.backCls, /on left/u);
});

test("差两条车道就不该再提醒了——那已经不是'蹭一下'的距离", () => {
  const me = rider({});
  const r = lamps({ me, others: [rider({ id: 8, z: me.z + 1, x: me.x + LANE_W * 2 })] });
  assert.equal(r.fwd, OFF_FWD);
});

test("对向车进了踹车窗口：亮「车」", () => {
  const me = rider({});
  const r = lamps({ me, traffic: [car({ z: me.z + 8 })] });
  assert.equal(r.fwd, "前 ▶ 车");
  assert.match(r.fwdCls, /on car/u);
});

test("路中间一头牛：亮「牛」，而且它优先于更远的车", () => {
  const me = rider({});
  const critters = [{ id: 5, kind: "cow", x: me.x, z: me.z + 5, dir: -1, v: 2, state: "walk" }];
  const r = lamps({ me, critters, traffic: [car({ z: me.z + 9 })] });
  assert.equal(r.fwd, "前 ▶ 牛");
  assert.match(r.fwdCls, /on beast/u);
});

test("手里的家伙把窗口拉长：空手够不着的地方，举着流星锤就够得着", () => {
  const me = rider({});
  const rival = rider({ id: 8, z: me.z + TUNE.reachFront + 1.2 });
  assert.equal(lamps({ me, others: [rival] }).fwd, OFF_FWD, "空手：正向窗口之外");
  const armed = rider({ belt: BELT_MACE, wi: 0 });
  assert.equal(lamps({ me: armed, others: [rider({ id: 8, z: armed.z + TUNE.reachFront + 1.2 })] }).fwd, "前 ▶ 人",
    "流星锤多出那两米就是它的全部价值，灯也得认这一条");
});

test("摔在地上的时候两盏都灭：亮着而按下去没反应，是最坏的界面", () => {
  const me = rider({ state: "wreck" });
  const r = lamps({ me, others: [rider({ id: 8, z: me.z + 2 })] });
  assert.equal(r.fwd, OFF_FWD);
  assert.equal(r.back, OFF_BACK);
  assert.equal(r.fwdCls, "range-chip");
});

test("没有画面（还没进赛道）也不许崩", () => {
  const doc = fakeDoc();
  rangeLamps(null, doc);
  assert.equal(doc.getElementById("hudRangeFwd").textContent, OFF_FWD);
  rangeLamps({ time: 1, racers: [], traffic: [], critters: [], mine: null }, doc);
  assert.equal(doc.getElementById("hudRangeBack").textContent, OFF_BACK);
});

test("灯只有一个出处：判定必须来自 `sim/combat.mjs`，不许自己再算一遍窗口", () => {
  const src = read("web/js/rangelamp.mjs");
  assert.match(src, /aimAt/u, "灯的答案是 aimAt 给的");
  assert.match(src, /from "\.\.\/\.\.\/sim\/combat\.mjs"/u, "而且是从共享内核里拿的");
  assert.doesNotMatch(src, /reachX|reachFront|reachBack/u,
    "窗口的数字只能住在一个地方——这里再抄一份，迟早变成'灯亮着却打空'");
});

test("界面与样式都在：两块牌子、一行小字、以及那一族颜色", () => {
  const html = read("web/index.html");
  const css = read("web/styles/hud.css");
  for (const id of ["hudRangeFwd", "hudRangeBack"]) {
    assert.match(html, new RegExp(`id="${id}"`, "u"), `index.html 缺少 #${id}`);
  }
  assert.match(html, /亮＝够得着/u, "灯不说话就等于没做——那行小字不能省");
  for (const cls of [".range-chip", ".range-chip.on.car", ".range-chip.on.man", ".range-chip.on.beast"]) {
    assert.ok(css.includes(cls), `hud.css 缺少 ${cls}`);
  }
  assert.match(read("web/js/hud.mjs"), /rangeLamps\(view\)/u, "HUD 每帧都得喂它一次");
});
