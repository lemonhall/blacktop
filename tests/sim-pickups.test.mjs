/**
 * 地上的家伙：**捡、抢、甩一地、被回收**。
 *
 * 这一份钉的是"世界的规则"（`sim/pickups.mjs`），不是家伙本身的数值。三条承诺：
 *   - 开局场上有货（三分之一的机器人自带家伙 + 沿路撒六件）；
 *   - **趁对手举着家伙出手的那一下打他，就能抢过来**——这是原版最妙的一条；
 *   - 摔车把腰里那几件全甩到路上，于是"摔了"和"白摔"之间还有一层取舍。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { build } from "./helpers.mjs";
import { attack, wreck } from "../sim/racer.mjs";
import { WEAPONS, giveWeapon, weaponIndex } from "../sim/weapons.mjs";
import {
  MAX_PICKUPS, PICKUP_LIFE, cullPickups, freshItem, placePickup, takePickup,
} from "../sim/pickups.mjs";
import { decodePickups, decodeRacer, encodeSnapshot } from "../sim/wire.mjs";

/** 一局干净的车：腰里空的、地上没存货，位置由测试自己摆。 */
function solo(seed = 7, bots = 2) {
  const w = build({ seed, bots });
  w.racers.forEach(r => { r.belt = []; r.wi = 0; });
  w.pickups.length = 0;
  w.events.length = 0;
  w.countdown = 0;
  return w;
}

function duel(dx = 0.5, dz = 2.0) {
  const w = solo(100, 2);
  const [a, b] = w.racers;
  a.z = 1000; b.z = 1000 + dz;
  a.x = 0; b.x = dx;
  a.v = 30; b.v = 30;
  return { w, a, b };
}

const belt = r => r.belt.map(x => WEAPONS[x.i].id);

test("开局摆阵：每圈沿路撒六件、一部分机器人自带家伙，同种子逐位一致", () => {
  const one = build({ seed: 42, bots: 13 });
  const two = build({ seed: 42, bots: 13 });
  const other = build({ seed: 43, bots: 13 });
  // 三圈就撒十八件：中间那两圈的路上不能光秃秃的（见 `pickups.armTheField`）。
  assert.equal(one.pickups.length, 6 * one.track.laps, "沿路撒的存货");
  for (const p of one.pickups) {
    assert.ok(p.i > 0, "地上躺的必须是一件真家伙，不能是空手");
    assert.ok(p.z > 600 && p.z < one.track.totalLength, "存货落在赛道上，不能撒在起点或终点外");
  }
  const armed = one.racers.filter(r => r.belt.length).length;
  assert.ok(armed > 0, "一个自带家伙的都没有，前半程就没东西可抢了");
  assert.ok(armed < 13, "不该人人有份——空手的人才有抢人的动机");
  assert.deepEqual(one.pickups, two.pickups, "同种子 → 地上的存货逐位一致");
  assert.deepEqual(one.racers.map(belt), two.racers.map(belt), "同种子 → 谁有什么也一致");
  assert.notDeepEqual(
    [one.pickups, one.racers.map(belt)],
    [other.pickups, other.racers.map(belt)],
    "换一颗种子就该换一副局面，否则随机源没接上",
  );
});

test("压过去就捡：远了不捡、腰满了不捡", () => {
  const w = solo(11);
  const a = w.racers[0];
  a.z = 500; a.x = 0.4;
  placePickup(w, freshItem(weaponIndex("club")), 0.6, 500.6);
  placePickup(w, freshItem(weaponIndex("chain")), 0.6, 700);
  assert.equal(w.pickups.length, 2);
  const got = takePickup(w, a);
  assert.ok(got, "压在上面就该捡起来");
  assert.equal(belt(a).join(), "club");
  assert.equal(w.pickups.length, 1, "捡走的那件从地上消失");
  assert.ok(w.events.some(e => e.k === "pick"), "捡起来要有事件（表现层靠它出声）");
  assert.equal(takePickup(w, a), null, "两百米外那件够不着");

  const full = solo(11);
  const b = full.racers[0];
  b.z = 500; b.x = 0;
  for (const id of ["chain", "club", "nunchaku", "crowbar"]) giveWeapon(b, weaponIndex(id));
  placePickup(full, freshItem(weaponIndex("mace")), 0, 500);
  assert.equal(takePickup(full, b), null, "腰里四件，捡不动了");
  assert.equal(full.pickups.length, 1, "留给后面的人");
});

test("摔车把手里的全甩到路上，爬起来还能捡回来", () => {
  const w = solo(13);
  const a = w.racers[0];
  a.z = 800; a.x = 0;
  for (const id of ["chain", "club", "mace"]) giveWeapon(a, weaponIndex(id));
  wreck(w, a, { kind: "crash" });
  assert.equal(a.belt.length, 0, "人车分离的时候，家伙必须脱手");
  assert.equal(w.pickups.length, 3, "三件全在路上");
  assert.equal(w.events.filter(e => e.k === "drop").length, 3, "每一件都要留一条事件");
  const first = w.pickups[0];
  a.state = "ride";
  a.x = first.x; a.z = first.z;
  assert.ok(takePickup(w, a), "压过去就能捡回来");
  assert.equal(a.belt.length, 1);
  assert.equal(w.pickups.length, 2);
});

/**
 * 原版最妙的一条：**他举着家伙出手的那一瞬间打他，东西就是你的了**。
 * 判定里没有随机数——他挥出去的那 0.3 秒就是你的窗口。
 */
test("抢：趁他举着家伙出手的那一下打他，才抢得到", () => {
  const swung = duel();
  giveWeapon(swung.b, weaponIndex("chain"));
  swung.b.swing = 0.2;                        // 他正把铁链甩出来
  attack(swung.w, swung.a, 1);
  assert.deepEqual(belt(swung.a), ["chain"], "抢到手了");
  assert.equal(swung.b.belt.length, 0, "他手里空了");
  const steal = swung.w.events.find(e => e.k === "steal");
  assert.ok(steal, "要留一条 steal 事件：这是最值得播报的一下");
  assert.equal(steal.a, swung.a.id);
  assert.equal(steal.b, swung.b.id);

  const idle = duel();
  giveWeapon(idle.b, weaponIndex("chain"));
  idle.b.swing = 0;                           // 他只是举着，没出手
  attack(idle.w, idle.a, 1);
  assert.equal(idle.a.belt.length, 0, "他没挥，就抢不走");
  assert.equal(idle.b.belt.length, 1, "东西还在他手里");
  assert.ok(!idle.w.events.some(e => e.k === "steal"));
});

test("自己的腰满了：抢不到，那件被拍在对方脚下——谁都能捡", () => {
  const { w, a, b } = duel();
  for (const id of ["chain", "club", "nunchaku", "crowbar"]) giveWeapon(a, weaponIndex(id));
  giveWeapon(b, weaponIndex("mace"));
  b.swing = 0.2;
  const before = w.pickups.length;
  attack(w, a, 1);
  assert.equal(a.belt.length, 4, "接不住就是接不住");
  assert.equal(b.belt.length, 0, "他手里那件照样被拍掉了");
  assert.equal(w.pickups.length, before + 1, "掉在当场，谁压过去谁捡");
  assert.equal(w.events.find(e => e.k === "steal").full, 1, "事件要说清楚：这一下没接住");
});

test("没记忆：落到所有人身后、或者躺太久的，自己消失", () => {
  const w = solo(17);
  placePickup(w, freshItem(weaponIndex("club")), 0, 500);
  placePickup(w, freshItem(weaponIndex("chain")), 0, 1000);
  w.time = 20;
  cullPickups(w, 1000);
  assert.equal(w.pickups.length, 1, "落在最后一台车身后六十米的就被回收了");
  assert.equal(WEAPONS[w.pickups[0].i].id, "chain");
  w.time = 20 + PICKUP_LIFE + 1;
  cullPickups(w, 900);
  assert.equal(w.pickups.length, 0, "躺够久也回收：不维护账本");
});

test("上限：地上一圈最多同时躺十四件，超了丢最老的", () => {
  const w = solo(19);
  // 上限**按圈数放大**（三圈 = 三倍），否则开局撒的三圈货会把第一圈那几件直接挤掉。
  const cap = w.maxPickups || MAX_PICKUPS;
  assert.equal(cap, MAX_PICKUPS * w.track.laps, "上限没有跟着圈数放大");
  for (let i = 0; i < cap + 3; i++) {
    placePickup(w, freshItem(weaponIndex("club")), 0, 100 + i);
  }
  assert.equal(w.pickups.length, cap);
  assert.equal(w.pickups[0].z, 103, "丢掉的是最早那三件");
});

test("线协议往返：地上的和腰里的都还原得回来", () => {
  const w = build({ seed: 55, bots: 3 });
  w.racers.forEach(r => { r.belt = []; r.wi = 0; });
  const a = w.racers[0];
  giveWeapon(a, weaponIndex("chain"));
  giveWeapon(a, weaponIndex("mace"));
  const snap = encodeSnapshot(w, -1);
  assert.equal(snap.pk.length, w.pickups.length, "地上的东西一帧一张，和世界里的数量对得上");
  const ground = decodePickups(snap.pk);
  assert.equal(ground.length, snap.pk.length);
  assert.equal(WEAPONS[ground[0].i].id, snap.pk[0][0], "名字 → 下标要能对回去");
  assert.equal(ground[0].charges, snap.pk[0][3]);
  assert.equal(ground[0].x, snap.pk[0][1]);

  const wireA = snap.r.find(x => x.i === a.id);
  assert.equal(wireA.wp.length, 2);
  assert.equal(wireA.wi, 1);
  const back = decodeRacer(wireA, null);
  assert.deepEqual(belt(back), ["chain", "mace"]);
  assert.equal(back.belt[1].charges, 10, "充能家伙的余量必须过线");
  assert.equal(back.wi, 1);
  // 空手的人**不带 wp**：十五台车每帧各背一个空数组纯属白传。
  assert.ok(snap.r.filter(x => x.i !== a.id).every(x => x.wp === undefined));
  assert.deepEqual(decodeRacer(snap.r.find(x => x.i !== a.id), null).belt, []);
});
