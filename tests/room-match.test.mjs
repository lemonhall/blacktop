/**
 * 名册 → 场上：开局、半路加入、踢人、掉线。
 *
 * 半路加入是这一版新加的（房主可以关掉）。它的难点不在"加进去"，而在**加在哪儿**：
 * 扔在起点等于让他在三公里外独自骑，扔在领跑者前面等于空降抢第一。所以这里
 * 对落位有一条明确断言。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { addMember, createRoomState, rosterOf, setReady } from "../src/room-state.mjs";
import {
  actorIdOf, beginMatch, dropPlayer, ejectFromWorld, joinLive, resetMatch,
} from "../src/room-match.mjs";
import { advanceWorld } from "../src/room-clock.mjs";
import { MAX_RACERS } from "../sim/data.mjs";
import { run, seconds } from "./helpers.mjs";

function staged(bots = 13, humans = ["p1"]) {
  const s = createRoomState({
    tenant: "demo", roomId: "R1", name: "夜路", mode: "city", bots,
    hostId: humans[0], hostName: "柠檬叔", maxHumans: 2, maxBots: 13,
  });
  humans.forEach((id, i) => addMember(s, { playerId: id, name: i ? "老二" : "柠檬叔", bike: i }));
  return s;
}

test("开跑：名册变成 15 台车，真人排在发车格最前面", () => {
  const s = staged(13, ["p1", "p2"]);
  setReady(s, "p2", true);
  const { world, mapMsg } = beginMatch(s, 5000);
  assert.equal(s.phase, "live");
  assert.equal(world.racers.length, MAX_RACERS);
  assert.equal(world.racers.filter(r => r.kind === "human").length, 2);
  assert.equal(world.racers[0].ownerId, "p1");
  assert.ok(world.racers[0].z > world.racers[10].z, "真人应该比最后一排靠前");
  assert.equal(mapMsg.t, "map");
  assert.equal(mapMsg.roster.length, MAX_RACERS);
  assert.ok(s.lastSeed > 0, "种子要记下来，战绩入库与复盘都靠它");
});

test("机器人按技能从高到低往后排（老兵从后面追上来才好看）", () => {
  const s = staged(13, ["p1"]);
  const { world } = beginMatch(s, 1);
  const bots = world.racers.filter(r => r.kind === "bot");
  for (let i = 1; i < bots.length; i++) {
    assert.ok(bots[i].z <= bots[i - 1].z + 1e-9, "机器人没有按技能顺序发车");
  }
});

test("半路加入：落在领跑者身后 45 米，带着全场的平均速度", () => {
  const s = staged(13, ["p1"]);
  const { world } = beginMatch(s, 1);
  run(world, seconds(20));
  setReady(s, "p2", true);
  addMember(s, { playerId: "p2", name: "老二", bike: 2 });
  const racer = joinLive(world, s.members[1]);
  assert.ok(racer, "比赛进行中应该能进场");
  const lead = Math.max(...world.racers.filter(r => r !== racer).map(r => r.z));
  assert.ok(Math.abs(racer.z - (lead - 45)) < 1e-6, `落点是 ${racer.z - lead} 米，不是 -45`);
  assert.ok(racer.v > 10, "一进来就得以路速跑起来，否则立刻被套圈");
  assert.equal(racer.kind, "human");
  assert.equal(racer.bike, 2, "他选的车要带上场");
  assert.equal(joinLive(world, s.members[1]), null, "同一个不该被放进来两次");
});

test("场上满了就让机器人让位，而且让的是最落后的那台", () => {
  // 正常配置下真人上限是 2，所以"没位置"这件事只可能出现在**
  // 真人已经满编、机器人也拉满**的时候：2 + 13 = 15 = MAX_RACERS。
  // 这条守的是"上限"这个概念本身——一个房间里永远不会出现第十六台车。
  const s = staged(14, ["p1", "p2"]);
  const { world } = beginMatch(s, 1);
  assert.equal(world.racers.length, MAX_RACERS);
  world.racers.forEach((r, i) => { r.z = 100 + i * 10; });
  const lastBot = world.racers.filter(r => r.kind === "bot").sort((a, b) => a.z - b.z)[0];
  joinLive(world, { playerId: "p3", name: "插队的", bike: 0 });
  assert.equal(world.racers.length, MAX_RACERS, "总数不变：真人进来要顶掉一个机器人");
  assert.ok(!world.racers.includes(lastBot), "被顶掉的应该是落后最多的那个机器人");
  assert.equal(world.racers.filter(r => r.kind === "human").length, 3);
});

test("踢人：把人从场上彻底拿走；掉线：车留在原地，只是清空输入", () => {
  const s = staged(13, ["p1", "p2"]);
  setReady(s, "p2", true);
  const { world } = beginMatch(s, 1);
  run(world, seconds(8));
  const racer = world.racers.find(r => r.ownerId === "p2");
  racer.cmds.push({ sq: 1, th: 1, br: 0, st: 0, act: 0, nos: 0, n: 5 });
  racer.queued = 5;
  dropPlayer(world, "p2");
  assert.equal(racer.queued, 0, "掉线要清空输入时间线");
  assert.ok(world.racers.includes(racer), "掉线的车要留在路上（重连接着骑）");
  assert.equal(actorIdOf(world, "p2"), racer.id);
  assert.equal(ejectFromWorld(world, "p2"), true);
  assert.ok(!world.racers.includes(racer), "被踢的人是连车带人一起请走");
  assert.equal(ejectFromWorld(world, "p2"), false);
});

test("再来一局：回到候场、举手作废、场上清空", () => {
  const s = staged(13, ["p1", "p2"]);
  setReady(s, "p2", true);
  const { world } = beginMatch(s, 1);
  s.phase = "over";
  s.results = { players: [] };
  resetMatch(s, world);
  assert.equal(s.phase, "staging");
  assert.equal(s.results, null);
  assert.equal(world.racers.length, 0);
  assert.equal(s.members.every(m => !m.ready), true, "下一局要重新举手");
  assert.equal(rosterOf(s).length, 2);
});

test("世界快进：墙上时间流逝多少，世界就推进多少（零头记账，不丢时间）", () => {
  const s = staged(13, ["p1"]);
  const { world } = beginMatch(s, 1);
  let last = 1_000_000;
  // 模拟"消息每 43ms 来一条"的不整除节拍：这是真实链路上的样子。
  for (let i = 0; i < 200; i++) {
    last += 43;
    advanceWorld(world, last - 43, last, 240);
  }
  const expected = 200 * 43 / 1000;
  assert.ok(Math.abs(world.time - expected) < 0.02, `世界走了 ${world.time.toFixed(3)} 秒，墙上过了 ${expected}`);
});
