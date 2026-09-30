/**
 * 位姿历史：**让服务端能回看**。
 *
 * 为什么非要有它：玩家按下 `J` 的那一刻，他看见的世界是 `0.14 秒插值 + 一个单程
 * 网络延迟`之前的。这条命令飘到服务端、被算进世界，又是半个来回之后。于是"判定
 * 发生的时刻"和"玩家出手依据的时刻"差着 0.2~0.3 秒——对向车在这个错位里能跑出
 * 十几米，人怎么可能瞄得中。
 *
 * 解法是老办法：**让判定回到玩家看见的那一刻**。客户端在每条命令里捎上
 * `vt`（它所显示的世界时刻）和 `cvt`（它所显示的车流时刻，画车流时补了一段，
 * 见 `poseFor`），服务端从这本历史里翻出那一刻的位姿，用它来算"够不够得着"。
 * 伤害、推挤、结算全部还作用在**现在**的真实实体上——历史只借来一个坐标。
 *
 * 三条边界：
 *   1. 只记**位置**。谁是谁、什么状态，历史不负责——它是坐标，不是世界。
 *   2. 回看有上限（`REWIND_MAX`）。不封顶的话，一个改过的客户端可以报一个"我
 *      还在二十米外"的时刻，然后把早就跑掉的人打下车。
 *   3. 历史缺失、时刻非法、机器人、本地预测——一律**退回当下坐标**。回看是加分项，
 *      不是必需品；少了它，判定也只是退回改版前的手感，不会坏。
 */

import { TICK_HZ } from "./constants.mjs";

/** 记多久（秒）。比 `REWIND_MAX` 长一截，保证最新的一帧永远还在。 */
export const HIST_SPAN = 0.5;
/** 环的圈数。60Hz 下 30 帧正好是 `HIST_SPAN`。 */
export const HIST_FRAMES = Math.ceil(HIST_SPAN * TICK_HZ);
/** 回看上限（秒）。半个来回再加一点抖动余量，再多就是客户端在扯谎。 */
export const REWIND_MAX = 0.4;

/** 一帧的存储形状是**扁平数字数组**：`[id, x, z, id, x, z, ...]`。
 *  它每格都要重写一遍，用对象数组就是每秒上千个短命对象——扁平数组只是复用
 *  同一个 `Array`，把 `length` 归零再填。 */
export function resetHistory(w) {
  w.hist = { frames: [], head: 0 };
}

/** 每格末尾记一帧。环满了就覆盖最老的那一帧，不分配新内存。 */
export function recordHistory(w) {
  const h = w.hist || (w.hist = { frames: [], head: 0 });
  let f = h.frames[h.head];
  if (!f) { f = { t: 0, r: [], tr: [] }; h.frames[h.head] = f; }
  f.t = w.time;
  f.r.length = 0;
  for (const r of w.racers) f.r.push(r.id, r.x, r.z);
  f.tr.length = 0;
  for (const v of w.traffic) f.tr.push(v.id, v.x, v.z);
  h.head = (h.head + 1) % HIST_FRAMES;
}

/** 不早于 `t` 的最近一帧。找不到（历史还太短）就返回 null。 */
function frameAt(w, t) {
  const h = w.hist;
  if (!h) return null;
  let best = null;
  for (const f of h.frames) {
    if (f.t > t) continue;
    if (!best || f.t > best.t) best = f;
  }
  return best;
}

/**
 * 某一刻的世界位姿。返回 `{ t, r: Map, tr: Map }`，`null` 表示"就用当下"。
 *
 * `t` 会被夹进 `[w.time - REWIND_MAX, w.time]`：往前不能超过上限，往后不能超过
 * 当下——"回看未来"这个词本身就是错的。
 */
export function poseAt(w, t) {
  if (!Number.isFinite(t)) return null;
  const f = frameAt(w, Math.max(Math.min(t, w.time), w.time - REWIND_MAX));
  if (!f) return null;
  const r = new Map(), tr = new Map();
  for (let i = 0; i < f.r.length; i += 3) r.set(f.r[i], { x: f.r[i + 1], z: f.r[i + 2] });
  for (let i = 0; i < f.tr.length; i += 3) tr.set(f.tr[i], { x: f.tr[i + 1], z: f.tr[i + 2] });
  return { t: f.t, r, tr };
}

/**
 * 一次出手要用的**两个时刻**——`vt` 是人看见车手的时刻，`cvt` 是人看见车流的时刻。
 *
 * 为什么要分开：车流在画面上被**补到最新那一帧**（`web/js/view.mjs` 的 `lead`），
 * 因为撞车是拿真实位置判的，画得晚就等于"车还在八米外我就飞了"。既然画得不一样，
 * 判的时候就得各回各的那一刻，否则"灯亮着却打空"会从人身上搬到车上。
 *
 * 两个都缺（机器人、本地预测、老客户端）就返回 `null`，两边一起退回当下坐标。
 */
export function poseFor(w, input) {
  if (!input) return null;
  const men = poseAt(w, input.vt);
  const cars = poseAt(w, input.cvt);
  // **一边缺了就整块作废**，宁可两边都退回当下，也不许混着用。混用的后果是一次
  // 线上实测：人有历史、车没有（或者反过来），于是"人在现在、车在 0.4 秒前"，
  // 相对位置凭空差出十几米——画面上两台车贴着，判定里隔着两个车道。
  if (!men || !cars) return null;
  return { r: men.r, tr: cars.tr };
}

/** 车手在那一刻的位姿；没记到（中途进场、刚摔倒重生）就退回它当下的坐标。 */
export const racerPose = (pose, e) => (pose && pose.r && pose.r.get(e.id)) || e;
/** 车流在那一刻的位姿；同理。 */
export const carPose = (pose, v) => (pose && pose.tr && pose.tr.get(v.id)) || v;
