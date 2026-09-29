/**
 * 房间名册与权限。这一层最容易出的是**权限漏洞**（谁能踢人、谁能改人数、谁能开局）
 * 和**上限口径错**（租户规则和模式上限谁说了算），所以每条规则都单独钉一遍。
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  addMember, clearReady, createRoomState, isHost, kickMember, pendingReady,
  publicView, removeMember, setBots, setConfig, setMemberBike, setReady, startCheck,
  view, KICK_BAN_MS,
} from "../src/room-state.mjs";
import { BIKES, MODES } from "../sim/data.mjs";

const room = (over = {}) => createRoomState({
  tenant: "demo", roomId: "ABC123", name: "夜路", mode: "city",
  hostId: "p1", hostName: "柠檬叔", now: 1000, ...over,
});

test("默认上限：真人 2、机器人 13，加起来正好是满员的 15 台", () => {
  const s = room();
  assert.equal(s.maxHumans, MODES.city.maxHumans);
  assert.equal(s.maxBots, MODES.city.bots);
  assert.equal(s.maxHumans + s.maxBots, 15);
  assert.equal(s.bots, 13, "默认就把机器人拉满——这个游戏的重点是十五台车挤在一起");
});

test("租户规则更小时以租户为准，而且原值要留着（换模式不能一路缩水）", () => {
  const s = room({ maxHumans: 1, maxBots: 3 });
  assert.equal(s.maxHumans, 1);
  assert.equal(s.maxBots, 3);
  assert.equal(s.humansRule, 1);
  assert.equal(s.botsRule, 3);
  setConfig(s, { mode: "wild" });
  setConfig(s, { mode: "city" });
  assert.equal(s.maxBots, 3, "来回换模式之后上限必须还是 3");
});

test("满员就拒，且不区分阶段（半路进人也不能超编）", () => {
  const s = room();
  assert.equal(addMember(s, { playerId: "p1", name: "房主", now: 1 }).rejoined, false);
  assert.equal(addMember(s, { playerId: "p2", name: "第二人", now: 2 }).ok, true);
  const third = addMember(s, { playerId: "p3", name: "第三人", now: 3 });
  assert.equal(third.ok, false);
  assert.equal(third.error, "room_full");
});

test("房主关掉'允许中途加入'之后，比赛中进不来；但重连的老成员仍然进得来", () => {
  const s = room({ joinLive: false });
  addMember(s, { playerId: "p1", name: "房主", now: 1 });
  s.phase = "live";
  assert.equal(addMember(s, { playerId: "p9", name: "路人", now: 5 }).error, "join_closed");
  s.members.push({ playerId: "p2", name: "老二", bike: 0, ready: true, joinedAt: 2, readyAt: 2 });
  const back = addMember(s, { playerId: "p2", name: "老二", now: 9 });
  assert.equal(back.ok, true);
  assert.equal(back.rejoined, true);
});

test("房主不需要举手；别人的举手状态只由自己改变", () => {
  const s = room();
  addMember(s, { playerId: "p1", name: "房主", now: 1 });
  addMember(s, { playerId: "p2", name: "老二", now: 2 });
  assert.equal(setReady(s, "p1", true), false, "房主举手要被拒——他的'开跑'就是表态");
  assert.equal(setReady(s, "p2", true), true);
  assert.deepEqual(pendingReady(s), []);
  assert.equal(setReady(s, "p2", false), true);
  assert.equal(pendingReady(s).length, 1);
});

test("选车只能改自己的，而且阶段必须是候场", () => {
  const s = room();
  addMember(s, { playerId: "p1", name: "房主", now: 1 });
  assert.equal(setMemberBike(s, "p1", 2), true);
  assert.equal(s.members[0].bike, 2);
  assert.equal(setMemberBike(s, "p1", 99), true);
  assert.equal(s.members[0].bike, BIKES.length - 1, "越界的车型号要被夹回来");
  s.phase = "live";
  assert.equal(setMemberBike(s, "p1", 0), false, "开跑了就不能换车");
});

test("踢人要立刻生效，并且十分钟内不许回来", () => {
  const s = room();
  addMember(s, { playerId: "p1", name: "房主", now: 1 });
  addMember(s, { playerId: "p2", name: "老二", now: 2 });
  assert.equal(kickMember(s, "p2", 10), true);
  assert.equal(s.members.length, 1);
  assert.equal(addMember(s, { playerId: "p2", name: "老二", now: 11 }).error, "kicked");
  const later = 11 + KICK_BAN_MS + 1;
  assert.equal(addMember(s, { playerId: "p2", name: "老二", now: later }).ok, true);
  assert.deepEqual(s.kicked, {}, "过期的禁令要被顺手清掉，这个表不该跟着房间长");
});

test("房主退房：钥匙交给最早进来的那个人", () => {
  const s = room();
  addMember(s, { playerId: "p1", name: "房主", now: 1 });
  addMember(s, { playerId: "p2", name: "先来的", now: 2 });
  addMember(s, { playerId: "p3", name: "后来的", now: 3 });
  removeMember(s, "p1", 9);
  assert.equal(s.hostId, "p2");
  assert.equal(isHost(s, "p3"), false);
});

test("开局门槛：至少两个人、所有人都举过手、不超编", () => {
  const s = room({ bots: 0 });
  addMember(s, { playerId: "p1", name: "房主", now: 1 });
  assert.equal(startCheck(s).error, "need_two", "一个人 + 零个机器人不能开");
  setBots(s, 5);
  assert.equal(startCheck(s).ok, true, "一个人带机器人可以开（单机也能玩）");
  addMember(s, { playerId: "p2", name: "老二", now: 2 });
  assert.equal(startCheck(s).error, "not_ready");
  assert.deepEqual(startCheck(s).pending, ["老二"]);
  setReady(s, "p2", true);
  assert.equal(startCheck(s).ok, true);
});

test("换赛道会把举手作废（换的是另一场比赛，确认不能顺延）", () => {
  const s = room();
  addMember(s, { playerId: "p1", name: "房主", now: 1 });
  addMember(s, { playerId: "p2", name: "老二", now: 2 });
  setReady(s, "p2", true);
  clearReady(s);
  assert.equal(pendingReady(s).length, 1);
  setReady(s, "p2", true);
  setConfig(s, { mode: "wild" });
  assert.equal(s.mode, "wild");
  assert.equal(pendingReady(s).length, 1, "换了赛道就得重新举手");
});

test("房间列表视图与细节视图：上限报的是生效值", () => {
  const s = room({ maxHumans: 1 });
  addMember(s, { playerId: "p1", name: "柠檬叔", now: 1 });
  const pub = publicView(s);
  assert.equal(pub.capacity, 1, "只允许一个人的租户不该显示 1/2");
  assert.equal(pub.modeName, MODES.city.name);
  const det = view(s, "p1", 5000);
  assert.equal(det.you.host, true);
  assert.equal(det.members[0].n, "柠檬叔");
  assert.equal(det.members[0].wait, 0, "房主不算磨蹭");
  assert.equal(det.allReady, true);
});
