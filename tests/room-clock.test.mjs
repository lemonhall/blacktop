/**
 * 房间的时钟：节拍网格、快进记账、回收判据，以及把它们串起来的 `MatchTicker`。
 *
 * 这三样东西共同决定了玩家看到的是"世界在匀速走"还是"机器人像幻灯片"。
 * 所以这里的断言都写得很死——它们都是从前一版真实踩过的坑里长出来的。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { advanceWorld, beatGrid, reclaimReason } from "../src/room-clock.mjs";
import { MatchTicker } from "../src/room-ticker.mjs";
import { addMember, createRoomState, setReady } from "../src/room-state.mjs";
import { beginMatch } from "../src/room-match.mjs";
import { BROADCAST_MS } from "../src/room-consts.mjs";
import { MAX_CATCHUP_TICKS } from "../sim/constants.mjs";

function live(bots = 13) {
  const s = createRoomState({
    tenant: "demo", roomId: "R1", mode: "city", bots,
    hostId: "p1", hostName: "柠檬叔", maxHumans: 2, maxBots: 13,
  });
  addMember(s, { playerId: "p1", name: "柠檬叔" });
  return { state: s, ...beginMatch(s, 1000) };
}

test("网格：没到点什么都不做，到点了就推进到**网格上**该到的时刻", () => {
  assert.equal(beatGrid({ now: 1000, nextBcastMs: 1050, broadcastMs: 50 }), null);
  const onTime = beatGrid({ now: 1050, nextBcastMs: 1050, broadcastMs: 50 });
  assert.equal(onTime.target, 1050);
  assert.equal(onTime.next, 1100);
  assert.equal(onTime.skipped, 0);
});

test("网格：醒晚了只丢快照，不丢世界时间", () => {
  // workerd 的 setTimeout(50) 实测平均 62ms 才醒，这是常态而不是异常。
  const late = beatGrid({ now: 1240, nextBcastMs: 1050, broadcastMs: 50 });
  assert.equal(late.skipped, 3, "中间那三格被跳过了");
  assert.equal(late.target, 1200, "但世界要推进到网格上的 1200，而不是 1240");
  assert.equal(late.next, 1250, "下一拍仍然排在网格上，误差不累积");
});

test("网格：未开始时以当下为原点排第一拍", () => {
  const first = beatGrid({ now: 777, nextBcastMs: 0, broadcastMs: 50 });
  assert.equal(first.started, true);
  assert.equal(first.target, 777);
  assert.equal(first.next, 827);
});

test("回收判据：没人连着 → 收；连着且长时间没有消息 → 也收；连着且在说话 → 绝不收", () => {
  const now = 10_000_000;
  assert.equal(reclaimReason({ conns: 0, lastMsgMs: now - 10, now }), "empty");
  assert.equal(reclaimReason({ conns: 1, lastMsgMs: now - 31 * 60_000, now }), "silent");
  // 这条是**曾经的真实 bug**：一局比赛从头跑到尾名册都不动，
  // 拿"名册最后变动时间"当判据会把正在进行的房间拆掉。
  assert.equal(reclaimReason({ conns: 2, lastMsgMs: now - 60_000, now }), "");
  assert.equal(reclaimReason({ conns: 2, lastMsgMs: 0, now }), "", "还没收到过消息不算僵尸");
});

test("节拍器：世界按网格匀速推进，回调的次数等于经过的格数", () => {
  const { world } = live();
  const frames = [];
  const ticker = new MatchTicker({ onFrame: now => frames.push(now), onEnd: () => {} });
  ticker.start(world, 1000);
  for (let i = 1; i <= 10; i++) ticker.beat(1000 + i * BROADCAST_MS);
  assert.equal(frames.length, 10, `10 拍应该广播 10 帧，实际 ${frames.length}`);
  const elapsed = world.time;
  assert.ok(Math.abs(elapsed - 10 * BROADCAST_MS / 1000) < 0.05, `世界走了 ${elapsed}`);
  ticker.stop();
});

test("节拍器：世界结束就停表，并且**只**报告一次", () => {
  const { world } = live();
  let ends = 0;
  const ticker = new MatchTicker({ onFrame: () => {}, onEnd: () => { ends++; } });
  ticker.start(world, 1000);
  ticker.beat(1050);
  world.phase = "over";
  assert.equal(ticker.beat(1100), false);
  assert.equal(ticker.beat(1150), false, "停表之后再调也不该重复报告");
  assert.equal(ends, 1);
});

test("快进：长时间挂起只削这一次的欠账，不把世界的时间永久吃掉", () => {
  const { world } = live();
  const before = world.time;
  // 假装 DO 被冻了 10 秒：一次补算的上限是 MAX_CATCHUP_TICKS 格（4 秒），
  // 超出部分被削掉的是"这一次要补的量"，零头继续记账。
  advanceWorld(world, 0, 10_000, MAX_CATCHUP_TICKS);
  assert.ok(world.time - before <= MAX_CATCHUP_TICKS / 60 + 1e-9, "补算被预算夹住了");
  assert.ok(world.stepCarry >= 0);
});

test("快进：世界已经结束时不再推进（结算之后时间要冻住）", () => {
  const { world } = live();
  world.phase = "over";
  const t = world.time;
  advanceWorld(world, 0, 100_000, MAX_CATCHUP_TICKS);
  assert.equal(world.time, t);
});

test("比赛跑到一半名册没动过，房间也不该被回收", () => {
  const { state, world } = live();
  setReady(state, "p1", true);
  const now = 5_000_000;
  advanceWorld(world, now - 1000, now, MAX_CATCHUP_TICKS);
  // 名册的 updatedAt 远在过去，但有人正在以 25Hz 上行。
  state.updatedAt = now - 20 * 60_000;
  assert.equal(reclaimReason({ conns: 1, lastMsgMs: now - 40, now }), "");
});
