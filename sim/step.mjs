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
import { BURST_TICKS, grantCredit, settleAck, spendCredit, takeCmd } from "./netcode.mjs";
import { crossFinish, stepRacer } from "./racer.mjs";
import { cullPickups } from "./pickups.mjs";
import { cullCritters, spawnCritters, stepCritters } from "./critters.mjs";
import { random } from "./rng.mjs";
import { cullTraffic, spawnTraffic, stepTraffic } from "./traffic.mjs";
import { cullEvents } from "./events.mjs";
import { recordHistory } from "./history.mjs";
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
  stepCritters(w, dt);
  for (const r of w.racers) stepOne(w, r, dt);
  pumpTraffic(w);
  spawnCritters(w, leadZ(w));
  for (const r of w.racers) crossFinish(w, r);
  cullTraffic(w, cameraBackZ(w), leadZ(w));
  cullCritters(w, cameraBackZ(w), leadZ(w));
  cullPickups(w, cameraBackZ(w));
  cullEvents(w);
  checkEnd(w);
  // 位姿历史**记在最后**：它要的是"这一格走完之后大家在哪"，也就是下一个决定
  // 出手的客户端所看到的那个世界的起点。顺序放错（比如记在最前面）会让每一次
  // 回看都差一格，症状是"贴着人打，判定却说还差半米"。
  recordHistory(w);
}

/** 队列空了就是"人在等"，不是"世界停了"。 */
const IDLE = { th: 0, br: 0, st: 0, act: 0, nos: false };
/** 发车倒数：油门锁死、刹车压住——两边的世界都在等，谁也别抢跑。 */
const lock = i => ({ ...i, th: 0, br: 1, act: 0, nos: false });
const live = (w, i) => (w.countdown > 0 ? lock(i) : i);

/**
 * 单个车手的一格。真人从命令队列里取，机器人走 AI。
 *
 * 真人这一支多了一段"追积压"：先走那**正常的一格**（不花额度，"一 tick 一格"是
 * 永远的最低保证），再拿攒下的额度把队列里剩下的吃掉几格。没有这一段，开局那一拍
 * 或者浏览器卡一下送来的那一坨入力，会变成一条**永不消退的延迟线**——而玩家画面上
 * 的车是本地预测的，两边差出几十米，攻击判定再准也没用。原因与算式见
 * `netcode.mjs` 的 `BURST_TICKS`。
 */
function stepOne(w, r, dt) {
  if (r.kind !== "human") {
    const input = aiInput(w, r, dt);
    stepRacer(w, r, dt, live(w, input));
    return;
  }
  grantCredit(r);
  stepRacer(w, r, dt, live(w, takeCmd(r) || IDLE));
  settleAck(r);
  for (let extra = 1; extra < BURST_TICKS && r.queued > 0; extra++) {
    if (!spendCredit(r)) break;
    const cmd = takeCmd(r);
    if (!cmd) break;
    stepRacer(w, r, dt, live(w, cmd));
    settleAck(r);
  }
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
  if (w.time >= (w.timeLimit || TIME_LIMIT)) return void settle(w, "time_up");
  if (w.finishers >= w.racers.length) return void settle(w, "all_finished");
  if (w.finishers === w.racers.length - 1 && w.time > 25) {
    const last = w.racers.find(r => !r.finished);
    if (last && last.state === "ride" && last.v < 0.5) settle(w, "field_finished");
  }
}
