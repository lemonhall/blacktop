/**
 * 结算页上"这个人拿了多少钱"。
 *
 * 钱的**唯一**来源是服务端算好的 `results.payout`（名次底薪 + 撂倒提成 +
 * 踢飞大运），按 ownerId 索引。之前结算页显示的是 `players[].cash`——那只是
 * 场上事件攒下来的那一部分，于是一场跑完的比赛里，冠军的赏金列写着 ¥0，
 * 全场只有踢飞过大运的那个人有数字。名次底薪是赏金的主体，绝不能漏。
 *
 * 单独成文件是为了能被 `node --test` 直接 import：钱算得对不对，不该靠肉眼看截图。
 */

export function prizeOf(results, ownerId) {
  const table = results && results.payout;
  const amount = table ? table[ownerId] : undefined;
  if (Number.isFinite(amount)) return amount;
  // 老服务端不发 payout 的退路：只能拿场上攒的那点赏金充数（至少不是 0）。
  const row = ((results && results.players) || []).find(p => p.ownerId === ownerId);
  return row && Number.isFinite(row.cash) ? row.cash : 0;
}
