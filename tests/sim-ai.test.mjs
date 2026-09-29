/**
 * 机器人：不要求它像人一样聪明，但要求它**不像一台失控的碰碰车**。
 *
 * 这几条是从真实事故反推出来的：第一版机器人不躲对向车，于是一场比赛平均
 * 追尾 17 次；第二版会躲了，但只在"已经对准"的时候反应，撞车率只降了一点点。
 * 现在的判据是"提前并线"，所以这里测的是**提前量**：给它 1.5 秒，它得挪开。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DT } from "../sim/constants.mjs";
import { build, run, seconds } from "./helpers.mjs";
import { aiInput, lookaheadOf, makeBrain } from "../sim/ai.mjs";
import { spawnTraffic, stepTraffic } from "../sim/traffic.mjs";
import { stepRacer } from "../sim/racer.mjs";

/** 把一台机器人放到路上，速度拉起来，返回它和世界。 */
function solo(seed = 3) {
  const w = build({ seed, bots: 1, humans: [] });
  const r = w.racers[0];
  r.x = 0; r.z = 1000; r.v = 42;
  r.brain = makeBrain(w, r);
  w.countdown = 0;
  return { w, r };
}

/** 推进 n 秒，餵机器人自己算出来的输入。 */
function roll(w, r, secondsN) {
  const n = Math.round(secondsN / DT);
  for (let i = 0; i < n; i++) {
    stepRacer(w, r, DT, aiInput(w, r, DT));
    stepTraffic(w, DT);
  }
}

test("机器人骑在路上，不会骑出去", () => {
  const { w, r } = solo(4);
  for (let i = 0; i < 120; i++) {
    roll(w, r, 1);
    assert.ok(Math.abs(r.x) <= w.track.limitX + 1e-6, `第 ${i} 秒骑到了 ${r.x.toFixed(2)}`);
    r.z += 30; // 让它在一条不断变弯的长路上一直跑下去
    if (r.state === "wreck") r.state = "ride";
  }
});

test("正前方有车 → 提前并线（而不是贴上去再闪）", () => {
  const { w, r } = solo(5);
  const car = spawnTraffic(w, r.z + 500, "car");
  car.dir = 1; car.v = 18; car.z = r.z + 26; car.x = r.x; car.lane = 1;
  const x0 = r.x;
  for (let i = 0; i < Math.round(1.5 / DT); i++) {
    stepRacer(w, r, DT, aiInput(w, r, DT));
    car.z += car.v * DT;
  }
  assert.equal(r.state, "ride", "1.5 秒的准备时间足够并线，不该撞上");
  assert.ok(Math.abs(r.x - x0) > 1.0, `横向只挪了 ${Math.abs(r.x - x0).toFixed(2)} 米，等于没躲`);
});

test("迎面来的大运也算威胁（这是第一版最大的漏洞）", () => {
  const { w, r } = solo(6);
  const truck = spawnTraffic(w, r.z + 500, "dayun");
  truck.dir = -1; truck.v = 27; truck.z = r.z + 55; truck.x = r.x;
  const threat = lookaheadOf(w, r, 2.5);
  assert.ok(threat, "对向的大运必须进入视野");
  assert.ok(threat.tti < 2.5, "而且要给得出'还有几秒'");
});

test("被逼到没路走时会刹车，而不是硬顶上去", () => {
  const { w, r } = solo(7);
  const car = spawnTraffic(w, r.z + 500, "truck");
  car.dir = 1; car.v = 8; car.z = r.z + 7; car.x = r.x;
  let braked = false;
  for (let i = 0; i < Math.round(1.2 / DT); i++) {
    const input = aiInput(w, r, DT);
    if (input.br) braked = true;
    stepRacer(w, r, DT, input);
    car.z += car.v * DT;
    if (r.state === "wreck") break;
  }
  assert.ok(braked, "这么近的距离还不踩刹车，那就是在自杀");
});

test("十三台机器人跑一整场：追尾次数必须被压住", () => {
  const w = build({ seed: 4211 });
  const kinds = {};
  run(w, seconds(150), world => {
    for (const e of world.events) if (e.k === "wreck") kinds[e.s] = (kinds[e.s] || 0) + 1;
  });
  const rear = kinds.rear || 0;
  assert.ok(rear / w.racers.length < 3, `平均每台车追尾 ${(rear / w.racers.length).toFixed(2)} 次`);
});

test("身后贴着人时机器人会回身打（act 的 bit2 真的在用，不是摆设）", () => {
  const w = build({ seed: 13, bots: 2, humans: [] });
  const [r, o] = w.racers;
  r.x = 0; r.z = 1000; r.v = 42;
  r.brain = makeBrain(w, r);
  w.countdown = 0;
  let back = false;
  for (let i = 0; i < Math.round(8 / DT) && !back; i++) {
    // 把那台车一直钉在身后一点六米处：我们要测的是"机器人会不会回头打"，
    // 不是"这两台车谁会先骑走"。顺手把它治满，免得被揍下车导致后面没人可打。
    o.z = r.z - 1.6; o.x = r.x + 0.3; o.v = r.v; o.stamina = 100;
    const input = aiInput(w, r, DT);
    if (input.act & 2) back = true;
    stepRacer(w, r, DT, input);
    stepTraffic(w, DT);
  }
  assert.ok(back, "身后有人时机器人该回头打");
});
