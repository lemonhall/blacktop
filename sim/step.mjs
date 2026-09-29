/**
 * 单步推进。固定 60Hz，`stepWorld(w, DT)` 是唯一的推进入口。
 *
 * 顺序是有讲究的，而且两个宿主必须一致：
 *   倒数 → 车流 → 车手（真人走命令队列 / 机器人走 AI）→ 生成与回收车流 →
 *   冲线判定 → 结束判定。
 *
 * 客户端本地预测只调用"车手"那一小段（`stepRacer`），所以预测不会因为一辆车
 * 被踢飞而抖动——大运的抛物线是世界的，不是我的。
 */

import { DT } from "./constants.mjs";
import { aiInput } from "./ai.mjs";
import { settleAck, takeCmd } from "./netcode.mjs";
import { crossFinish, stepRacer } from "./racer.mjs";
import { random } from "./rng.mjs";
import { cullTraffic, spawnTraffic, stepTraffic } from "./traffic.mjs";
import { cullEvents } from "./events.mjs";
import { TIME_LIMIT, leadZ, settle } from "./world.mjs";

export function stepWorld(w, dt = DT) {
  if (w.phase !== "live") return;
  w.tick++;
  w.time += dt;
  if (w.countdown > 0) {
    w.countdown -= dt;
    if (w.countdown <= 0) w.events.push({ k: "go", t: Math.round(w.time * 1000) });
  }
  stepTraffic(w, dt);
  for (const r of w.racers) stepOne(w, r, dt);
  pumpTraffic(w);
  for (const r of w.racers) crossFinish(w, r);
  cullTraffic(w, cameraBackZ(w), leadZ(w));
  cullEvents(w);
  checkEnd(w);
}

/** 单个车手的一格。真人从命令队列里取（队列空了就是"人在等"，不是"世界停了"）。 */
function stepOne(w, r, dt) {
  const locked = w.countdown > 0;
  let input;
  if (r.kind === "human") {
    const cmd = takeCmd(r);
    input = cmd || { th: 0, br: 0, st: 0, act: 0, nos: false };
    stepRacer(w, r, dt, locked ? { ...input, th: 0, br: 1, act: 0, nos: false } : input);
    settleAck(r);
    return;
  }
  input = aiInput(w, r, dt);
  stepRacer(w, r, dt, locked ? { ...input, th: 0, br: 1, act: 0, nos: false } : input);
}

/** 落到点就放一辆车。两条独立的节拍：普通车流密，大运稀。 */
function pumpTraffic(w) {
  const lead = leadZ(w);
  if (w.time >= w.nextTrafficAt) {
    w.nextTrafficAt = w.time + w.track.trafficMs / 1000 * random(w, 0.72, 1.28);
    spawnTraffic(w, lead);
  }
  if (w.time >= w.nextDayunAt) {
    w.nextDayunAt = w.time + w.track.dayunMs / 1000 * random(w, 0.8, 1.2);
    spawnTraffic(w, lead, "dayun");
  }
}

/** 相机（也就是"最后一名"）身后的位置。回收车流用它当基准，免得漏掉任何人的后方。 */
function cameraBackZ(w) {
  let z = Infinity;
  for (const r of w.racers) if (r.z < z) z = r.z;
  return Number.isFinite(z) ? z : 0;
}

/**
 * 什么时候算跑完。
 *
 * 三条判据：**所有人都冲线**、**只剩一个还没冲线的人且他停住了**（掉线的幽灵
 * 不该拖住一整桌人）、或者**到时间上限**。最后一条是必须的：一个人一直不拧油门
 * 也能把房间锁死十分钟，那是设计缺陷，不是玩家的错。
 */
function checkEnd(w) {
  if (w.phase !== "live") return;
  if (w.time >= TIME_LIMIT) return void settle(w, "time_up");
  if (w.finishers >= w.racers.length) return void settle(w, "all_finished");
  if (w.finishers === w.racers.length - 1 && w.time > 25) {
    const last = w.racers.find(r => !r.finished);
    if (last && last.state === "ride" && last.v < 0.5) settle(w, "field_finished");
  }
}
