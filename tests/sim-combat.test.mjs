/**
 * 拳头、大运、摔车——这个游戏"暴"的那一半。
 *
 * 每一条都直接对着一条设计承诺：
 *   - 打得准要能把人**撂下车**（而不是只掉点血）；
 *   - 迎面来的**大运可以被一脚踢飞**，而且这是全场唯一的处理方式；
 *   - 摔车**痛但不致命**：躺两秒、从低速爬起来接着打。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DT, KMH } from "../sim/constants.mjs";
import { build } from "./helpers.mjs";
import { attack, stepRacer, wreck, TUNE } from "../sim/racer.mjs";
import { fling, kickTarget, spawnTraffic, stepTraffic } from "../sim/traffic.mjs";

/** 把两个车手摆成并排，然后让左边那个出拳。 */
function duel(dx = 1.0, dz = 0.5) {
  const w = build({ seed: 100, bots: 2, humans: [] });
  const [a, b] = w.racers;
  a.z = 1000; b.z = 1000 + dz;
  a.x = 0; b.x = dx;
  a.v = 30; b.v = 30;
  w.countdown = 0;
  return { w, a, b };
}

/** 一组完整的入力。`st` 不能缺——缺了会让 `stepRacer` 算出 NaN 的横向位置。 */
const input = patch => ({ th: 0, br: 0, st: 0, nos: 0, act: 0, ...patch });

test("拳头会掉血、会把对手推向一边、并且有冷却", () => {
  const { w, a, b } = duel();
  const before = b.stamina;
  assert.equal(attack(w, a), true, "并排的人应该能打到");
  assert.ok(b.stamina < before, "被打的人掉了体力");
  assert.ok(a.attackCd > 0, "出过手就要进冷却");
  assert.equal(attack(w, a), false, "冷却里再按也没有第二拳");
  assert.ok(w.events.some(e => e.k === "hit"), "打中要留下事件（表现层靠它做打击感）");
});

test("体力打空 → 人被撂下车（这是唯一的'击倒'途径）", () => {
  const { w, a, b } = duel();
  let guard = 0;
  while (b.state === "ride" && guard++ < 200) {
    a.attackCd = 0;
    b.lastHit = -99;
    attack(w, a);
  }
  assert.equal(b.state, "wreck", "打够次数就该倒");
  assert.equal(b.wreckKind, "down");
  assert.equal(a.downs, 1, "撂倒计数记在出手的人身上");
});

test("摔车是幂等的：同一帧里撞车和挨打同时发生也只摔一次", () => {
  const { w, a } = duel();
  assert.equal(wreck(w, a, { kind: "crash" }), true);
  assert.equal(wreck(w, a, { kind: "down", by: 9 }), false, "第二次不生效");
  assert.equal(a.crashes, 1);
});

/**
 * 攻击和原版一样**只有一拳，区别在方向**：`J` 打身前、`K` 回身打身后。
 * 下面这组测试钉的就是"方向"这一维——它是这一套打法的全部。
 */
test("前打只打身前：身后的人够不着，回身打才够得着", () => {
  const { w, a, b } = duel(0.5, -2.4);
  assert.equal(attack(w, a, 1), false, "正前方那一拳够不到身后两米四的人");
  assert.ok(w.events.some(e => e.k === "whiff"), "打不到就是挥空");
  assert.equal(b.stamina, 100, "挥空不该掉别人的体力");
  a.attackCd = 0;
  assert.equal(attack(w, a, -1), true, "回身那一拳打得着");
  assert.ok(b.stamina < 100, "身后的人掉了体力");
  const hit = w.events.find(e => e.k === "hit" && e.b === b.id);
  assert.ok(hit, "要留下一条 hit 事件");
  assert.equal(hit.dir, -1, "事件里带得起手方向，表现层与回放都靠它");
});

test("回身打比前打轻：够得着的人少、伤害也低（回头出手本来就别扭）", () => {
  const front = duel(0.5, 2.2);
  attack(front.w, front.a, 1);
  const back = duel(0.5, -2.2);
  attack(back.w, back.a, -1);
  const df = front.w.events.find(e => e.k === "hit").d;
  const db = back.w.events.find(e => e.k === "hit").d;
  assert.ok(db < df, `回身打 ${db} 应该轻于前打 ${df}`);
});

test("并排那半米两边都够得着（否则贴在一起就成了脸对脸打不着）", () => {
  const f = duel(0.5, 0.3);
  const b = duel(0.5, 0.3);
  assert.equal(attack(f.w, f.a, 1), true, "前打：正好并排也打得到");
  assert.equal(attack(b.w, b.a, -1), true, "回身打：正好并排也打得到");
});

test("大运只能被前打踢飞：回头一脚踢不到（否则'什么时候回头'就没有代价了）", () => {
  const w = build({ seed: 21, bots: 1, humans: [] });
  const a = w.racers[0];
  a.x = 0; a.z = 1000; a.v = 30;
  const truck = spawnTraffic(w, a.z + 100, "dayun");
  // 摆成"迎面开过来、车头离我还有将近十米"——这正是判定的判据所在：量的是**车面**，
  // 不是车身中心。旧写法把车放在六米外，对一台 16.5 米的半挂来说那已经在它肚子里了。
  truck.dir = -1; truck.x = a.x; truck.z = a.z + 18; truck.v = 26;
  assert.ok(kickTarget(w, a), "对向大运确实在出脚窗口里");
  assert.equal(attack(w, a, -1), false, "回身打踢不到它");
  assert.equal(truck.state, "run", "大运还在路上");
  a.attackCd = 0;
  assert.equal(attack(w, a, 1), true, "换成前打就踢得飞");
  assert.equal(truck.state, "flung");
});

test("上行位掩码：bit1 是前打、bit2 是回身打，两个都按一帧也只挥一次", () => {
  const one = duel(0.5, -2.2);
  stepRacer(one.w, one.a, DT, input({ act: 2 }));
  assert.ok(one.b.stamina < 100, "bit2 打的是身后的人");

  // 两个位同时按着（真有人会这么干）：共用同一个冷却，一帧只挥一次，向前优先。
  const both = duel(0.5, 2.2);
  stepRacer(both.w, both.a, DT, input({ act: 3 }));
  const swings = both.w.events.filter(e => e.k === "hit" || e.k === "whiff");
  assert.equal(swings.length, 1, "一帧只挥一次");
  assert.equal(swings[0].dir, 1, "同时按下时，向前那一拳优先");
  assert.ok(both.a.attackCd > 0);
});

test("摔车后两秒爬起来，带着一点滚动速度（否则从零起步就是死刑）", () => {
  const { w, a } = duel();
  wreck(w, a, { kind: "crash" });
  for (let i = 0; i < Math.ceil((TUNE.wreck + 0.05) / DT); i++) stepRacer(w, a, DT, {});
  assert.equal(a.state, "ride");
  assert.ok(a.v > 0, "爬起来必须带速度");
  assert.ok(a.stamina > TUNE.recover - 1, "体力回到一个能动弹的水平");
});

test("迎面来的大运可以被踢飞：加钱、回体力、大运飞出去", () => {
  const { w, a } = duel();
  a.x = 0;
  const truck = spawnTraffic(w, a.z + 100, "dayun");
  assert.equal(truck.kind, "dayun");
  truck.dir = -1; truck.x = 0; truck.z = a.z + 18; truck.v = 26;
  assert.ok(kickTarget(w, a), "车头还在八米外的对向大运应该进入出脚窗口");
  const cash = a.cash, st = a.stamina - TUNE.attackCost;
  a.attackCd = 0;
  assert.equal(attack(w, a), true);
  assert.equal(truck.state, "flung", "大运被踢飞了");
  assert.ok(a.cash > cash, "踢飞要给钱");
  assert.ok(a.stamina > st, "踢飞要回一口气——不然这一脚没人愿意踢");
  assert.equal(a.kills, 1);
});

test("踢飞的大运会抛物线飞出去，两秒半之后消失", () => {
  const w = build({ seed: 5, bots: 1, humans: [] });
  const truck = spawnTraffic(w, 50, "dayun");
  const z0 = truck.z;
  assert.equal(fling(w, truck, 1), true);
  assert.equal(fling(w, truck, 1), false, "已经飞起来的不再吃第二脚");
  for (let i = 0; i < 200; i++) stepTraffic(w, DT);
  assert.notEqual(truck.z, z0, "它在飞");
  assert.ok(truck.spin > 0, "它在转");
  assert.ok(!w.traffic.includes(truck), "两秒半之后从世界里消失");
});

test("撞上对向车比追尾更疼：这是速度差，不是随机数", () => {
  const rear = build({ seed: 11, bots: 1, humans: [] });
  const head = build({ seed: 11, bots: 1, humans: [] });
  const ra = rear.racers[0], rh = head.racers[0];
  ra.z = 500; rh.z = 500;
  const carA = spawnTraffic(rear, 400, "car");
  carA.dir = 1; carA.x = ra.x; carA.z = ra.z + 1; carA.v = 20;
  const carB = spawnTraffic(head, 400, "oncom");
  carB.dir = -1; carB.x = rh.x; carB.z = rh.z + 1; carB.v = 22;
  rear.countdown = 0; head.countdown = 0;
  stepRacer(rear, ra, DT, { th: 1 });
  stepRacer(head, rh, DT, { th: 1 });
  assert.equal(ra.state, "wreck");
  assert.equal(rh.state, "wreck");
  assert.equal(ra.wreckKind, "rear");
  assert.equal(rh.wreckKind, "headon");
  assert.ok(rh.wreck >= TUNE.wreckHeavy, "对撞要按重摔处理");
  assert.ok(rh.v * KMH < ra.v * KMH + 1, "对撞之后速度掉得更狠");
});
