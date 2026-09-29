/**
 * 房间的名册与权限：谁在房里、谁是房主、放几个机器人、能不能开跑。
 *
 * 这一层是**纯函数**，不碰 storage、不碰 socket。理由很实际：房间权限是最容易
 * 出安全漏洞的地方（谁能踢人、谁能改人数、谁能开局），把它抽成纯函数之后，
 * 每一条规则都能用一个 assert 钉死，不用起 workerd。
 *
 * 和射击版（fray）最大的差别：这里**没有队**。赛车各自为战，所以"选边"这一栏
 * 换成了"**选车**"——街霸 400 / 暴走 750 / 铁马 1200 是三种取舍，不是三级升级。
 * 除此之外的流程（举手、踢人、中途加入开关、房主开局）一模一样，因为它本来
 * 就是对的。
 */

import { clamp } from "../sim/constants.mjs";
import { BIKES, MODES } from "../sim/data.mjs";

export const PHASES = ["staging", "live", "over"];

/** 没给租户规则时的占位上限：比任何模式都大，但仍然是能写进 JSON 的普通数字。 */
const UNLIMITED = 99;

/**
 * 被房主踢掉之后多久不许再进同一个房间。
 *
 * 没有这道闸门，"踢人"就是一句空话：被踢的人重新点一下房间卡片就回来了，房主
 * 只能反复踢。十分钟是个刻意的短窗口——足够让房主把这一局进行下去，又不像
 * "封禁"那样需要一套申诉流程。
 */
export const KICK_BAN_MS = 10 * 60_000;

/**
 * 人数上限有两层：**租户规则**（这个租户允许开多大的局）和**模式上限**。
 * 生效值取两者较小的那个，并且两个原值都留在状态里——否则换模式再换回来，
 * 上限会被"取最小"一路吃到只剩个位数。
 */
export function createRoomState({
  tenant, roomId, name, mode = "city", difficulty = 1, bots = 13,
  hostId, hostName, maxHumans, maxBots, joinLive = true, now = Date.now(),
}) {
  const cfg = MODES[mode] || MODES.city;
  const humansRule = Number.isFinite(maxHumans) ? Math.max(1, maxHumans) : UNLIMITED;
  const botsRule = Number.isFinite(maxBots) ? Math.max(0, maxBots) : UNLIMITED;
  return {
    tenant, roomId,
    name: (name || "新房间").slice(0, 24),
    mode: cfg.id,
    difficulty: clamp(Math.floor(difficulty), 0, 2),
    bots: clamp(Math.floor(bots), 0, Math.min(botsRule, cfg.bots)),
    hostId, hostName: hostName || "",
    // 房主开的开关：比赛进行中允不允许真人进来补位。
    joinLive: joinLive !== false,
    phase: "staging",
    createdAt: now, updatedAt: now,
    humansRule, botsRule,
    maxHumans: Math.min(humansRule, cfg.maxHumans),
    maxBots: Math.min(botsRule, cfg.bots),
    members: [],
    // 踢过人之后记在这里（playerId → 时刻），重进时用它挡住。
    kicked: {},
    lastSeed: 0, results: null, startedAt: 0, endedAt: 0,
  };
}

/** 一场比赛最多几个真人。上限之上是"机器人补位"，不是"更多人挤进来"。 */
export const participantCap = state => (MODES[state.mode] || MODES.city).maxHumans + 0;

/** 禁令只值十分钟，顺手把过期的那几条丢掉——这个表不该跟着房间一起长。 */
function pruneKicks(state, now) {
  for (const id of Object.keys(state.kicked || {})) {
    if (now - state.kicked[id] >= KICK_BAN_MS) delete state.kicked[id];
  }
}

const clampBike = v => clamp(Math.floor(Number(v) || 0), 0, BIKES.length - 1);

export function addMember(state, { playerId, name, bike = 0, now = Date.now() }) {
  const existing = state.members.find(m => m.playerId === playerId);
  if (existing) {
    // 重连/刷新：名字可以改，车型保留他上次选的（除非这次明确传了）。
    existing.name = name || existing.name;
    if (Number.isFinite(bike)) existing.bike = clampBike(bike);
    state.updatedAt = now;
    return { ok: true, member: existing, rejoined: true };
  }
  pruneKicks(state, now);
  const until = (state.kicked || {})[playerId];
  if (until && now - until < KICK_BAN_MS) return { ok: false, error: "kicked" };
  // 满员一律拒绝，不管在哪个阶段：对局中"无限补位"会让两个人的比赛变成五个人。
  if (state.members.length >= state.maxHumans) return { ok: false, error: "room_full" };
  // 房主关掉中途加入之后，比赛进行中就不再收新人（重连的老成员在上面已经放行）。
  if (state.phase !== "staging" && !state.joinLive) return { ok: false, error: "join_closed" };
  const member = {
    playerId,
    name: (name || "玩家").slice(0, 16),
    bike: clampBike(bike),
    ready: false, joinedAt: now, readyAt: 0,
  };
  state.members.push(member);
  if (!state.hostId || !state.members.some(m => m.playerId === state.hostId)) {
    state.hostId = playerId;
    state.hostName = member.name;
  }
  state.updatedAt = now;
  return { ok: true, member, rejoined: false };
}

export function removeMember(state, playerId, now = Date.now()) {
  const before = state.members.length;
  state.members = state.members.filter(m => m.playerId !== playerId);
  if (state.members.length === before) return false;
  if (state.hostId === playerId) {
    // 房主走了就把钥匙交给**最早进来**的那个人，而不是随机一个——
    // 房主一言不合就退的时候，剩下的人不该抽签决定谁管事。
    const next = [...state.members].sort((a, b) => a.joinedAt - b.joinedAt)[0];
    state.hostId = next ? next.playerId : "";
    state.hostName = next ? next.name : "";
  }
  state.updatedAt = now;
  return true;
}

export const isHost = (state, playerId) => !!playerId && state.hostId === playerId;

/** 换车：每个人只能改自己的车，房主也不能替别人选。 */
export function setMemberBike(state, playerId, bike, now = Date.now()) {
  const member = state.members.find(m => m.playerId === playerId);
  if (!member || state.phase !== "staging") return false;
  if (!Number.isFinite(bike)) return false;
  member.bike = clampBike(bike);
  state.updatedAt = now;
  return true;
}

/**
 * 举手报到。**房主不需要 ready**——他的"开跑"按钮本身就是他的表态，
 * 再让他先点一次 ready 只是给开局加一道没意义的仪式。
 */
export function setReady(state, playerId, ready, now = Date.now()) {
  const member = state.members.find(m => m.playerId === playerId);
  if (!member || member.playerId === state.hostId) return false;
  member.ready = !!ready;
  member.readyAt = member.ready ? now : 0;
  state.updatedAt = now;
  return true;
}

/** 除了房主之外，还有谁没举手——界面用它显示"谁在磨蹭"，开局校验也用它。 */
export const pendingReady = state =>
  state.members.filter(m => m.playerId !== state.hostId && !m.ready);

/** 房主把人请出去，并记下"十分钟内别再进来"（见 KICK_BAN_MS）。 */
export function kickMember(state, playerId, now = Date.now()) {
  if (!state.members.some(m => m.playerId === playerId)) return false;
  state.kicked = { ...(state.kicked || {}), [playerId]: now };
  return removeMember(state, playerId, now);
}

export function setBots(state, count, now = Date.now()) {
  state.bots = clamp(Math.floor(count), 0, state.maxBots);
  state.updatedAt = now;
  return state.bots;
}

export function setConfig(state, patch, now = Date.now()) {
  if (patch.name !== undefined) state.name = String(patch.name).slice(0, 24);
  if (patch.joinLive !== undefined) state.joinLive = !!patch.joinLive;
  if (patch.mode !== undefined && MODES[patch.mode]) {
    state.mode = patch.mode;
    const cfg = MODES[state.mode];
    state.maxHumans = Math.min(state.humansRule ?? cfg.maxHumans, cfg.maxHumans);
    state.maxBots = Math.min(state.botsRule ?? cfg.bots, cfg.bots);
    state.bots = Math.min(state.bots, state.maxBots);
    // 换赛道就是换一场比赛：举手作废，房主得重新确认大家还在。
    for (const m of state.members) m.ready = false;
  }
  if (patch.difficulty !== undefined) state.difficulty = clamp(Math.floor(patch.difficulty), 0, 2);
  state.updatedAt = now;
  return state;
}

/**
 * 开跑的准入条件：至少两名参战者、不超编、且**所有非房主的真人都举过手**。
 *
 * 最后一条是必须的：房主按下的"开跑"只代表他自己，别人还在翻配置页的时候就被
 * 拖进比赛，是这套东西里最容易被骂的一个细节。
 */
export function startCheck(state) {
  const total = state.members.length + state.bots;
  if (state.members.length < 1) return { ok: false, error: "no_players" };
  if (total < 2) return { ok: false, error: "need_two" };
  if (total > state.maxHumans + state.maxBots) return { ok: false, error: "too_many" };
  const pending = pendingReady(state);
  if (pending.length) return { ok: false, error: "not_ready", pending: pending.map(m => m.name) };
  return { ok: true, total };
}

/** 回到候场：所有举手作废，大家重新表态（换赛道、再来一局都走这里）。 */
export function clearReady(state, now = Date.now()) {
  for (const m of state.members) m.ready = false;
  state.updatedAt = now;
}

/** 给 Room 用的名册：真人排前面（发车格靠前是给他们的体面），机器人补位。 */
export function rosterOf(state) {
  return state.members.map(m => ({
    kind: "human", ownerId: m.playerId, name: m.name, bike: m.bike,
  }));
}

export function publicView(state) {
  const cfg = MODES[state.mode] || MODES.city;
  return {
    id: state.roomId,
    name: state.name,
    mode: state.mode,
    modeName: cfg.name,
    difficulty: state.difficulty,
    phase: state.phase,
    humans: state.members.length,
    bots: state.bots,
    // 上限一律报**生效值**（租户规则与模式上限取小的那个）。报模式上限的话，
    // 一个"只允许 1 个真人"的租户会显示 1/2，快速匹配还会照 2 挑房间。
    capacity: state.maxHumans,
    host: state.hostName,
    join: state.joinLive !== false,
    ready: state.members.filter(m => m.ready).length,
    pending: pendingReady(state).length,
    updatedAt: state.updatedAt,
  };
}

/** 给玩家看的细节版。`now` 由调用方传进来——偷读 `Date.now()` 会让这一层不再是纯函数。 */
export function view(state, selfId, now = Date.now()) {
  const cfg = MODES[state.mode] || MODES.city;
  const me = state.members.find(m => m.playerId === selfId) || null;
  const pending = pendingReady(state);
  return {
    t: "room",
    id: state.roomId,
    name: state.name,
    ph: state.phase,
    mode: state.mode,
    modeName: cfg.name,
    sub: cfg.sub,
    trackDesc: cfg.desc,
    diff: state.difficulty,
    bots: state.bots,
    maxBots: state.maxBots,
    capacity: state.maxHumans,
    join: state.joinLive !== false,
    host: state.hostId,
    startedAt: state.startedAt,
    members: state.members.map(m => ({
      id: m.playerId, n: m.name, bike: m.bike,
      rdy: m.ready ? 1 : 0,
      // 磨蹭了多久（毫秒）。房主凭这个数决定要不要踢人——"等得久"要看得见，
      // 否则"踢掉那个不 ready 的"就只能凭印象。
      wait: m.ready || m.playerId === state.hostId ? 0 : Math.max(0, now - m.joinedAt),
      me: m.playerId === selfId ? 1 : 0,
    })),
    you: {
      id: selfId,
      host: isHost(state, selfId),
      ready: !!(me && me.ready),
      bike: me ? me.bike : 0,
    },
    // 界面据此决定"开跑"按钮亮不亮；真正的拒绝仍然发生在服务端。
    allReady: pending.length === 0,
    pending: pending.map(m => m.name),
    results: state.results,
  };
}
