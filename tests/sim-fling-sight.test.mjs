/**
 * 踹飞的车**要看得见**。
 *
 * 玩家原话：「我踢车出去，现在确实成功率高了，但是因为车速快，所以车很快地
 * 消失在画面外了，导致被踢出路边的画面来不及看到。」
 *
 * 根因是方向：被踹飞的车原来**顺着它自己原来的方向**继续跑。对向车本来就朝你
 * 冲，被踹了还朝你冲——相对速度 = 你 + 它 ≈ 70 m/s，0.15 秒就滑出画面下缘。
 * 玩家只听见"砰"一声。
 *
 * 现在一律**朝路的正方向**飞、而且比踹它的人还快一截，于是它和玩家同向、一路
 * 领先；横向那一分量收到"够把它推出路面"就停。下面钉三件事：方向、留在画面里
 * 的时长、以及"轻车飞得更野"这条车型差异。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DT } from "../sim/constants.mjs";
import { build } from "./helpers.mjs";
import { stepRacer } from "../sim/racer.mjs";
import { fling, spawnTraffic, stepTraffic } from "../sim/traffic.mjs";

const input = { th: 1, br: 0, st: 0, nos: 0, act: 0 };

/** 迎面来一台车，在"已经贴到脸上"的地方把它踹飞，然后交给调用方逐格推进。 */
function kicked(kind, playerV = 45) {
  const w = build({ seed: 3, bots: 1, humans: [] });
  const a = w.racers[0];
  w.countdown = 0; w.traffic.length = 0; w.events.length = 0;
  a.x = 0; a.z = 1000; a.v = playerV;
  const v = spawnTraffic(w, a.z + 400, kind);
  v.dir = -1; v.x = 0; v.z = a.z + 9; v.v = 26;
  fling(w, v, 1, a.v);
  return { w, a, v };
}

/** 推进 `ticks` 格，返回被踹那台车相对玩家的一路轨迹。 */
function trail({ w, a, v }, ticks) {
  const out = [];
  for (let i = 0; i < ticks; i++) {
    stepRacer(w, a, DT, input);
    stepTraffic(w, DT);
    out.push({ dz: v.z - a.z, dx: v.x - a.x, y: v.y || 0 });
  }
  return out;
}

test("踹飞之后一律朝路的正方向飞，不再顺着它原来那条线跑掉", () => {
  const { v } = kicked("dayun");
  assert.equal(v.dir, 1, "迎面车被踹之后也朝正方向飞——它翻了个个儿，不是若无其事地继续开");
});

test("初速要比踹它的人快一截：慢一点就等于「等着被超越」，半秒后连尾灯都没了", () => {
  const slow = kicked("dayun", 30);
  const fast = kicked("dayun", 50);
  assert.ok(fast.v.v > slow.v.v, "踹得越快，它飞得越快");
  // `0.95` 是 `stepTraffic` 里那条空中速度损耗，乘回来才是它实际跑多快。
  assert.ok(slow.v.v * 0.95 >= 36, `实际 ${(slow.v.v * 0.95).toFixed(1)} m/s，要比 30 快出 6 米/秒才追得上画面`);
});

test("对向大运：踹飞之后整整一秒都还在眼前，没有掉到身后去", () => {
  const shot = kicked("dayun");
  const rows = trail(shot, 60);
  const worst = Math.min(...rows.map(r => r.dz));
  assert.ok(worst > -8, `一秒里它掉到了身后 ${(-worst).toFixed(1)} 米——那半秒的抛物线就白做了`);
  assert.ok(Math.max(...rows.map(r => r.dz)) < 40, "也不能窜到前面没影了");
});

test("横向只给一条车道的量：再多就是半秒横着飞出画面（那不叫踹飞，叫蒸发）", () => {
  const shot = kicked("dayun");
  const rows = trail(shot, 60);
  const dx = Math.abs(rows[rows.length - 1].dx);
  assert.ok(dx > 3.5, `一秒才横移 ${dx.toFixed(1)} 米——看不出是在往路边甩`);
  assert.ok(dx < 9, `一秒横移 ${dx.toFixed(1)} 米——照这个速度，摄像机里它是"唰"地横着飞出去的`);
  for (const r of rows) assert.ok(Number.isFinite(r.dx));
});

test("轻车飞得更野、重车只抬个头：这条差异写死在车型表里", () => {
  const light = trail(kicked("police"), 30);
  const heavy = trail(kicked("dayun"), 30);
  const peak = rows => Math.max(...rows.map(r => r.y));
  assert.ok(peak(light) > peak(heavy) * 1.5, `警车最高 ${peak(light).toFixed(1)}m，大运 ${peak(heavy).toFixed(1)}m`);
  assert.ok(peak(heavy) > 0.5, "大运也得抬起来一点，不能贴着地滑出去");
});

test("飞出去的车不再参与碰撞：它从你头上或身旁过去，不该把你再撞一次", () => {
  const shot = kicked("dayun");
  trail(shot, 60);
  assert.equal(shot.a.state, "ride", "已经踹飞的车不该回头再把人撞下车");
});
