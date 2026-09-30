/**
 * 机器人**跟得上人**——这是"人机混战"能不能成立的前提。
 *
 * 线上实测的 ATK 日志里有一行很扎眼：开局第 21 秒，一个真人前面一个对手都没有，
 * 十三个机器人全在他身后 150~300 米。玩家按 J 打不着人，不是判定不准，是**路上
 * 根本没人**。根因是 `makeBrain` 里那一行油门上限：`skill × [0.9, 1]` 把机器人的
 * 稳态速度压到了人的 67%~90%，于是差距随时间线性拉开——一条 14 台车的赛道被玩成了
 * 个人计时赛。
 *
 * 这一份钉两条：上限不再把人甩开；落后太多的机器人会捏氮气咬住（橡皮筋）。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DT } from "../sim/constants.mjs";
import { build } from "./helpers.mjs";
import { aiInput, makeBrain } from "../sim/ai.mjs";
import { specOf } from "../sim/spec.mjs";

test("机器人的油门上限不再把它压成半个玩家", () => {
  const w = build({ seed: 7, bots: 13, humans: [] });
  for (const r of w.racers) {
    const cap = makeBrain(w, r).throttleCap;
    assert.ok(cap >= 0.9, `skill ${r.skill} 的油门上限 ${cap} 太低——路上就不会有人了`);
    assert.ok(cap <= 1, `上限 ${cap} 不该超过满油门（那是作弊，不是性格）`);
  }
});

test("性格还在：快脚和慢脚不该是同一个数", () => {
  const w = build({ seed: 7, bots: 13, humans: [] });
  const caps = w.racers.map(r => makeBrain(w, r).throttleCap);
  assert.ok(Math.max(...caps) - Math.min(...caps) > 0.01, "差得要有，只是不该差出半个身位");
});

test("落后 60 米以上的机器人会捏氮气咬住", () => {
  const w = build({ seed: 7, bots: 3, humans: [] });
  const [bot, other, ahead] = w.racers;
  w.countdown = 0;
  w.traffic.length = 0;
  bot.z = 0; bot.v = 40;
  other.z = 0; other.v = 0;
  ahead.z = 500; ahead.v = 0;
  let used = 0;
  for (let i = 0; i < 600; i++) {
    bot.nitroCd = 0;
    if (aiInput(w, bot, DT).nos) used++;
  }
  assert.ok(used > 0, "落后 500 米还舍不得用氮气，那就永远追不上了");
});

test("不落后的时候不慌：橡皮筋只在后面拉，不在前面踩", () => {
  const w = build({ seed: 7, bots: 3, humans: [] });
  const [bot, other, behind] = w.racers;
  w.countdown = 0;
  w.traffic.length = 0;
  bot.z = 900; bot.v = specOf(bot).vmax * 0.95;
  other.z = 880; other.v = 0;
  behind.z = 860; behind.v = 0;
  let used = 0;
  for (let i = 0; i < 600; i++) {
    bot.nitroCd = 0;
    if (aiInput(w, bot, DT).nos) used++;
  }
  // 领跑的人还捏氮气只有一种解释：忙着逃命。这里的路上空无一物，
  // 所以"跑开了才舍得捏"的那一支本来也允许它用——但频率必须远低于追赶那一支。
  assert.ok(used < 50, `领跑时 10 秒内捏了 ${used} 次，太慌了`);
});
