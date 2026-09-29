/**
 * 时间的三条纯算法：**节拍网格**、**世界快进**、**房间该不该回收**。
 *
 * 单独成文件是因为它们都是"容易被写错、又值得被钉死"的算术，而且 `room.mjs`
 * 那个 Durable Object 在 Node 里根本起不来（`cloudflare:workers` 不存在），
 * 所以这些逻辑必须待在一个能被 `node --test` 直接 import 的地方。
 */

import { DT } from "../sim/constants.mjs";
import { stepWorld } from "../sim/step.mjs";

/**
 * 快进：把世界推进到"现在"。
 *
 * **这个函数保证世界的平均推进速度和墙上时钟一致**，这一点是画面平滑的根。原来
 * 它每次只算 `floor(经过时间 / 16.67ms)` 步，剩下那不足一格的零头**直接扔掉**：
 * 消息每 40ms 来一条时，每次丢 0~16ms，平均世界时间比真实时间慢百分之十几。
 * 客户端按真实时间插值，于是它的"渲染头"一会儿追过服务端的数据（只能冻住等），
 * 一会儿又被新的快照拽回去——眼睛看到的就是**幻灯片**。
 *
 * 修法是把零头**记账**：累积到 `world.stepCarry`，够一格就走一步。这样世界既不
 * 丢时间，也不会滚雪球。`maxTicks` 只用来防止一次长时间的挂起把 CPU 打满。
 */
export function advanceWorld(world, lastTickMs, now, maxTicks) {
  if (!world || world.phase !== "live") return lastTickMs;
  const stepMs = 1000 / 60;
  const elapsed = now - lastTickMs;
  if (elapsed <= 0) return lastTickMs;
  const total = (world.stepCarry || 0) + elapsed;
  let steps = Math.floor(total / stepMs);
  if (steps <= 0) { world.stepCarry = total; return now; }
  // 超预算只削掉**这一步**要补的量，剩下的零头照记——削掉的是"这一次的欠账"，
  // 而不是"世界该有的时间"。两者混为一谈就会重新开始丢时间。
  const extra = Math.max(0, steps - maxTicks);
  steps = Math.min(steps, maxTicks);
  world.stepCarry = total - (steps + extra) * stepMs;
  for (let i = 0; i < steps; i++) {
    if (world.phase !== "live") break;
    stepWorld(world, DT);
  }
  return now;
}

/**
 * 节拍网格的纯算术部分：该不该在这一刻发牌、世界要推进到哪一刻、下一拍排在哪。
 *
 * 约定：
 *   - 未开始（`nextBcastMs` 为 0）→ 以 `now` 为原点，返回第一拍的时刻；
 *   - 没到点 → 返回 `null`，调用方什么都不做；
 *   - 到点（包括晚到）→ `target` 是**网格上应该到的时刻**（永远 ≤ `now`），
 *     世界推到那里为止；`skipped` 是中间被跳掉的格子数。跳过的格子只丢快照、
 *     **不丢世界时间**，否则世界会比墙上时钟永久落后。
 */
export function beatGrid({ now, nextBcastMs, broadcastMs = 50 }) {
  if (!nextBcastMs) return { target: now, next: now + broadcastMs, skipped: 0, started: true };
  if (now < nextBcastMs) return null;
  const skipped = Math.floor((now - nextBcastMs) / broadcastMs);
  const target = nextBcastMs + skipped * broadcastMs;
  return { target, next: target + broadcastMs, skipped, started: false };
}

/**
 * "这个房间该不该回收"——它是**破坏性**的那一步（回收会把名册清空、把比赛扔掉），
 * 所以必须能被单独钉住。
 *
 * 两条判据，缺一不可：
 *   - `empty`：一个连接都没有了。正常退房走的都是这一条；
 *   - `silent`：还有连接，但**整整 `idleMs` 没有收到过任何消息**。客户端 2 秒一个
 *     心跳，所以这只会命中"连接其实是僵尸"的情况。
 *
 * 曾经用 `state.updatedAt`（名册最后变动时间）当判据，那是错的：一局从头跑到尾
 * 名册一次都不动，于是比赛进行到第 10 分钟，房间会被自己的 alarm 拆掉——名册
 * 清空、世界扔掉，而玩家还连着、还在骑。
 */
export function reclaimReason({ conns = 0, lastMsgMs = 0, now = 0, idleMs = 30 * 60_000 }) {
  if (conns <= 0) return "empty";
  if (lastMsgMs && now - lastMsgMs > idleMs) return "silent";
  return "";
}
