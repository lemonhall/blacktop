/**
 * 确定性随机源。整局比赛的可复现性全押在这一处。
 *
 * 每条流都写在世界对象上（`w.seed`），不存模块级变量：DO 里同时可能存在多个
 * 房间对象，模块级状态会被它们串味。
 */

/** 线性同余发生器。同一颗种子 = 同一局（车流、道具、机器人性格全部一致）。 */
export function nextRnd(w) {
  w.seed = (w.seed * 1664525 + 1013904223) >>> 0;
  return w.seed / 4294967296;
}

export const random = (w, a, b) => a + nextRnd(w) * (b - a);
export const choose = (w, arr) => arr[Math.floor(nextRnd(w) * arr.length)];

/** `[0, n)` 的整数。 */
export const randInt = (w, n) => Math.floor(nextRnd(w) * n);

/**
 * 纯表现用随机源：粒子、路面纹理、尘土。
 *
 * 它刻意与 `w.seed` 分离。表现层如果偷用模拟流，一个客户端少画一次粒子，
 * 整局后续的车流就会错位——这是典型的"看不见的 desync"。
 */
export function cosmeticRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 与位置绑定的哈希：路边第 `i` 个道具长什么样，由 (种子, i) 唯一决定。 */
export function hash2(seed, i) {
  let h = (seed ^ (i * 2654435761)) >>> 0;
  h = (h ^ (h >>> 15)) * 2246822519 >>> 0;
  h = (h ^ (h >>> 13)) * 3266489917 >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
