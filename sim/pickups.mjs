/**
 * 地上的家伙：被打掉的、被抢剩的、摔车甩出去的那些。
 *
 * 它们是**世界的一部分**，不是谁的私人掉落——谁压过去谁捡走，人机一视同仁。
 * 这一层同时是"打到一半手里空了"唯一的补给线：原版靠抢，我们额外给了一条
 * **捡**的路子，否则一个空手的人被十三个拿家伙的围住就只剩挨打。
 *
 * 三条约束：
 *   1. **确定性**：掉落只吃位置与时间，不看随机数。同一颗种子的两场比赛完全一致。
 *   2. **没有记忆**：在地上的东西过了 90 秒或者落到所有人后面就消失，不维护账本。
 *   3. **有上限**：**每圈**最多同时躺 14 件，超了丢最老的——十五台车互相抢的时候，
 *      这个数足够用，也不至于把快照撑大。上限按圈数放大（`startMatch` 里算），
 *      否则三圈的开局撒货会把第一圈那几件直接挤掉，路面密度反而变稀。
 */

import { random, randInt } from "./rng.mjs";
import { MAX_BELT, WEAPONS, giveWeapon, takeHeld } from "./weapons.mjs";

export const PICKUP_LIFE = 90;
export const MAX_PICKUPS = 14;

/** 捡起来的判定半径（米）：横向要比纵向宽一点，路上是斜着过去的。 */
const GRAB_Z = 2.4;
const GRAB_X = 1.4;

/** 掉一件在 (x, z)。空手（0 号）掉不了——它不是东西。 */
export function dropPickup(w, item, x, z) {
  if (!item || !item.i) return null;
  const at = place(w, item, x, z);
  w.events.push({ k: "drop", w: WEAPONS[item.i].id, z, x });
  return at;
}

/** 悄悄摆一件（开局撒货用，不发播报——那时候还没人看见）。 */
export function placePickup(w, item, x, z) {
  if (!item || !item.i) return null;
  return place(w, item, x, z);
}

function place(w, item, x, z) {
  if (w.pickups.length >= (w.maxPickups || MAX_PICKUPS)) w.pickups.shift();
  const at = { id: w.nextEntity++, i: item.i, charges: item.charges | 0, x, z, t: w.time };
  w.pickups.push(at);
  return at;
}

/** 一件新的（满耐久）家伙对象。开局的存货和地上的掉落都从这里生成。 */
export const freshItem = i => ({ i, charges: WEAPONS[i] ? WEAPONS[i].charges : 0 });

/**
 * 开局摆阵：**三分之一的机器人自带家伙**（原版就是这样，"some opponents wield
 * weapons"——不然场上根本没有可抢的东西），再沿路撒几件。
 *
 * 撒货的位置从 700 米往后铺到一圈的尽头，越往后越稀：前半圈靠抢，后半圈靠捡，
 * 这样一场比赛里两种节奏都尝得到。**每一圈都摆同一批**——一局跑三圈，中间那两圈
 * 路上才不会光秃秃的。全部走世界随机流，所以同一颗种子逐位一致。
 */
export function armTheField(w) {
  const kinds = WEAPONS.length - 1;
  for (const r of w.racers) {
    if (r.kind === "human") continue;
    if (random(w, 0, 1) > 0.34) continue;
    giveWeapon(r, 1 + randInt(w, kinds));
  }
  const n = 6;
  for (let lap = 0; lap < w.track.laps; lap++) {
    for (let k = 0; k < n; k++) {
      const z = lap * w.track.length + 700 + (w.track.length - 1000) * (k / (n - 1));
      placePickup(w, freshItem(1 + randInt(w, kinds)), w.track.laneX(randInt(w, w.track.lanes)), z);
    }
  }
  return w;
}

/** 压过去就捡。腰里满了（四件）就留给后面的人——这也是一种"取舍"。 */
export function takePickup(w, r) {
  if (!w.pickups || !w.pickups.length) return null;
  if (!r.belt) { r.belt = []; r.wi = 0; }
  if (r.belt.length >= MAX_BELT) return null;
  for (let k = 0; k < w.pickups.length; k++) {
    const at = w.pickups[k];
    if (Math.abs(at.z - r.z) > GRAB_Z || Math.abs(at.x - r.x) > GRAB_X) continue;
    w.pickups.splice(k, 1);
    giveWeapon(r, at.i, at.charges);
    w.events.push({ k: "pick", a: r.id, w: WEAPONS[at.i].id, z: r.z, x: r.x });
    return at;
  }
  return null;
}

/**
 * 原版最妙的一条规则：**趁他举着家伙出手的那一下打他，就能把家伙抢过来**。
 *
 * 判定里没有随机数——他挥出去的那 0.3 秒就是你的窗口，反过来也一样：你挥空的
 * 时候，别人也正盯着你手里的棍子。腰里满了就只能把它拍在地上（掉在路上），
 * 于是"抢"和"捡"这两条路子在同一个地方接上了。
 */
export function stealWeapon(w, r, target) {
  const held = target.belt && target.belt.length ? target.belt[target.wi | 0] : null;
  if (!held) return null;
  if (r.belt.length >= MAX_BELT) {
    const item = takeHeld(target);
    dropPickup(w, item, target.x, target.z);
    w.events.push({ k: "steal", a: r.id, b: target.id, w: WEAPONS[item.i].id, z: target.z, x: target.x, full: 1 });
    return null;
  }
  const item = takeHeld(target);
  giveWeapon(r, item.i, item.charges);
  w.events.push({ k: "steal", a: r.id, b: target.id, w: WEAPONS[item.i].id, z: target.z, x: target.x });
  return item;
}

/** 摔车：手里的家伙全甩到路上。痛，但这条路上从此多了一份补给。 */
export function spillBelt(w, r) {
  if (!r.belt || !r.belt.length) return 0;
  const n = r.belt.length;
  // 横向散开一点，否则四件东西叠在一个点上，捡起来像捡了一件。
  r.belt.slice().forEach((item, k) => {
    dropPickup(w, item, clampSide(r.x + (k - (n - 1) / 2) * 1.1, w.track), r.z - k * 1.4);
  });
  r.belt = [];
  r.wi = 0;
  return n;
}

const clampSide = (x, track) => Math.max(-track.limitX, Math.min(track.limitX, x));

/** 落在所有人身后、或者躺太久的，就没人会回头捡了。 */
export function cullPickups(w, backZ) {
  if (!w.pickups || !w.pickups.length) return;
  w.pickups = w.pickups.filter(p => p.z > backZ - 60 && w.time - p.t < PICKUP_LIFE);
}
