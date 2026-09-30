/**
 * **这一脚先于撞车。**
 *
 * 线上原话：「我去踢车，经常被车撞倒，很不爽。」查下去发现判定本身没错——踹车的
 * 窗口（`traffic.kickTarget`）几何上**完整地盖住**撞车窗口，同一格又是先跑 `attack`
 * 再跑 `collideTraffic`，所以"按得准"从来救得了人。救不了人的是那两条缝：
 *
 *   1. `aimAt` 里**畜生优先于车**：路中间一头牛、车贴着牛后面撞进来的那一格，
 *      那 0.42 秒的窗口被牛用掉了，人照样被车撞下车。
 *   2. 车是**在手挥出去之后**才撞进来的——窗口每格重判一次，但重判的仍是 `aimAt`
 *      那套目标，判定顺序一变，救人的那条路就断了。
 *
 * 所以 `impact.collideTraffic` 里加了一条**直达**的兑现（`kickSave`）：最近一次前打
 * 还在 `TUNE.atkSave` 之内，撞上来的车就按踹飞算。这一份钉住它，也钉住它的边界——
 * 没出手不许开门、过期不许再算、而且它必须**短于冷却**。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DT } from "../sim/constants.mjs";
import { build } from "./helpers.mjs";
import { attack, stepRacer, TUNE } from "../sim/racer.mjs";
import { spawnTraffic } from "../sim/traffic.mjs";

const input = patch => ({ th: 1, br: 0, st: 0, nos: 0, act: 0, ...patch });

/** 一台迎面来的车，摆在玩家前面 `gap` 米（按**车面**算）。 */
function scene(gap) {
  const w = build({ seed: 31, bots: 1, humans: [] });
  const a = w.racers[0];
  w.countdown = 0; w.traffic.length = 0; w.events.length = 0;
  a.x = 0; a.z = 1000; a.v = 40; a.attackCd = 0;
  const car = spawnTraffic(w, a.z + 400, "oncom");
  car.dir = -1; car.x = a.x; car.v = 25;
  car.z = a.z + gap + 2.2;          // `oncom` 车长 4.4 → 近侧车面在 z − 2.2
  return { w, a, car };
}

test("手先挥出去、车后撞进来：算踹飞，不算摔车", () => {
  const { w, a, car } = scene(30);
  assert.equal(attack(w, a, 1), false, "三十米外够不着，这一拳只是挂了个窗口");
  assert.ok(a.atkAt >= 0, "前打必须记下出手时刻——保命窗全靠它");
  car.z = a.z + 2.5;                // 车自己撞进来了，正好落在撞车判定那一格
  stepRacer(w, a, DT, input({}));
  assert.equal(a.state, "ride", "按了就不该摔——这就是'这一脚先于撞车'");
  assert.equal(car.state, "flung", "撞进来的那台车该被踹飞");
  assert.equal(a.crashes, 0);
  assert.equal(a.kills, 1, "踹飞照旧要算在赏金和战绩上");
  assert.equal(a.atk, null, "兑现过的那一拳要收手");
});

test("没出手就撞上去：照样摔。保命窗不会凭空开门", () => {
  const { w, a, car } = scene(30);
  car.z = a.z + 2.5;
  stepRacer(w, a, DT, input({}));
  assert.equal(a.state, "wreck", "没按就是撞车，这条不能松");
  assert.equal(car.state, "run");
});

test("两个窗口都过期之后：撞上来就是撞车", () => {
  const { w, a, car } = scene(30);
  attack(w, a, 1);
  // 一格一格往前走，直到**判定窗和保命窗都用光**（车一直吊在够不着的地方）。
  const ticks = Math.ceil(TUNE.atkWindow / DT) + 2;
  for (let i = 0; i < ticks; i++) {
    car.z = a.z + 400;
    w.time += DT;                   // `stepRacer` 自己不走世界时钟，只有 `stepWorld` 走
    stepRacer(w, a, DT, input({ act: 0 }));
  }
  assert.equal(a.atk, null, "判定窗过期，胳膊收回来了");
  assert.ok(w.time - a.atkAt > TUNE.atkSave, "保命窗也过期了");
  car.z = a.z + 2.5;
  stepRacer(w, a, DT, input({ act: 0 }));
  assert.equal(a.state, "wreck", "过期之后撞上来就是撞车");
});

test("保命窗比冷却短：按住 J 连打也盖不满，车流里不可能横着走", () => {
  assert.ok(TUNE.atkSave < TUNE.attackCd,
    `保命窗 ${TUNE.atkSave}s 不该长过冷却 ${TUNE.attackCd}s`);
  assert.ok(TUNE.atkSave < TUNE.atkWindow,
    "保命窗要比判定窗短一截——判定窗管'还认不认目标'，保命窗只管'别摔'");
});

test("对向车的出脚窗口：几何上两百多毫秒，加上判定窗就过半秒", () => {
  const closing = 45 + 26;          // 一脚踹出去时常见的一对速度（我 + 它）
  const geo = (TUNE.kickReach + TUNE.kickOverlap) / closing;
  assert.ok(geo > 0.2, `纯几何窗口只有 ${(geo * 1000).toFixed(0)} 毫秒`);
  assert.ok(geo + TUNE.atkWindow > 0.55,
    `含判定窗的可按时间只有 ${((geo + TUNE.atkWindow) * 1000).toFixed(0)} 毫秒`);
});

test("同向慢车：相对速度低得多，窗口必须更长（不然超车变成本能恐惧）", () => {
  const closing = 45 - 20;          // 追一台开 20 m/s 的慢车
  const geo = (TUNE.kickReach * TUNE.kickSame + TUNE.kickOverlap) / closing;
  assert.ok(geo + TUNE.atkWindow > 0.4,
    `同向车的可按时间只有 ${((geo + TUNE.atkWindow) * 1000).toFixed(0)} 毫秒`);
});
