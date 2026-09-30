/**
 * 结算页上的钱：**名次底薪 + 撂倒提成 + 踢飞大运**，一份都不能少。
 *
 * 这条测试是给一个真实事故收尾的：结算页曾经显示 `players[].cash`——那只是场上
 * 事件攒下来的那一小部分，于是冠军的赏金列写着 ¥0，全场只有踢飞过大运的人有数字。
 * 钱算得对不对，不能靠人肉看截图。
 */

import test from "node:test";
import assert from "node:assert/strict";

import { prizeOf } from "../web/js/payout.mjs";
import { build, run, seconds } from "./helpers.mjs";

test("赏金取 payout 表里的那一格", () => {
  const results = { payout: { "g_alice": 2500, "bot:3": 1400 }, players: [] };
  assert.equal(prizeOf(results, "g_alice"), 2500);
  assert.equal(prizeOf(results, "bot:3"), 1400);
});

test("payout 表里没有这个人时退回他场上攒的赏金", () => {
  const results = { players: [{ ownerId: "g_bob", cash: 1500 }] };
  assert.equal(prizeOf(results, "g_bob"), 1500);
});

test("查不到就是 0，不抛异常（结算页不该因为一个人没数据就白屏）", () => {
  assert.equal(prizeOf({ payout: {}, players: [] }, "g_nobody"), 0);
  assert.equal(prizeOf(null, "g_nobody"), 0);
});

test("真跑完一局：冠军拿的是名次底薪，不是 0", () => {
  // 让人一直拧着油门跑到底（bot 会自动跑），然后看权威结算。
  const w = build({ bots: 3, humans: [{ ownerId: "g_alice", name: "柠檬叔" }] });
  run(w, seconds(w.timeLimit), world => {
    world.racers.forEach(r => {
      if (r.kind === "human" && r.state === "ride") r.v = Math.min(r.v + 1, 60);
    });
  });
  assert.ok(w.results, "计时上限之内应当已经结算");
  const rows = w.results.players;
  const first = rows.find(p => p.rank === 1);
  assert.ok(first, "结算里必须有第一名");
  assert.equal(prizeOf(w.results, first.ownerId), 2000 + first.downs * 250 + first.kills * 1000,
    "冠军 = 2000 底薪 + 撂倒提成 + 踹飞社会车辆");
  assert.ok(prizeOf(w.results, first.ownerId) >= 2000, "冠军的赏金不可能低于底薪");
});
