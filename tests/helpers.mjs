/**
 * 测试用的小工具。
 *
 * 只做两件事：造一局**确定的**比赛，以及把一局比赛跑到某个时刻。
 * 刻意不做断言——断言留在各自的测试文件里，这样"这个数字为什么是这个数"
 * 在失败的现场就能读出来。
 */

import { DT } from "../sim/constants.mjs";
import { stepWorld } from "../sim/step.mjs";
import { createWorld, fillRoster, startMatch } from "../sim/world.mjs";

/** 造一局：`humans` 是 [{ownerId,name,bike}]，`bots` 是机器人数。 */
export function build({ mode = "city", seed = 1, bots = 13, humans = [], difficulty = 1 } = {}) {
  const w = createWorld({ tenant: "t", roomId: "r", mode, difficulty, seed });
  const roster = humans.map(h => ({ kind: "human", bike: 0, ...h }));
  const full = fillRoster(w, roster, bots);
  startMatch(w, full, seed);
  return w;
}

/** 跑 `ticks` 格；`each` 每格调一次，可以往世界的输入队列里塞命令。 */
export function run(w, ticks, each = null) {
  for (let i = 0; i < ticks; i++) {
    if (each) each(w, i);
    stepWorld(w, DT);
    w.events.length = 0;
    if (w.results) break;
  }
  return w;
}

export const seconds = n => Math.round(n * 60);

/** 一局的状态摘要，用来比对"两次跑是否逐位一致"。 */
export function digest(w) {
  return JSON.stringify({
    tick: w.tick, time: Math.round(w.time * 1000) / 1000, phase: w.phase,
    racers: w.racers.map(r => [
      r.id, Math.round(r.x * 100), Math.round(r.z * 100), Math.round(r.v * 1000),
      r.state, Math.round(r.stamina), r.downs, r.crashes,
    ]),
    traffic: w.traffic.map(v => [v.id, v.kind, Math.round(v.x * 100), Math.round(v.z * 100)]),
    finishers: w.finishers,
  });
}
