/**
 * 家伙。照着 **1996 年那版《暴力摩托 3》**的设定来：**八种**（空手 + 七件），
 * 可以同时攒好几把、按键轮着用；其中**流星锤 / 电棍 / 油桶各只有十次**，
 * 用完就丢。
 *
 * 这张表里只有三件事值得解释，其余全是调平衡：
 *   1. **够得多远比打得疼重要**：路上真正决定胜负的是"谁先够到谁"，所以
 *      `reach` 是权重最大的一列——流星锤多出来的那两米就是它的全部价值。
 *   2. **慢就是代价**：重家伙伤害高、`cd` 也长。拿撬棍的人挥一下，空手的人
 *      已经打完两下。
 *   3. **空手不是废**：最快、最不显眼、而且永远不会用光——摔车丢光家伙之后，
 *      你总还能打。
 *
 * `pull` 是打中之后把人往一侧推开的量：油桶伤害最低，但推得最狠——泼一脸油，
 * 对手手一滑就飘到路肩上去了。这是它存在的理由。
 */

export const WEAPONS = [
  { id: "fist", name: "空手", en: "FISTS", reach: 0.0, dmg: 1.00, cd: 1.00, pull: 4.4, charges: 0 },
  { id: "nunchaku", name: "双节棍", en: "NUNCHAKU", reach: 0.7, dmg: 1.15, cd: 0.70, pull: 4.0, charges: 0 },
  { id: "club", name: "棍棒", en: "CLUB", reach: 0.9, dmg: 1.45, cd: 1.15, pull: 5.4, charges: 0 },
  { id: "chain", name: "铁链", en: "CHAIN", reach: 1.4, dmg: 1.30, cd: 0.95, pull: 5.0, charges: 0 },
  { id: "crowbar", name: "撬棍", en: "CROWBAR", reach: 1.1, dmg: 1.75, cd: 1.35, pull: 5.8, charges: 0 },
  { id: "prod", name: "电棍", en: "CATTLE PROD", reach: 1.3, dmg: 1.05, cd: 0.80, pull: 6.4, charges: 10 },
  { id: "mace", name: "流星锤", en: "MACE", reach: 2.0, dmg: 2.20, cd: 1.50, pull: 7.2, charges: 10 },
  { id: "oilcan", name: "油桶", en: "OIL CAN", reach: 0.6, dmg: 0.75, cd: 0.65, pull: 9.0, charges: 10 },
];

/** 空手那一行。所有"没有家伙"的分支都读它，别再散落魔法数字。 */
export const BARE = WEAPONS[0];

/** 同时能攒几件。原版可以攒一大把，但按键轮换超过四件就不是玩笑了。 */
export const MAX_BELT = 4;

/** 名字 → 下标。线协议里发的是名字（可读），内部一律用下标（便宜）。 */
export function weaponIndex(id) {
  if (typeof id === "number") return id >= 0 && id < WEAPONS.length ? id : 0;
  const i = WEAPONS.findIndex(w => w.id === id);
  return i < 0 ? 0 : i;
}

export const nameOfWeapon = i => (WEAPONS[i] || BARE).name;

/** 现在举在手里的家伙（`{ i, charges }`）；空手返回 null。 */
export const heldWeapon = r => (r.belt && r.belt.length ? r.belt[r.wi | 0] || r.belt[0] : null);

/** 现在这一下用的是哪一行数值——空手也有一行。 */
export const statsOf = r => {
  const held = heldWeapon(r);
  return held ? WEAPONS[held.i] || BARE : BARE;
};

/** 捡到一件。0 号（空手）不是东西，捡不了。 */
export function giveWeapon(r, i, charges) {
  const spec = WEAPONS[i];
  if (!spec || i === 0) return false;
  if (!r.belt) { r.belt = []; r.wi = 0; }
  if (r.belt.length >= MAX_BELT) return false;
  r.belt.push({ i, charges: spec.charges > 0 ? (charges === undefined ? spec.charges : charges | 0) : 0 });
  // 新到手的就举在手里：捡到东西却还得按一下换，节奏上很别扭。
  r.wi = r.belt.length - 1;
  return true;
}

/** 把当前这把从腰里摘下来（抢走、被抢、用完），返回它。 */
export function takeHeld(r) {
  if (!r.belt || !r.belt.length) return null;
  const at = Math.min(Math.max(r.wi | 0, 0), r.belt.length - 1);
  const [item] = r.belt.splice(at, 1);
  r.wi = Math.min(at, Math.max(0, r.belt.length - 1));
  return item;
}

/** 轮换：`Q` 键与机器人都会走这里。只有一件时什么都不做。 */
export function cycleWeapon(r, step = 1) {
  if (!r.belt || r.belt.length < 2) return false;
  const n = r.belt.length;
  r.wi = (((r.wi | 0) + step) % n + n) % n;
  return true;
}

/**
 * 充能武器挥一次少一次，用光就丢。**用光时返回丢掉的那一行数值**（调用方拿它
 * 发一条"油桶用完了"的播报），还有剩余就返回 `null`。
 * 无限耐久的家伙（棍棒、铁链那些）charges 是 0，永远不进这个分支。
 */
export function spendCharge(r) {
  const held = heldWeapon(r);
  if (!held) return null;
  const spec = WEAPONS[held.i];
  if (!spec || spec.charges <= 0) return null;   // 无限耐久的家伙不进这个分支
  held.charges--;
  if (held.charges > 0) return null;
  takeHeld(r);
  return spec;
}
