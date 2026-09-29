/**
 * 冒烟支线：**多租户隔离**。
 *
 * 一个 Cloudflare 账号上要能同时运营好几个游戏（平台方自己的、别人委托的），
 * 所以"租户"不是装饰性的字段，而是真正的隔离边界。这条线只问四个问题：
 *
 *   1. 新租户能注册出来吗（免密钥的游客会话还发得出去吗）？
 *   2. A 租户的房间目录里看不看得见 B 租户的房间？
 *   3. A 租户的令牌闯 B 租户的房间，会不会被拦？
 *   4. 报一个不存在的租户，会不会被悄悄塞进默认租户？
 *
 * 第 4 条最容易被"好心"实现成回落默认值，而那正是会把两家客户的数据混在一起
 * 的那种 bug——所以宁可不给，也不能给错。
 */

import { WS_BASE, TENANT, check, skip, api, connect, guest, ensureTenant } from "./smoke-lib.mjs";

const OTHER = process.env.SMOKE_TENANT_B || "smoke-b";

export async function runTenant() {
  const ready = await ensureTenant(OTHER);
  if (!ready) {
    skip("多租户隔离", `租户 ${OTHER} 不存在，且本机没有 ADMIN_KEY（.dev.vars 或环境变量）`);
    return;
  }
  check("第二个租户可以注册并使用", true, `${TENANT} 与 ${OTHER} 并存于同一个 Worker`);

  const mine = await guest("甲租户车手");
  const theirs = await api(`/v1/${OTHER}/guest`, { method: "POST", body: { name: "乙租户车手" } });
  if (!mine.data?.token || !theirs.data?.token) {
    check("两边都能签发游客令牌", false, `${mine.status} / ${theirs.status}`);
    return;
  }

  const roomB = await api(`/v1/${OTHER}/rooms`, {
    method: "POST", token: theirs.data.token, body: { name: "乙租户的房", bots: 1, mode: "city" },
  });
  check("乙租户能建房", roomB.status === 201 && !!roomB.data?.roomId, `roomId=${roomB.data?.roomId}`);
  if (!roomB.data?.ok) return;

  // 目录隔离：各自只看各自的。房间 id 是随机短号，所以这里按 id 精确比对。
  const listA = await api(`/v1/${TENANT}/rooms`);
  const listB = await api(`/v1/${OTHER}/rooms`);
  check("甲租户的房间目录里没有乙租户的房间",
    !(listA.data?.rooms || []).some(r => r.id === roomB.data.roomId),
    `甲看到 ${listA.data?.rooms?.length ?? "?"} 间`);
  check("乙租户的目录里也只有自己的房间",
    (listB.data?.rooms || []).length === 1 && (listB.data?.rooms || [])[0].id === roomB.data.roomId);

  // 令牌隔离：自己人进得去，别人进不去。两条一起断言，否则"全都被拒"也会显得像通过。
  const url = id => `${WS_BASE}/v1/${OTHER}/rooms/${roomB.data.roomId}/socket?token=${encodeURIComponent(id)}`;
  const insider = connect(url(theirs.data.token));
  const insiderIn = await insider.opened.then(() => true).catch(() => false);
  check("乙租户的令牌进得去乙租户的房间", insiderIn);
  insider.ws.close();

  const intruder = connect(url(mine.data.token));
  const blocked = await intruder.opened.then(() => false).catch(() => true);
  check("甲租户的令牌闯乙租户的房间被拒（401）", blocked, "令牌里的租户与房间的租户必须一致");
  intruder.ws.close();

  const phantom = await api("/v1/no-such-tenant-xyz/rooms");
  check("不存在的租户是明确的 404，不会回落到默认租户",
    phantom.status === 404 && phantom.data?.error === "unknown_tenant",
    `${phantom.status} ${phantom.data?.error}`);
}
