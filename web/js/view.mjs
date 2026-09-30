/**
 * 渲染视图：把快照缓冲插值成"这一刻应该画成什么样"。
 *
 * 两个时间点很关键：
 *   - 快照里的 `tm` 是权威世界时间（秒）；
 *   - 渲染头比它**晚 140ms**，于是任意两帧之间都恰好有一个包可以插值。
 *
 * 这 140ms 就是拿"操作手感"换"画面平滑"的那笔交易。它必须盖得住真实链路上
 * 最长的那个帧间隔——盖不住的话，渲染头一跑到数据前面就只能冻住等下一帧，
 * 数据到的那一刻又猛跳一段，看起来就是"机器人在放幻灯片"。
 */

import { DT, clamp, lerp } from "../../sim/constants.mjs";
import { decodeCritters, decodePickups, decodeRacer, decodeTraffic } from "../../sim/wire.mjs";

export const INTERP_DELAY = 0.14;

/**
 * 车流往前补的**上限**（秒）。正常的那一段是三层加起来：插值延迟 140ms、最后一帧
 * 到达之后又过去的一小段（最多一个快照间隔 50ms）、半个来回的延迟（手机上 100ms
 * 上下）。掉帧、切标签页回来的时候这几项会大得离谱，那时硬补就是让车瞬移，
 * 宁可让它老老实实慢慢追。
 */
export const TRAFFIC_LEAD_MAX = 0.4;

export function pushSnapshot(S, snap) {
  S.snaps.push(snap);
  if (S.snaps.length > 20) S.snaps.shift();
  // 这一帧**到手的时刻**。车流要按本机时钟往下推（见 `carLeadOf`），推的起点就是它。
  S.snapAt = performance.now();
  S.serverTime = snap.tm;
  S.lastTm = snap.tm;
  S.countdown = snap.cd || 0;
  if (snap.ph === "over") S.screen = "over";
}

export const latest = S => S.snaps[S.snaps.length - 1] || null;

function brackets(S, tm) {
  const snaps = S.snaps;
  if (!snaps.length) return null;
  if (snaps.length === 1) return [snaps[0], snaps[0], 0];
  for (let i = snaps.length - 1; i >= 1; i--) {
    if (snaps[i - 1].tm <= tm) {
      const span = (snaps[i].tm - snaps[i - 1].tm) || 0.05;
      return [snaps[i - 1], snaps[i], clamp((tm - snaps[i - 1].tm) / span, 0, 1)];
    }
  }
  return [snaps[0], snaps[0], 0];
}

/**
 * 按 id 在两帧里找同一条实体，把它"一直在动"的那几个量插值到这一刻。
 *
 * `fields` 是 `[字段, 权重]`，权重全写 1（老老实实按 `t` 插值），留着它是为了
 * 以后有哪个量想"插得慢一点"（比如车身的形变）。**插值系数必须是 `t × 权重`**：
 * 漏掉 `t` 就等于把画面钉死在最新那一帧上——20Hz 的快照会一格一格地跳，而渲染头、
 * `INTERP_DELAY`、以及攻击判定回看用的 `vt` 会**全部指着不存在的那一刻**。
 */
function blend(older, newer, t, keyOf, fields) {
  const map = new Map(older.map(e => [keyOf(e), e]));
  return newer.map(entity => {
    const prev = map.get(keyOf(entity));
    if (!prev) return entity;
    const out = { ...entity };
    for (const [key, weight] of fields) {
      if (Number.isFinite(prev[key]) && Number.isFinite(entity[key])) {
        out[key] = lerp(prev[key], entity[key], t * weight);
      }
    }
    return out;
  });
}

const RACER_FIELDS = [["x", 1], ["z", 1], ["lean", 1], ["swing", 1], ["wreck", 1], ["wobble", 1]];
const TRAFFIC_FIELDS = [["x", 1], ["z", 1], ["y", 1], ["spin", 1], ["dmg", 1]];
const idOf = e => (Array.isArray(e) ? e[0] : e.id);

/**
 * 这一刻的完整画面。**只读**：调用方拿到的东西不该再被改回去。
 */
export function buildView(S) {
  const snap = latest(S);
  if (!snap || !S.map) return null;
  const now = performance.now();
  const tm = renderHead(S, snap);
  const [older, newer, t] = brackets(S, tm);
  const roster = S.map.roster;

  const racers = blend(
    older.r.map(w => decodeRacer(w, roster)),
    newer.r.map(w => decodeRacer(w, roster)),
    t, idOf, RACER_FIELDS,
  );
  const traffic = blend(
    (older.tr || []).map(decodeTraffic),
    (newer.tr || []).map(decodeTraffic),
    t, idOf, TRAFFIC_FIELDS,
  );
  // 动物也插值：一头牛从左边晃到右边是**慢动作**，不插值就会一格一格地跳。
  const critters = blend(
    decodeCritters(older.cr),
    decodeCritters(newer.cr),
    t, idOf, TRAFFIC_FIELDS,
  );
  // 整幅画只有一个时刻（`leadTime`）：车流、畜生、**其他车手**全都补到那一刻，
  // 而我自己那台车本来就是画在那一刻的（本地预测）。三者对齐了，"看见的"和
  // "判定的"才是同一个世界。
  const lead = clamp(leadTime(S, snap, tm, now) - tm, 0, TRAFFIC_LEAD_MAX);
  leadCarriage(traffic, "z", "run", lead);
  leadCarriage(critters, "x", "walk", lead);
  leadRacers(racers, lead, S.meId);
  S.carTm = tm + lead;
  // 地上的家伙**不插值**：它们是静止的，而且线格式里没有稳定的实体号（只发
  // "是什么、在哪"）。挪动过的掉落本来就没有——所以直接取较新那一帧，最省事
  // 也最准。
  const pickups = decodePickups(newer.pk);

  const mine = racers.find(r => r.ownerId && r.ownerId === S.meId) || null;
  if (mine) {
    S.mine = mine;
    // 我自己那台车用**本地预测**的位置：权威位置永远比手上慢一个来回，
    // 直接照着画就是"油门踩下去两百毫秒才动"。
    const predicted = S.predictMe;
    if (predicted && S.countdown <= 0 && mine.state === "ride") {
      mine.x = predicted.x; mine.z = predicted.z;
      mine.v = predicted.v; mine.kmh = predicted.v * 3.6;
      mine.lean = predicted.lean; mine.wobble = predicted.wobble;
      // 预测是**整格**推进的（一格 1/60 秒），画面却要落在两格之间。补的这几个
      // 厘米是"已经过去、还没来得及模拟"的那一小段时间——不补，相机就跟着整格
      // 台阶走，路面上的车流相对于镜头就是一顿一顿地跳（60fps 下看不出来，
      // 120fps 和 30fps 下都看得很清楚）。
      const left = subTickSeconds(S);
      mine.z += predicted.v * left;
      mine.x += (predicted.lat || 0) * left;
    }
    mine.me = true;
    S.me = mine;
  }

  order(racers);
  const leader = racers.find(r => r.rank === 1) || racers[0] || null;
  // 起点到终点的总里程 = 一圈长度 × 圈数。进度条、与头名的距离都按它算，
  // 而不是按"一圈跑完"——那是上一版的事。
  const finishZ = S.map.length * (S.map.laps || 1);
  return {
    time: tm, carTime: S.carTm, tick: newer.tk, phase: newer.ph, countdown: newer.cd || 0,
    racers, traffic, critters, pickups, mine, leader, finishZ,
    laps: S.map.laps || 1,
    myRank: mine ? mine.rank || 1 : 1,
    field: racers.length,
  };
}

/**
 * 最后一帧到手之后，**世界又往前走了多久**（本机时钟）+ **半个来回**（服务端那边
 * 从发出这一帧到现在又走的那一段）。这两项合起来，就是"我把车补到哪里才算此刻"。
 *
 * 只补这么一点点是有讲究的：车流是**定速巡航**，所以在最新那一帧上按速度往前推
 * `lead` 秒，推出来的就是它此刻的真实位置——不猜、不外推别的维度。而它每一帧都在
 * 跟着本机时钟匀速往前挪，不会出现"两帧之间冻住、新帧一到猛跳一格"的台阶。
 */
function carLeadOf(S, now) {
  const elapsed = Math.max(0, now - (S.snapAt || now)) / 1000;
  // 半个来回。上限 300ms：一次网络抖动不该让路上的车整体挪出去十几米。
  const half = Number.isFinite(S.rtt) ? Math.min(S.rtt, 300) / 2000 : 0;
  return elapsed + half;
}

/**
 * **整幅画的那一个时刻。**
 *
 * 有本地预测时这个答案不是猜的：预测是从快照里的**权威确认点**出发、把还没被确认
 * 的命令重放一遍算出来的（`predict.mjs`），所以"我"这台车所在的世界时刻**精确等于**
 * `确认点时刻 + 未确认格数 × 1/60`。别的东西照着这一刻补，画面就与判定重合。
 *
 * 没有预测（观战、刚进场）才退回按本机时钟 + 半个来回估计——那时没有"我自己"这条
 * 基准线，估得偏一点也看不出来。
 */
function leadTime(S, snap, tm, now) {
  const ticks = pendingTicks(S);
  // 整格数 + 已经走掉的那一小段：别的车得和**我自己**画在同一个时刻上，
  // 少这后半截，我这一台就会比整条路超前最多一格。
  if (S.predictMe && ticks > 0) return (S.serverTime || snap.tm) + ticks * DT + subTickSeconds(S);
  return snap.tm + carLeadOf(S, now);
}

/**
 * 这一格**已经过去了多少秒**：预测世界停在第 N 格的末尾，而真实时间已经走到
 * 第 N 格末尾 + 这一小段。`app.mjs` 每帧把它留在 `S.tickAcc` 里。
 *
 * 上限压在一格之内：那是"还没被模拟的时间"，超过一格说明这一帧还没跑完
 * （掉帧、刚切回标签页），那时候宁可让人看着自己慢半拍，也不许把车往外推。
 */
function subTickSeconds(S) {
  const left = (S.tickAcc || 0) / DT;
  return left > 0 ? clamp(left, 0, 1) * DT : 0;
}

/** 还没被服务端确认的格数（= 本地预测比权威端多走的格数）。 */
function pendingTicks(S) {
  let n = 0;
  for (const cmd of S.cmds || []) n += cmd.n || 0;
  return n;
}

/**
 * **其他车手也补到那一刻**——整套手感里最关键的一段。
 *
 * 旧版只补车流、不补车手，理由是"打击判定本来就回到玩家看见的那一刻"。那个理由
 * 漏了一半：玩家**自己**那台车是本地预测的，画在"现在"，别人的车却画在插值延迟
 * 加一个来回之前。于是玩家眼里的相对位置，比判定里的相对位置差了 `v × Δ`
 * ——50 m/s 下就是十几米。玩家看到的是"贴着"，判定算的是"差着"，所以线上按 51 次
 * J 只命中 4 次。
 *
 * 只补 `ride`：摔在地上的车不会匀速往前滑。自己那台跳过——它马上被预测覆盖。
 */
function leadRacers(list, seconds, meId) {
  if (!(seconds > 0)) return;
  for (const r of list) {
    if (r.ownerId && r.ownerId === meId) continue;
    if (r.state !== "ride" || !Number.isFinite(r.v)) continue;
    r.z += r.v * seconds;
  }
}

/**
 * 把一串实体沿它自己那一维往前补 `seconds` 秒——车流沿 z 巡航，畜生沿 x 过马路，
 * 两个都是**定速**，所以补出来的就是它此刻真实的位置。
 *
 * 为什么车流与畜生**必须**补：撞车、撞牛是拿服务端此刻的真实位置判的，而画面上的
 * 它们是 140ms 之前的样子。对向车相对速度 70 m/s，这 140ms 就是十来米——已经
 * 足够让玩家"还没看见车贴上来就飞了"，或者"明明从车缝里钻过去却撞了"。车手补得少
 * 一点（同样是那一个时刻，但他们彼此之间几乎不同向差速），所以补多补少都看不太出来；
 * 不补的代价见 `leadRacers`：
 * 打击判定本来就回到玩家看见的那一刻（`history.mjs`），画得晚不吃亏，而人是要
 * 摔车、要急刹的，补错了反而更花。
 *
 * 补帧只动位置，不改任何状态：这一串对象是每帧新解出来的，改它不会漏回快照。
 */
function leadCarriage(list, axis, state, seconds) {
  if (!(seconds > 0)) return;
  for (const e of list) {
    if (e.state !== state || !Number.isFinite(e.v) || !Number.isFinite(e.dir)) continue;
    e[axis] += e.dir * e.v * seconds;
  }
}

/**
 * 名次：冲过线的按 **冲线时刻** 排，没冲线的按 **已跑距离** 排。
 * 与服务端 `settle()` 用同一条规矩——两边不一致的话，画面上的名次会在冲线瞬间跳一下。
 */
function order(racers) {
  racers.sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.z - a.z;
  });
  racers.forEach((r, i) => { if (!r.finished) r.rank = i + 1; });
}

/**
 * 这一刻该渲染**世界时间轴上的哪一点**——整套平滑的关键就在这里。
 *
 * 判据只有一条：**头离"理想位置"有多远**。理想位置 = 最新一帧的世界时间再往回
 * 退 `INTERP_DELAY`，也就是"抖动余量刚好用满"的那一点。规矩是：
 * 偏差在 15ms 以内走 1.0 倍速；落后最多提到 1.25 倍把位置挣回来；超前最多降到
 * 0.5 倍——减速比加速狠，因为"撞上数据边缘"是唯一会直接变成卡顿的情况。
 */
function renderHead(S, snap) {
  const now = performance.now();
  const dt = Math.min((now - (S.headAt || now)) / 1000, 0.25);
  let tm = S.headTm || (snap.tm - INTERP_DELAY);
  const err = snap.tm - INTERP_DELAY - tm;
  // 掉队半秒以上（切标签页、被系统冻结）就别慢慢爬了，直接对齐。
  if (err > 0.25) tm = snap.tm - INTERP_DELAY;
  else tm += dt * rateFor(err);
  // 头绝不能跑到最新一帧前面：那里没有数据，硬走只能靠外推，外推的方向一错
  // 就是一次"拽回"。留 20ms 余量，让插值永远落在两个真实快照之间。
  const limit = snap.tm - 0.02;
  if (tm > limit) tm = limit;
  S.headTm = tm; S.headAt = now;
  return tm;
}

function rateFor(err) {
  const mag = Math.abs(err);
  if (mag < 0.015) return 1;
  const over = Math.min(mag - 0.015, 0.2);
  const cap = err > 0 ? 0.25 : 0.5;
  return 1 + Math.sign(err) * Math.min(cap, over * (err > 0 ? 1.2 : 2.5));
}
