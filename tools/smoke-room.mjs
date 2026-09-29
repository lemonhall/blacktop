/**
 * 冒烟主线：一间房从创建到结算的**服务端契约**。
 *
 * 不开浏览器，只用 HTTP + WebSocket 把"最小可玩一局"走一遍——E2E 那条线
 * （`tools/e2e-local.mjs`）验的是 UI 与渲染，这里验的是路由、线协议、房间闸门，
 * 几秒钟跑完，适合每次部署之后立刻自检。
 *
 * 它只负责跑用例；结果表、出口码、以及多租户那条线都在入口 `tools/smoke.mjs`。
 */

import {
  BASE, TENANT, WS_BASE, sleep, check, api, connect, guest, decodeMap, mineIn,
} from "./smoke-lib.mjs";

export async function runRoom() {
  const health = await api("/v1/health");
  check("健康检查", health.status === 200 && health.data?.ok === true,
    `${BASE} service=${health.data?.service}`);

  // 赛制表是前后端**唯一**的真相：前端的选择器从它渲染，后端建房时也用它校验。
  const meta = await api("/v1/meta");
  check("赛制表可读（赛道 / 车型 / 机器人满员数）",
    meta.status === 200 && meta.data?.modes?.length >= 1 && meta.data?.bikes?.length === 3
      && meta.data?.maxRacers === 15,
    `${meta.data?.modes?.map(m => m.id).join("/")} · 满员 ${meta.data?.maxRacers}`);

  const listed = await api(`/v1/${TENANT}/rooms`);
  check("房间目录可读", listed.status === 200 && Array.isArray(listed.data?.rooms),
    `租户 ${TENANT}，当前 ${listed.data?.rooms?.length ?? "?"} 个房间`);

  const hostUser = await guest("冒烟车手");
  check("游客令牌签发", hostUser.status === 200 && !!hostUser.data?.token);
  if (!hostUser.data?.token) return;
  const { token, playerId } = hostUser.data;

  // ---------------------------------------------------------------- 建房与目录
  const created = await api(`/v1/${TENANT}/rooms`, {
    method: "POST", token,
    body: { name: "冒烟房", bots: 3, mode: "city", difficulty: 1, joinLive: true },
  });
  check("建房成功，且机器人数量当场生效",
    created.status === 201 && created.data?.ok === true && created.data.room?.bots === 3,
    `roomId=${created.data?.roomId} bots=${created.data?.room?.bots}`);
  if (!created.data?.ok) return;
  const roomId = created.data.roomId;

  const again = await api(`/v1/${TENANT}/rooms`);
  check("新房立刻出现在目录里", (again.data?.rooms || []).some(r => r.id === roomId));

  const wild = await api(`/v1/${TENANT}/rooms`, {
    method: "POST", token, body: { name: "越野房", bots: 1, mode: "wild" },
  });
  check("赛道白名单生效（荒野公路）", wild.data?.room?.mode === "wild", `mode=${wild.data?.room?.mode}`);
  const bogus = await api(`/v1/${TENANT}/rooms`, {
    method: "POST", token, body: { name: "瞎填房", bots: 1, mode: "not-a-track" },
  });
  // 猜一条不存在的赛道比拒绝更糟：宁可不给，也不给错。
  check("乱填的赛道回落到默认赛道", bogus.data?.room?.mode === "city", `mode=${bogus.data?.room?.mode}`);

  // ---------------------------------------------------------------- 连接闸门
  const anon = connect(`${WS_BASE}/v1/${TENANT}/rooms/${roomId}/socket`);
  const anonDenied = await anon.opened.then(() => false).catch(() => true);
  check("不带令牌的 WebSocket 被拒", anonDenied);

  // 邀请链接会被人传来传去，散掉的房间必须得到一个干脆的"没有这一间"。
  const ghost = await api(`/v1/${TENANT}/rooms/ZZZZZZ/socket`, { token });
  check("过期邀请链接（房间不存在）被明确拒绝",
    ghost.status === 404 && ghost.data?.error === "unknown_room", `${ghost.status} ${ghost.data?.error}`);

  const host = connect(`${WS_BASE}/v1/${TENANT}/rooms/${roomId}/socket?token=${encodeURIComponent(token)}`);
  await host.opened;
  const hello = await host.next(m => m.t === "hello");
  check("握手后收到 hello 与名册",
    hello.you?.id === playerId && !!hello.room && hello.room.you.host === true,
    `房主=${hello.room?.host}`);

  host.send({ t: "bots", n: 5 });
  check("房主把机器人调到 5 个", !!(await host.next(m => m.t === "room" && m.bots === 5)));

  host.send({ t: "bike", b: 2 });
  const bike = await host.next(m => m.t === "room" && m.you.bike === 2, 5000).catch(() => null);
  check("选车（铁马 1200）被服务端记进名册", !!bike, `bike=${bike?.you?.bike}`);

  // ---------------------------------------------------------------- 举手与开局闸门
  const mateUser = await guest("冒烟陪练");
  const mate = connect(`${WS_BASE}/v1/${TENANT}/rooms/${roomId}/socket?token=${encodeURIComponent(mateUser.data.token)}`);
  await mate.opened;
  const mateHello = await mate.next(m => m.t === "hello");
  check("第二个真人进得来，名册两边一致",
    mateHello.room?.members?.length === 2 && mateHello.room.you.host === false,
    `名册 ${mateHello.room?.members?.length} 人`);
  const staged = await host.next(m => m.t === "room" && m.members.length === 2);
  check("候场名册里两个人都在，且都没举手",
    staged.members.every(m => m.rdy === 0) && staged.allReady === false);

  host.send({ t: "start" });
  const refused = await host.next(m => m.t === "error");
  check("有人没举手时，房主开不了局",
    refused.error === "not_ready" && (refused.pending || []).includes("冒烟陪练"),
    `pending=${JSON.stringify(refused.pending)}`);

  mate.send({ t: "ready", v: 1 });
  // 断言要锁住人数：房主自己进场时也广播过一条"1 人名册"，那时候 allReady
  // 天然是 true，不锁人数就会抓到那条旧消息（踩过一次）。
  const allReady = await host
    .next(m => m.t === "room" && m.members.length === 2 && m.allReady === true, 5000)
    .catch(() => null);
  check("陪练举手之后，两边都看到全员就绪",
    !!allReady && allReady.members.some(m => m.rdy === 1 && m.bike !== undefined), "allReady=true");

  // ---------------------------------------------------------------- 开跑
  const startedAt = Date.now();
  host.send({ t: "start" });
  const map = await host.next(m => m.t === "map");
  check("开局下发地图（种子 + 赛道 + 名册）",
    Number.isInteger(map.seed) && map.mode === "city" && map.lanes === 4 && map.roster.length >= 2,
    `seed=${map.seed} lanes=${map.lanes} 名册 ${map.roster.length}`);

  const first = await host.next(m => m.t === "s", 3000);
  check("开跑后 3 秒内有第一帧快照", true, `${Date.now() - startedAt}ms，tick=${first.tk}`);
  // 身份在名册里：快照只带短整型的车号，ownerId 一局只发一次。
  const roster = decodeMap(map).roster;
  const myId = [...roster.values()].find(m => m.ownerId === playerId)?.id ?? -1;
  const meFirst = mineIn(first, roster, playerId);
  check("快照里能看到我自己，且带回权威确认点",
    !!meFirst && Number.isFinite(meFirst.ak) && Number.isFinite(meFirst.az) && Number.isFinite(meFirst.av),
    `ack=${meFirst?.ak} @ z=${meFirst?.az}`);
  check("快照里没有别人的私有字段", first.r.filter(r => r.i !== myId).every(r => r.ak === undefined));

  const humans = first.r.filter(r => (roster.get(r.i) || {}).kind === "human").length;
  const bots = first.r.length - humans;
  check("人机同场：2 名真人 + 5 个机器人", humans === 2 && bots === 5, `真人 ${humans} / 机器人 ${bots}`);

  // ---------------------------------------------------------------- 车流与大运
  // 车流是"世界的东西"，挂在领跑者前面。两秒之内必然出现过一辆——参数在
  // `sim/data.mjs` 里（city 1.5 秒一轮），所以这条不是在赌运气。
  let traffic = 0, kinds = new Set();
  const trafficDeadline = Date.now() + 9000;
  while (Date.now() < trafficDeadline && traffic === 0) {
    const frame = await host.next(m => m.t === "s", 2500).catch(() => null);
    if (!frame) break;
    traffic = (frame.tr || []).length;
    for (const v of frame.tr || []) kinds.add(v[1]);
  }
  check("路上有车流（同向慢车 / 对向来车）", traffic > 0, `本帧 ${traffic} 辆 · 出现过 ${[...kinds].join("/")}`);

  // ---------------------------------------------------------------- 移动与对账
  let latest = first, sq = 0;
  const before = meFirst;
  const deadline = Date.now() + 12000;
  // 发车倒数 3.2 秒里油门是锁死的，所以要一直发到世界真的开始动。用**截止时间**
  // 而不是固定轮数：隔着代理连线上时单次往返可能几百毫秒。
  while (Date.now() < deadline) {
    sq++;
    // 新协议：一条命令自带序号与格数（25Hz 上行、60Hz 模拟 → 大约 2~3 格）。
    host.send({ t: "in", sq, th: 1, br: 0, st: 0, nos: 0, act: 0, n: 2 });
    await sleep(40);
    const frame = await host.next(m => m.t === "s" && m.tk > latest.tk, 1500).catch(() => null);
    if (frame) latest = frame;
    const now = mineIn(latest, roster, playerId);
    if (now && now.z - before.z > 60) break;
  }
  const after = mineIn(latest, roster, playerId);
  check("服务端认可我的移动（权威 z 坐标）", !!after && after.z - before.z > 60,
    `z ${before?.z} → ${after?.z}`);
  check("确认点跟着命令往前走（ack 单调递增）", (after?.ak | 0) > (before?.ak | 0),
    `ack ${before?.ak} → ${after?.ak}`);
  check("世界持续推进（tick 单调递增）", latest.tk > first.tk, `tick ${first.tk} → ${latest.tk}`);

  // 压车：一条 st=-1 的命令打完，x 应当往左偏。赛车手感的核心就是这一条链路。
  const xBefore = mineIn(latest, roster, playerId).x;
  for (let i = 0; i < 30; i++) {
    sq++;
    host.send({ t: "in", sq, th: 1, br: 0, st: -1, nos: 0, act: 0, n: 3 });
    await sleep(35);
    const frame = await host.next(m => m.t === "s" && m.tk > latest.tk, 1200).catch(() => null);
    if (frame) latest = frame;
  }
  const xAfter = mineIn(latest, roster, playerId).x;
  check("压车有效：一直按左，车确实往左偏", xAfter < xBefore - 1,
    `x ${xBefore} → ${xAfter}`);

  // ---------------------------------------------------------------- 踢人
  host.send({ t: "kick", id: mateUser.data.playerId });
  const gotKicked = await mate.next(m => m.t === "kicked", 5000).catch(() => null);
  check("被踢的人收到明确的 kicked 通知（不是一句冷冰冰的断线）", !!gotKicked);
  const afterKick = await host.next(m => m.t === "room" && m.members.length === 1, 5000).catch(() => null);
  check("踢完之后名册里只剩房主", !!afterKick);
  const back = connect(`${WS_BASE}/v1/${TENANT}/rooms/${roomId}/socket?token=${encodeURIComponent(mateUser.data.token)}`);
  back.opened.catch(() => {});
  const rejoin = await back.next(m => m.t === "error", 5000).catch(() => null);
  check("被踢的人十分钟内进不来", rejoin?.error === "kicked", `error=${rejoin?.error}`);

  // ---------------------------------------------------------------- 房主专属
  // 权限的真正边界在服务端：名册上那位已经不是房主了，所以他改配置、开跑、
  // 重开，服务端一律当没听见。
  const outsider = await guest("无关访客");
  const spy = connect(`${WS_BASE}/v1/${TENANT}/rooms/${roomId}/socket?token=${encodeURIComponent(outsider.data.token)}`);
  await spy.opened;
  await spy.next(m => m.t === "hello");
  spy.send({ t: "bots", n: 0 });
  const botsHeard = await spy.next(m => m.t === "room" && m.bots !== 5, 1200).catch(() => null);
  check("普通玩家改不动机器人数量", !botsHeard, botsHeard ? `居然变成了 ${botsHeard.bots}` : "服务端没理他");
  spy.ws.close();

  // ---------------------------------------------------------------- 谢客房
  // 房主关掉"允许中途加入"之后：开跑之前照收人，开跑之后新人被挡在门外。
  const shut = await api(`/v1/${TENANT}/rooms`, {
    method: "POST", token, body: { name: "谢客房", bots: 1, mode: "city", joinLive: false },
  });
  check("建房时能关掉中途加入", shut.status === 201 && shut.data?.room?.join === false,
    `join=${shut.data?.room?.join}`);
  if (shut.data?.ok) {
    const shutRoom = shut.data.roomId;
    const keeper = connect(`${WS_BASE}/v1/${TENANT}/rooms/${shutRoom}/socket?token=${encodeURIComponent(token)}`);
    await keeper.opened;
    await keeper.next(m => m.t === "hello");
    keeper.send({ t: "start" });
    await keeper.next(m => m.t === "map");
    await keeper.next(m => m.t === "s", 4000);
    const late = connect(`${WS_BASE}/v1/${TENANT}/rooms/${shutRoom}/socket?token=${encodeURIComponent(outsider.data.token)}`);
    late.opened.catch(() => {});
    const door = await late.next(m => m.t === "error", 5000).catch(() => null);
    check("开着谢客的对局里，新人被挡在门外", door?.error === "join_closed", `error=${door?.error}`);
    keeper.ws.close();
  }

  host.ws.close();
  await sleep(50);
}
