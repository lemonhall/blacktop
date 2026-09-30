/**
 * 世界对象：一局比赛的全部权威状态。
 *
 * 它是"纯数据 + 纯函数"能拼出的最大单位：不持有 socket、不持有定时器、不知道
 * 自己在 Durable Object 里还是在浏览器里跑。这条边界让"同一份代码跑两边"成立，
 * 也让大部分测试可以纯函数地写完。
 *
 * 世界里只有三样东西在动：**车手**（15 台）、**车流**（同向 + 对向）、
 * **时间**。路边的一切（树、路灯、楼房）都不是状态——它们由赛道种子现算，
 * 见 `track.mjs` 的 `propsBetween`。
 */

import { clamp, DT } from "./constants.mjs";
import { BIKES, BOT_NAMES, MAX_RACERS, MODES, PALETTES } from "./data.mjs";
import { createTrack, gridSlot } from "./track.mjs";
import { cullCritters, spawnCritters, stepCritters } from "./critters.mjs";
import { MAX_PICKUPS, armTheField } from "./pickups.mjs";
import { newRacer } from "./racer.mjs";
import { resetHistory } from "./history.mjs";

/** 发车前倒数几秒。这段时间里油门是锁死的——十五台车一起抢第一个弯才公平。 */
export const COUNTDOWN = 3.2;

/**
 * 一场比赛的时间上限（秒）。到点就结算，跑不完的按已跑距离排名。
 *
 * **它得跟着圈数走。** 一圈 3~4.6 公里、人均 40 米/秒，一圈就是一分半上下；
 * 上限原来照"单程"定的 210 秒，改成三圈之后还剩不到一圈的余量——正常跑完的人
 * 一大半会被"时间到"截胡。所以按 `TIME_LIMIT_PER_LAP × 圈数` 现算。
 */
export const TIME_LIMIT_PER_LAP = 210;
export const TIME_LIMIT = TIME_LIMIT_PER_LAP * 3;

export function createWorld({ tenant, roomId, mode = "city", difficulty = 1, seed = 1 }) {
  const m = MODES[mode] ? mode : "city";
  return {
    tenant, roomId, mode: m,
    difficulty: clamp(Math.floor(difficulty), 0, 2),
    // `seed` 是**会变的** LCG 状态（每取一次随机数就往前推一格）；
    // `matchSeed` 才是一局的身份：赛道、道具、机器人性格、战绩落库都用它。
    // 混用这两个会让"同一局的赛道"随进程漂移，是个很难查的坑。
    seed: seed >>> 0, matchSeed: seed >>> 0,
    track: createTrack({ seed: seed >>> 0, mode: m }),
    phase: "live",
    countdown: COUNTDOWN,
    time: 0, tick: 0, nextEntity: 1,
    stepCarry: 0,
    racers: [], traffic: [], pickups: [], critters: [], critterCursor: 0, events: [],
    finishers: 0, finishOrder: [],
    nextTrafficAt: 0, nextDayunAt: 0,
    // 位姿历史：服务端"回看"用的环形缓冲（见 `history.mjs`）。它是**从属数据**，
    // 不是世界的一部分——清空它不会改变任何一局的走向。
    hist: null,
    results: null, endedAt: 0, endReason: "",
  };
}

/** 场上真实存在的车手数（人头 + 机器人），不含被踢掉的空位。 */
export const fieldSize = w => w.racers.length;

/** 领跑者的 z。车流挂在它前面，所以车流是"这个世界的东西"，不是给谁的私人障碍。 */
export function leadZ(w) {
  let z = 0;
  for (const r of w.racers) if (r.z > z) z = r.z;
  return z;
}

/**
 * 名册 → 场上的实体。这是 `staging → live` 的唯一入口。
 *
 * 发车格的分配：真人排在**前两排**（举手早的靠前，房主占最前排中间），
 * 机器人按技能从高到低往后排——老兵从后面追上来才好看，而休闲的堵在前面
 * 会让第一弯变成一堵墙。
 */
export function startMatch(w, roster, seed) {
  w.seed = (seed >>> 0) || w.seed;
  w.matchSeed = w.seed;
  w.track = createTrack({ seed: w.matchSeed, mode: w.mode });
  // 上限跟着圈数走：三圈的路程是三倍，计时门限也得是三倍（见 `TIME_LIMIT_PER_LAP`）。
  w.timeLimit = TIME_LIMIT_PER_LAP * w.track.laps;
  // 地上的家伙同理：按圈数放大，路变长三倍，能同时躺着的件数也该是三倍。
  w.maxPickups = MAX_PICKUPS * w.track.laps;
  w.time = 0; w.tick = 0; w.phase = "live";
  w.countdown = COUNTDOWN;
  w.stepCarry = 0;
  w.racers = []; w.traffic = []; w.pickups = []; w.critters = []; w.critterCursor = 0; w.events = [];
  w.finishers = 0; w.finishOrder = []; w.results = null; w.endedAt = 0; w.endReason = "";
  // 注意单位：`trafficMs` 是毫秒（配置里读起来顺），而 `w.time` 是**秒**。
  // 这两个混过一次，表现是"整场比赛路上一辆车都没有"——而且不报错。
  w.nextTrafficAt = w.track.trafficMs / 1000;
  w.nextDayunAt = w.track.dayunMs / 1000;

  const humans = roster.filter(r => r.kind === "human");
  const bots = roster.filter(r => r.kind !== "human")
    .sort((a, b) => (b.skill || 0) - (a.skill || 0));
  const ordered = [...humans, ...bots].slice(0, MAX_RACERS);

  ordered.forEach((entry, i) => {
    const slot = gridSlot(w.track, i);
    const racer = newRacer(w, {
      id: w.nextEntity++,
      kind: entry.kind,
      ownerId: entry.ownerId,
      name: entry.name,
      bike: entry.bike,
      palette: entry.palette === undefined ? i % PALETTES.length : entry.palette,
      skill: entry.skill === undefined ? 1 : entry.skill,
      grid: slot,
    });
    racer.gridIndex = i;
    w.racers.push(racer);
  });
  // 摆家伙：一部分机器人自带一件，路上再撒几件。顺序放在所有人就位之后，
  // 因为掉落的位置要读赛道——而赛道的车道数此刻才定下来。
  armTheField(w);
  resetHistory(w);
  return w;
}

/**
 * 机器人补位：房间里的真人不足两人时把场子填满。
 *
 * 数量算的是"**补到满员**"而不是"补到某个固定数"：这个游戏的重点从来不是
 * 人机对抗，而是"十五台车挤在同一条路上"。房主少放几个机器人是一种难度选择，
 * 但默认就该是满的。
 */
export function fillRoster(w, roster, botCount) {
  const humans = roster.filter(r => r.kind === "human");
  const want = clamp(Math.floor(botCount), 0, Math.max(0, MAX_RACERS - humans.length));
  const out = humans.map(h => ({ ...h }));
  for (let i = 0; i < want; i++) {
    const n = humans.length + i;
    out.push({
      kind: "bot",
      ownerId: `bot:${i}`,
      name: BOT_NAMES[n % BOT_NAMES.length] + (n >= BOT_NAMES.length ? `·${Math.floor(n / BOT_NAMES.length) + 1}` : ""),
      // 机器人也挑车：按难度与序号轮着来，三种车在场上都有人骑。
      bike: (i * 2 + humans.length) % BIKES.length,
      palette: (i + humans.length) % PALETTES.length,
      skill: 0.74 + (i % 3) * 0.08,
    });
  }
  return out;
}

/** 名册里的车手该骑哪台车——车型是**取舍**，不是升级，所以默认给中间那台。 */
export const bikeOf = entry => clamp(Math.floor(Number(entry?.bike) || 0), 0, BIKES.length - 1);

/**
 * 结算。
 *
 * 排名规则（简单到不用解释）：冲过线的按 **冲线时刻** 排，没冲线的按 **已跑距离**
 * 排，还没起跑的（半路掉线、一直不动）垫底。`dnf` 标记没跑完的人，结算页要能
 * 一眼看出"这个人是跑完的还是被时间掐掉的"。
 */
export function settle(w, reason = "finish") {
  if (w.results) return w.results;
  const rows = w.racers.map(r => ({
    id: r.id, ownerId: r.ownerId, name: r.name,
    kind: r.kind, bike: r.bike, palette: r.palette,
    rank: 0, time: r.finished ? r.finishTime : null,
    z: Math.round(r.z), v: Math.round(r.topV * 3.6),
    downs: r.downs, kills: r.kills, crashes: r.crashes,
    cash: r.cash, dnf: !r.finished ? 1 : 0,
  }));
  rows.sort((a, b) => {
    if (a.time !== null && b.time !== null) return a.time - b.time;
    if (a.time !== null) return -1;
    if (b.time !== null) return 1;
    return b.z - a.z;
  });
  rows.forEach((row, i) => { row.rank = i + 1; });
  for (const row of rows) {
    const r = w.racers.find(x => x.id === row.id);
    if (r) r.rank = row.rank;
  }
  w.results = {
    t: "results", reason, track: w.mode, seed: w.matchSeed,
    players: rows,
    winner: (rows[0] || {}).name || "",
    payout: payoutOf(rows),
  };
  // **结算就是把世界停表**，这一行不能省。
  //
  // 房间的时钟是"世界还是 live 就继续推进"，广播结算的唯一触发点是节拍器发现
  // `world.phase !== "live"`。少了这一行，症状极其安静：名次算出来了、`results`
  // 躺在世界里，但没人知道该收尾——于是世界接着跑，玩家撞了线还在原地骑，
  // 结算页永远不会出现，房间只能等 30 分钟被回收。
  w.phase = "over";
  w.endedAt = w.time;
  w.endReason = reason;
  return w.results;
}

/**
 * 赏金。名次给底薪、撂倒人给提成——这是"跑第一"和"踢大运"两条路线的平衡点：
 * 跑得慢但打得凶的人，收入不该被第一名甩开一个数量级，否则打架就成了纯装饰。
 */
function payoutOf(rows) {
  const base = [2000, 1400, 1000, 750, 560, 420, 320, 240, 180, 140, 110, 90, 70, 50, 30];
  const out = {};
  rows.forEach((row, i) => {
    const prize = base[i] !== undefined ? base[i] : 20;
    out[row.ownerId] = prize + row.downs * 250 + row.kills * 1000;
  });
  return out;
}

export { DT };
