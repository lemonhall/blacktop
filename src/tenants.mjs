/**
 * 多租户注册表（D1）。一个 Cloudflare 账号 = 一个 Worker 部署 = 多个租户，
 * 每个租户有自己的 server key、房间上限、允许来源。
 *
 * 隔离是"名字空间级"的：Durable Object 的名字里带 tenant，所以租户 A 的房间
 * 与租户 B 的房间是两个不同的对象实例，不存在"查错库"的可能。
 */

import { randomKey, sha256Hex } from "./auth.mjs";

const DEFAULT_RULES = {
  maxRooms: 20,
  // 这里给的是"租户允许的上限"，不是每个模式的实际上限。赛车的满员是
  // 15 台（1 名玩家 + 14 个对手，见 `sim/data.mjs` 的 MAX_RACERS），
  // 而**真人的上限是 2**——再多就该去开第二个房间了。
  // 这两个数写成"模式上限"是错的方向：房主想开一场 1v1 就不要机器人，
  // 想开满员就把机器人拉满，调节权在他手里。
  maxHumansPerRoom: 2,
  maxBotsPerRoom: 13,
  allowGuestSessions: true,
  allowedOrigins: ["*"],
};

export async function getTenant(env, id) {
  const row = await env.DB.prepare("SELECT * FROM tenants WHERE id = ?").bind(id).first();
  if (!row) return null;
  return { ...row, rules: { ...DEFAULT_RULES, ...JSON.parse(row.rules || "{}") } };
}

export async function listTenants(env) {
  const { results } = await env.DB.prepare("SELECT id, display_name, created_at FROM tenants ORDER BY id").all();
  return results || [];
}

export async function createTenant(env, { id, displayName, serverKey }) {
  const key = serverKey || randomKey(24);
  await env.DB
    .prepare("INSERT INTO tenants (id, display_name, server_key, rules, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, displayName || id, await sha256Hex(key), "{}", Date.now())
    .run();
  return { id, displayName: displayName || id, serverKey: key };
}

/** 校验请求携带的凭据是不是这个租户的 server key。 */
export async function isServerKey(env, tenant, token) {
  if (!tenant || !token) return false;
  return (await sha256Hex(token)) === tenant.server_key;
}

export async function ensureSchema(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS tenants (
       id TEXT PRIMARY KEY, display_name TEXT NOT NULL, server_key TEXT NOT NULL,
       rules TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL)`,
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS matches (
       id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, room_id TEXT NOT NULL, mode TEXT NOT NULL,
       seed INTEGER NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL,
       duration_ms INTEGER NOT NULL, winner TEXT, stats TEXT NOT NULL)`,
  ).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS matches_tenant ON matches(tenant_id, ended_at DESC)").run();
}

export { DEFAULT_RULES };
