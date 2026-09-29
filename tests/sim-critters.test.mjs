/**
 * 路上的畜生（彩蛋，但吃碰撞、给赏金）。
 *
 * 这批测试守的是它作为"彩蛋"的三条边界，因为这三条一旦破了，它就从彩蛋变成 bug：
 *   1. **确定性**：动物由 (匹配种子, 槽位号) 完全决定，而且**不动世界那颗随机源**。
 *      上一版从同一颗流里抽签，加一批牛就把每一辆车的生成顺序推后一格，
 *      "我今天怎么老撞车"立刻变成没法复现的玄学。
 *   2. **单向横穿**：它从一边走到另一边就收工，不是永动机一样来回过马路。
 *   3. **两条处理方式**：低速撞上只是晃一下（软），上了速度就是摔车；而一脚踹飞
 *      它走的是和车流一模一样的抛物线。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DT } from "../sim/constants.mjs";
import { build, seconds } from "./helpers.mjs";
import { attack, stepRacer } from "../sim/racer.mjs";
import { stepWorld } from "../sim/step.mjs";
import { decodeCritters, encodeSnapshot } from "../sim/wire.mjs";
import {
  CRITTERS, CRITTERS_BY_MODE, critterTarget, flingCritter,
  hitCritter, spawnCritters, stepCritters,
} from "../sim/critters.mjs";

const shape = w => w.critters.map(c => [c.kind, Math.round(c.z * 100), c.side, Math.round(c.v * 100)]);

/** 造一个只有畜生、没有车流的世界：车流会把"这一脚踹的是谁"搅浑。 */
function pen(seed = 313, mode = "wild") {
  const w = build({ seed, mode, bots: 1, humans: [] });
  w.traffic.length = 0;
  return w;
}

test("同一个种子生出同一批动物，换了种子就是另一批", () => {
  const a = pen(313), b = pen(313), c = pen(314);
  spawnCritters(a, 2000);
  spawnCritters(b, 2000);
  spawnCritters(c, 2000);
  assert.ok(a.critters.length > 0, "两千米的路上居然一头动物都没有");
  assert.deepEqual(shape(a), shape(b), "同一个种子生出了两批不同的动物");
  assert.notDeepEqual(shape(a), shape(c), "换了种子还是同一批动物");
});

test("生成动物不动世界那颗随机源——车流序列一位都不能被推后", () => {
  const w = pen(313);
  const before = w.seed;
  spawnCritters(w, 2000);
  assert.equal(w.seed, before,
    "动物是从世界那颗 LCG 里抽的签：加一种动物就会把每一辆车的生成顺序推后一格");
});

test("每条路上的动物来自那条路自己的表：城市里没有牛", () => {
  for (const mode of Object.keys(CRITTERS_BY_MODE)) {
    const w = pen(88, mode);
    spawnCritters(w, 4000);
    const allowed = new Set(CRITTERS_BY_MODE[mode]);
    for (const c of w.critters) {
      assert.ok(allowed.has(c.kind), `${mode} 路上跑出了一头 ${c.kind}`);
      assert.ok(CRITTERS[c.kind], `${c.kind} 不在动物表里，画不出来也撞不出东西`);
    }
  }
  assert.ok(!CRITTERS_BY_MODE.city.includes("cow"), "城市里不该有牛");
});

test("一头动物从一边走到另一边就收工，不会永动机一样来回过马路", () => {
  const w = pen(9);
  const info = CRITTERS.cow;
  w.critters = [{
    id: 1, kind: "cow", z: 900, side: -1, x: -(w.track.halfWidth + 2.4),
    dir: 1, v: info.speed, t: 0, state: "walk",
  }];
  const x0 = w.critters[0].x;
  for (let i = 0; i < seconds(20); i++) stepCritters(w, DT);
  assert.equal(w.critters.length, 0, "它穿过整条路之后还站在原地");
  assert.ok(x0 < 0, "它该是从左边出发的");
});

test("撞上它之前得先够得着：路边草丛里的那头牛不算撞上", () => {
  const w = pen(4);
  const r = w.racers[0];
  r.z = 900; r.x = 0;
  w.critters = [{ id: 1, kind: "cow", z: 900, side: -1, x: -9, dir: 1, v: 1.5, t: 0, state: "walk" }];
  assert.equal(hitCritter(w, r), null, "九米外的牛不该算撞上");
  w.critters[0].x = 0.3;
  assert.ok(hitCritter(w, r), "压在车头前的那头牛必须算撞上");
});

test("低速撞上只是晃一下；上了速度就是当年那个结局", () => {
  const soft = pen(11);
  const a = soft.racers[0];
  a.z = 900; a.x = 0; a.v = 5; a.hitCd = 0; soft.countdown = 0;
  soft.critters = [{ id: 1, kind: "cow", z: 900, x: 0, side: -1, dir: 1, v: 1.5, t: 0, state: "walk" }];
  stepRacer(soft, a, DT, { th: 1 });
  assert.equal(a.state, "ride", "二十公里不到就撞死，这一条路上没法骑车了");
  assert.ok(soft.events.some(e => e.k === "moo" && e.soft), "低速撞上要推一条软事件");
  assert.ok(a.v < 5, "撞上总得掉点速");

  const hard = pen(11);
  const b = hard.racers[0];
  b.z = 900; b.x = 0; b.v = 30; b.hitCd = 0; hard.countdown = 0;
  hard.critters = [{ id: 1, kind: "cow", z: 900, x: 0, side: -1, dir: 1, v: 1.5, t: 0, state: "walk" }];
  stepRacer(hard, b, DT, { th: 1 });
  assert.equal(b.state, "wreck", "一百公里撞上一头牛，必须摔");
  assert.equal(b.wreckKind, "critter");
  assert.ok(hard.events.some(e => e.k === "moo" && !e.soft));
});

test("一脚踹牛：加钱、加 kill、推一条 beast 事件，牛进了抛物线", () => {
  const w = pen(21);
  const r = w.racers[0];
  r.z = 900; r.x = 0; r.v = 30; r.attackCd = 0;
  w.critters = [{ id: 1, kind: "cow", z: 903, x: 0.5, side: -1, dir: 1, v: 1.5, t: 0, state: "walk" }];
  const beast = critterTarget(w, r);
  assert.ok(beast, "三米外的牛明明在出脚窗口里");
  const cash = r.cash;
  assert.equal(attack(w, r, 1), true);
  assert.equal(beast.state, "flung");
  assert.equal(r.kills, 1);
  assert.equal(r.cash - cash, CRITTERS.cow.cash);
  const ev = w.events.find(e => e.k === "beast");
  assert.ok(ev, "踹飞畜生要有自己的一条事件（表现层的文案与音效全靠它）");
  assert.equal(ev.n, "牛");
  assert.equal(ev.pay, CRITTERS.cow.cash);
});

test("回身踹不到畜生：踹飞的那一下只有前打", () => {
  const w = pen(22);
  const r = w.racers[0];
  r.z = 900; r.x = 0; r.v = 30; r.attackCd = 0;
  w.critters = [{ id: 1, kind: "cow", z: 903, x: 0.5, side: -1, dir: 1, v: 1.5, t: 0, state: "walk" }];
  assert.equal(attack(w, r, -1), false, "回身那一脚够不到身前的牛");
  assert.equal(w.critters[0].state, "walk");
});

test("被踹飞的畜生摔在地上就不见了，不会一路跟着你", () => {
  const w = pen(31);
  const c = { id: 1, kind: "sheep", z: 900, x: 0, side: -1, dir: 1, v: 1.8, t: 0, state: "walk" };
  assert.equal(flingCritter(w, c, 1), true);
  assert.equal(flingCritter(w, c, 1), false, "已经飞起来的不能再踹一脚");
  for (let i = 0; i < seconds(8); i++) stepCritters(w, DT);
  assert.ok(!w.critters.includes(c), "摔在地上的羊该被收走");
});

test("整局跑下来：动物活在世界上最远那台车的视野里，而且进得了快照", () => {
  const w = build({ seed: 4242, mode: "wild", bots: 4, humans: [] });
  w.countdown = 0;
  let sawCritter = false;
  for (let i = 0; i < seconds(30); i++) {
    stepWorld(w, DT);
    w.events.length = 0;
    if (w.critters.length) sawCritter = true;
  }
  assert.ok(sawCritter, "荒野路上跑了半分钟，一头畜生都没出现过");
  // 一头牛横穿马路这件事如果只在服务端成立，玩家就会在画面上"凭空撞到空气"——
  // 所以它必须跟着快照走，而且解码出来还得能画。
  const snap = encodeSnapshot(w, w.racers[0].id);
  assert.ok(Array.isArray(snap.cr), "快照里没有畜生那一段");
  const lead = Math.max(...w.racers.map(r => r.z));
  for (const c of w.critters) {
    assert.ok(Math.abs(c.z - lead) < 600, `一头 ${c.kind} 跑到了 ${(c.z - lead).toFixed(0)} 米外还活着`);
  }
  for (const c of decodeCritters(snap.cr)) {
    assert.ok(CRITTERS[c.kind], `解码出了一种画不出来的动物：${c.kind}`);
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.z));
  }
});
