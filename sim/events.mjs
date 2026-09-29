/**
 * 世界事件：一帧里发生的、**值得告诉客户端的瞬间**。
 *
 * 它只承载"表现层需要的事实"——撞车、被撂倒、踢飞大运、冲线、起跑。
 * 位置速度经过模拟算完之后由客户端自己插值，事件里只放最少的那几个字段：
 * 谁、在哪、什么性质。这样事件流很小（一帧通常 0~2 条），还可以放心重发。
 *
 * 生命期很短：房间广播完一帧就把它清空。所以它**不是状态**，是一段广播。
 * 但也必须有个上限——万一某帧真的爆了（15 台车挤在一个弯里），宁可丢事件，
 * 也不能让一条 WebSocket 报文涨到几百 KB。
 */

const MAX_EVENTS = 64;

export function pushEvent(w, ev) {
  if (w.events.length >= MAX_EVENTS) return null;
  w.events.push(ev);
  return ev;
}

/** 兜底裁剪：正常路径由广播端清空，这里是"没人来收"时的保险丝。 */
export function cullEvents(w) {
  if (w.events.length > MAX_EVENTS) w.events.splice(0, w.events.length - MAX_EVENTS);
}

/** 一段事件流里最要紧的那条——相机抖动、音效、播报都按它决定强度。 */
export function loudest(events) {
  const rank = {
    fling: 5, beast: 5, boom: 4, wreck: 4, moo: 3, finish: 3, dayun: 3,
    hit: 2, nitro: 1, whiff: 0, go: 2,
  };
  let best = null, bestRank = -1;
  for (const ev of events) {
    const r = rank[ev.k] === undefined ? -1 : rank[ev.k];
    if (r > bestRank) { best = ev; bestRank = r; }
  }
  return best;
}
