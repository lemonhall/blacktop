/**
 * 车手这一层的**参数**：常数、手感表、以及"这台车什么规格"。
 *
 * 为什么单独一间：`TUNE` 里的每一个数字都是**手感**，不是逻辑。把逻辑和手感放在
 * 两个文件里，调平衡的人才敢动手——他改的是一张表，不会是别人的判定分支。
 * 顺带把模块引用理成了一棵树（`spec ← racer/combat/impact/ai`），没有环。
 */

import { clamp } from "./constants.mjs";
import { BIKES } from "./data.mjs";

export const STAMINA_MAX = 100;
export const NITRO_TIME = 2.4;
export const NITRO_CD = 9;

export const TUNE = {
  // 体力回得快、掉得慢，是**刻意**的：一局里被撂倒三五次是刺激，被撂倒二十次
  // 是折磨。所有"打架很凶"的观感都该来自拳头挥出去的那一下，而不是来自掉血速度。
  regen: 11, regenDelay: 3.0,
  attackCost: 5, attackCd: 0.5, swing: 0.3,
  /**
   * 够得着的范围（米，沿路方向）。**原版的攻击不分招式、分方向**：正前方一拳
   * 打身前的人，回身一拳打身后追上来的那个人。回身那一拳够得着的人少一点、
   * 伤害低一点——回头出手本来就别扭，这是手感，不是平衡。
   * `reachSide` 是"正好并排"的那半米：两边都够得着，否则两台车贴在一起就成了
   * "脸对脸谁也打不着谁"。
   */
  reachFront: 3.8, reachBack: 3.6, reachSide: 0.8, reachX: 1.75, backDmg: 0.85,
  /** 被打的人有 0.4 秒的"缓一下"：没有这道闸门，三台车并排时能在一秒内把人打下车。 */
  hurtDelay: 0.4,
  punchDmg: 17, kickBonus: 7,
  wreck: 2.0, wreckHeavy: 2.8,
  recover: 62, recoverSpeed: 0.34,
  shoulderCap: 0.64, offroadDrag: 1.6,
  driftPull: 0.44, steerSpeed: 11.5,
};

/** 这位车手骑的是哪台车（规格表里的一行）。 */
export const specOf = r => BIKES[r.bike];
