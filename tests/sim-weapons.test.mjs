/**
 * 家伙（照 1996 那版）：**八种、能攒、有的会打完**。
 *
 * 这一份钉的是"数据这一层"——表、腰、耐久，以及"手里那件如何改变那一拳"。
 * 地上的东西与"抢"在另一份（`sim-pickups.test.mjs`），因为那是世界的规则，
 * 不是家伙的规则。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DT } from "../sim/constants.mjs";
import { build } from "./helpers.mjs";
import { attack, stepRacer, TUNE } from "../sim/racer.mjs";
import {
  BARE, MAX_BELT, WEAPONS, cycleWeapon, giveWeapon, heldWeapon,
  spendCharge, statsOf, takeHeld, weaponIndex,
} from "../sim/weapons.mjs";

const idOfBelt = (r, at = r.wi | 0) => WEAPONS[r.belt[at].i].id;

/** 一局干净的车：腰里空的、地上没存货、位置由测试自己摆。 */
function solo(seed = 7, bots = 2) {
  const w = build({ seed, bots });
  w.racers.forEach(r => { r.belt = []; r.wi = 0; });
  w.pickups.length = 0;
  w.events.length = 0;
  w.countdown = 0;
  return w;
}

/** 两台并排的车，摆好距离，让左边那个出手。 */
function duel(dx = 0.5, dz = 0.5) {
  const w = solo(100, 2);
  const [a, b] = w.racers;
  a.z = 1000; b.z = 1000 + dz;
  a.x = 0; b.x = dx;
  a.v = 30; b.v = 30;
  return { w, a, b };
}

const input = patch => ({ th: 0, br: 0, st: 0, nos: 0, act: 0, ...patch });
const dmgOf = w => w.events.find(e => e.k === "hit").d;

test("表：八行、名字不重复、只有三件是充能的（各十次）", () => {
  assert.equal(WEAPONS.length, 8, "空手 + 七件 = 八行");
  assert.equal(WEAPONS[0], BARE, "0 号必须是空手：所有'没有家伙'的分支都读它");
  assert.equal(new Set(WEAPONS.map(w => w.id)).size, 8, "id 不能重");
  const charged = WEAPONS.filter(w => w.charges > 0).map(w => w.id).sort();
  assert.deepEqual(charged, ["mace", "oilcan", "prod"], "只有流星锤 / 电棍 / 油桶会打完");
  for (const w of WEAPONS) {
    if (w.charges > 0) assert.equal(w.charges, 10, `${w.id} 该是十次`);
    assert.ok(w.name && w.en, `${w.id} 要有中英文名字`);
  }
  assert.equal(BARE.charges, 0, "空手永远用不完");
});

test("表里的三个'差异'必须真的成立：够得远、打得疼、挥得慢", () => {
  assert.ok(WEAPONS[weaponIndex("mace")].reach > WEAPONS[weaponIndex("chain")].reach, "流星锤最长");
  assert.ok(WEAPONS[weaponIndex("crowbar")].dmg > BARE.dmg, "撬棍比拳头疼");
  assert.ok(WEAPONS[weaponIndex("mace")].dmg > WEAPONS[weaponIndex("crowbar")].dmg, "流星锤最疼");
  assert.ok(WEAPONS[weaponIndex("nunchaku")].cd < BARE.cd, "双节棍比拳头快");
  assert.ok(WEAPONS[weaponIndex("oilcan")].pull > WEAPONS[weaponIndex("crowbar")].pull, "油桶推得最狠");
});

test("名字 ↔ 下标：认名字、认数字，认不出来的都落回空手", () => {
  assert.equal(weaponIndex("chain"), 3);
  assert.equal(weaponIndex(3), 3, "数字直接过");
  assert.equal(weaponIndex("bazooka"), 0, "没见过的东西按空手处理，而不是 undefined");
  assert.equal(weaponIndex(-1), 0);
  assert.equal(weaponIndex(99), 0);
  assert.equal(weaponIndex(undefined), 0);
});

test("捡到手就举起来；腰里最多四件；空手不是一件东西", () => {
  const w = solo();
  const a = w.racers[0];
  assert.equal(giveWeapon(a, 0), false, "0 号是空手，捡不了");
  assert.equal(giveWeapon(a, weaponIndex("chain")), true);
  assert.equal(heldWeapon(a).i, weaponIndex("chain"), "新到手的就该举在手里，不用再按一下");
  for (const id of ["club", "nunchaku", "crowbar"]) assert.equal(giveWeapon(a, weaponIndex(id)), true);
  assert.equal(a.belt.length, MAX_BELT);
  assert.equal(giveWeapon(a, weaponIndex("mace")), false, "满了就是满了");
  assert.equal(a.belt.length, MAX_BELT, "被拒绝的那件不能悄悄挤进来");
});

test("轮换：一件时按了也没反应，三件时转一圈回到原处", () => {
  const w = solo();
  const a = w.racers[0];
  giveWeapon(a, weaponIndex("chain"));
  assert.equal(cycleWeapon(a, 1), false, "只有一件，没什么可换");
  for (const id of ["club", "nunchaku"]) giveWeapon(a, weaponIndex(id));
  assert.equal(idOfBelt(a), "nunchaku", "最后捡到的那件举在手里");
  assert.equal(cycleWeapon(a, 1), true);
  assert.equal(idOfBelt(a), "chain", "绕回第一件");
  cycleWeapon(a, 1); cycleWeapon(a, 1); cycleWeapon(a, 1);
  assert.equal(idOfBelt(a), "chain", "转三下就是一圈");
  cycleWeapon(a, -1);
  assert.equal(idOfBelt(a), "nunchaku", "往回也能转");
});

test("摘下来的必须是手里那一件，摘完手里的指针还得合法", () => {
  const w = solo();
  const a = w.racers[0];
  for (const id of ["chain", "club", "nunchaku"]) giveWeapon(a, weaponIndex(id));
  a.wi = 0;                                   // 手动指到铁链上
  assert.equal(WEAPONS[takeHeld(a).i].id, "chain");
  assert.ok(a.wi >= 0 && a.wi < a.belt.length, "wi 不能指到腰外面去");
  assert.equal(a.belt.length, 2);
  takeHeld(a); takeHeld(a);
  assert.equal(takeHeld(a), null, "空了就是 null，不是 undefined");
  assert.equal(a.wi, 0);
});

test("充能：流星锤打十下就没了，用光那一下要把丢掉的那一行还回来", () => {
  const w = solo();
  const a = w.racers[0];
  giveWeapon(a, weaponIndex("mace"));
  assert.equal(a.belt[0].charges, 10);
  for (let i = 0; i < 9; i++) {
    assert.equal(spendCharge(a), null, `第 ${i + 1} 下还有余量`);
  }
  assert.equal(a.belt[0].charges, 1, "打到第九下还剩一次");
  const last = spendCharge(a);
  assert.ok(last && last.id === "mace", "用光那一下要返回那一行（表现层靠它喊一声）");
  assert.equal(a.belt.length, 0, "用光当场丢");
  assert.equal(spendCharge(a), null, "手里已经没有了，再挥也扣不出东西");
});

test("用不完的家伙永远扣不了：棍棒挥一百下也还在手里", () => {
  const w = solo();
  const a = w.racers[0];
  giveWeapon(a, weaponIndex("club"));
  for (let i = 0; i < 100; i++) assert.equal(spendCharge(a), null);
  assert.equal(a.belt.length, 1);
  assert.equal(heldWeapon(a).charges, 0, "0 是'无限'，不是'没了'");
});

test("空手也有一行数值：`statsOf`/`heldWeapon` 不返回 undefined", () => {
  const w = solo();
  const a = w.racers[0];
  assert.equal(heldWeapon(a), null);
  assert.equal(statsOf(a), BARE, "空手不是分支，是表里的第 0 行");
  giveWeapon(a, weaponIndex("prod"));
  assert.equal(statsOf(a).id, "prod");
});

test("够得多远来自那一列：空手够不着的地方，铁链够得着", () => {
  // 距离由 `TUNE.reachFront` 推出来，不写死：这条测试的判据是"窗口随家伙变长"，
  // 不是"窗口恰好是四米六"。两个距离分别落在空手窗口外、铁链窗口内。
  const far = TUNE.reachFront + 0.8;
  const far2 = TUNE.reachFront + 1.6;
  const bare = duel(0.5, far);
  assert.equal(attack(bare.w, bare.a, 1), false, "空手够不着那一段");
  assert.ok(bare.w.events.some(e => e.k === "whiff"));

  const chain = duel(0.5, far);
  giveWeapon(chain.a, weaponIndex("chain"));
  assert.equal(attack(chain.w, chain.a, 1), true, "换成铁链就够得着了");
  assert.ok(chain.b.stamina < 100);

  const mace = duel(0.5, far2);
  giveWeapon(mace.a, weaponIndex("mace"));
  assert.equal(attack(mace.w, mace.a, 1), true, "流星锤比铁链还远一截");
});

test("手里那件决定那一拳有多疼、下一拳有多慢", () => {
  const bare = duel(); const chain = duel(); const mace = duel();
  attack(bare.w, bare.a, 1);
  giveWeapon(chain.a, weaponIndex("chain")); attack(chain.w, chain.a, 1);
  giveWeapon(mace.a, weaponIndex("mace")); attack(mace.w, mace.a, 1);
  assert.ok(dmgOf(chain.w) > dmgOf(bare.w), "铁链比拳头疼");
  assert.ok(dmgOf(mace.w) > dmgOf(chain.w), "流星锤比铁链疼");
  assert.ok(mace.a.attackCd > bare.a.attackCd, "重家伙挥得慢");
  assert.equal(bare.a.attackCd, TUNE.attackCd * BARE.cd, "冷却就是表里那一列乘出来的");
  assert.equal(mace.w.events.find(e => e.k === "hit").w, "mace", "事件里带得起手里那件（表现层靠它）");
});

test("Q 换家伙：bit4 让腰里的牌子往前走一格", () => {
  const w = solo();
  const a = w.racers[0];
  giveWeapon(a, weaponIndex("chain"));
  giveWeapon(a, weaponIndex("crowbar"));
  assert.equal(idOfBelt(a), "crowbar", "先摆清楚：手里是撬棍");
  stepRacer(w, a, DT, input({ act: 4 }));
  assert.equal(idOfBelt(a), "chain", "按一下换到铁链");
  assert.equal(a.attackCd, 0, "换家伙不是挥拳，不该进冷却");
  stepRacer(w, a, DT, input({ act: 4 }));
  assert.equal(idOfBelt(a), "crowbar", "再按一下换回来");
});

test("换家伙发生在挥拳之前：同一帧按 bit4+bit1，挥出去的是换好那一件", () => {
  const { w, a } = duel(0.5, 2.2);
  giveWeapon(a, weaponIndex("chain"));
  giveWeapon(a, weaponIndex("crowbar"));     // 手里先举着撬棍
  stepRacer(w, a, DT, input({ act: 5 }));    // 换到铁链，然后用铁链打
  const hit = w.events.find(e => e.k === "hit");
  assert.ok(hit, "这一下要真的打出去");
  assert.equal(hit.w, "chain", "先换再打——不然那一格就白挥了");
});
