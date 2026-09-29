/**
 * 输入命令队列的语义钉子。
 *
 * 这几条不变式一旦松掉，表现就是"车骑得好好的忽然被拽回去"或者"人不在了车
 * 还自己往前冲"——全是那种在浏览器里极难复现、但在这里三行就能钉死的东西。
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_QUEUED_TICKS, pushCmd, queuedTicks, resetQueue, settleAck, takeCmd,
} from "../sim/netcode.mjs";

const cmd = (over = {}) => ({ sq: 1, th: 1, br: 0, st: 0, act: 0, nos: 0, n: 3, ...over });

test("一格一格地消化：命令走完才算 ack，ack 坐标是走完那一刻的位置", () => {
  const a = { x: 0, z: 0 };
  resetQueue(a);
  pushCmd(a, cmd({ n: 3 }), 0);
  assert.equal(queuedTicks(a), 3);

  const first = takeCmd(a);
  assert.deepEqual([first.th, first.br, first.st, first.act], [1, 0, 0, 0]);
  a.z += 4; settleAck(a);
  assert.equal(a.ack, 0, "只走了一格：还没确认");
  assert.equal(queuedTicks(a), 2);

  takeCmd(a); a.z += 4; settleAck(a);
  takeCmd(a); a.z += 4; settleAck(a);
  assert.equal(a.ack, 1, "三格走完 → 确认");
  assert.equal(a.ackZ, 12, "确认点是那一刻的位置，不是现在的位置");
  assert.equal(queuedTicks(a), 0);
  assert.equal(takeCmd(a), null, "队列空了就是没输入（掉线的人不会自己往前冲）");
});

test("一次性动作只在命令的第一格触发", () => {
  const a = { x: 0, z: 0 };
  resetQueue(a);
  pushCmd(a, cmd({ n: 2, act: 1 }), 0);
  assert.equal(takeCmd(a).act, 1, "第一格带上动作");
  assert.equal(takeCmd(a).act, 0, "第二格不能重复触发——否则按一次出拳会连打两下");
});

test("n=0 的心跳不入队（它只是'世界别停'，不是'我要走一下'）", () => {
  const a = { x: 0, z: 0 };
  resetQueue(a);
  pushCmd(a, cmd({ n: 0 }), 0);
  assert.equal(queuedTicks(a), 0);
  assert.equal(takeCmd(a), null);
});

test("队列超预算时丢队头，并把 ack 直接推到当前位置", () => {
  const a = { x: 0, z: 500 };
  resetQueue(a);
  for (let i = 0; i < 20; i++) pushCmd(a, cmd({ sq: i + 1, n: 20 }), 0);
  assert.ok(queuedTicks(a) <= MAX_QUEUED_TICKS, "队列被夹在预算之内");
  assert.ok(a.ack > 0, "丢掉的那一段会被确认，位置取当下");
  assert.equal(a.ackZ, 500);
  assert.ok(a.cmds[0].sq > a.ack, "剩下的命令序号必须都在 ack 之后");
});

test("resetQueue 把时间线清成'从当前位置重新开始'", () => {
  const a = { x: 3, z: 90 };
  resetQueue(a);
  assert.equal(a.ack, 0);
  assert.equal(a.queued, 0);
  assert.equal(a.ackZ, 90);
  assert.equal(a.ackX, 3);
});
