/**
 * 转速表要的那根数（发动机转速 + 当前挡位）。
 *
 * 为什么是算出来的、而不是从后端搬过来的：转速是**仪表**，不是比赛状态。物理内核里
 * 只有速度，谁也改不了谁的第几挡；把挡位塞进快照等于为了让一根针摆动而加宽协议。
 * 所以这里是一条纯函数：速度 → 挡位 → 转速。纯函数意味着它能在 `node --test` 里被
 * 直接断言（"换挡那一瞬间针要掉回来"这种事，肉眼看不出来，但测试看得出来）。
 *
 * 六挡箱，各挡占到极速的比例是**越往上越宽**（真车就这样：低挡齿比密、高挡拉得开）。
 * 每挡末尾转速到 `shift` 就换下一挡，于是针是锯齿形往上爬——这就是转速表存在的意义：
 * 它是唯一能让玩家"听见"挡位的仪表。
 */

/** 各挡的换挡点（占极速的比例）。六个数 = 六个挡。 */
const SHIFT_AT = [0.18, 0.33, 0.48, 0.64, 0.82, 1.0];

/** 表盘规格：满量程 9 千转、7 千转开始红区、换挡点 7.6 千转。 */
export const TACH = { max: 9, redline: 7, shift: 7.6, idle: 1.15 };

/**
 * `kmh` 当前速度、`vmaxKmh` 这台车在平路上的极速。
 *
 * 返回 `{ gear, rpm }`：`gear` 是第几挡（1 起），`rpm` 是千转（9.0 就是红线到底）。
 * 氮气会把极速推高到 1.18 倍，所以 k 允许超过 1——那时候针压在红区里，这是对的。
 */
export function revs(kmh, vmaxKmh) {
  if (!(vmaxKmh > 0) || !(kmh > 0)) return { gear: 1, rpm: TACH.idle };
  const k = Math.min(1.2, kmh / vmaxKmh);
  let gear = 1;
  while (gear < SHIFT_AT.length && k > SHIFT_AT[gear - 1]) gear++;
  const lo = gear > 1 ? SHIFT_AT[gear - 2] : 0;
  const hi = SHIFT_AT[gear - 1];
  const f = hi > lo ? Math.min(1, (k - lo) / (hi - lo)) : 0;
  return {
    gear,
    rpm: Math.min(TACH.max, TACH.idle + f * (TACH.shift - TACH.idle)),
  };
}
