/**
 * 冒烟测试的公共底座：**极简 HTTP / WebSocket 客户端 + 断言记录**。
 *
 * 单独成文件是因为两件事都要用它：房间与对局那条主线（`smoke-room.mjs`），
 * 以及多租户隔离那条线（`smoke-tenant.mjs`）。它们跑在同一个进程里、共用同一份
 * 结果表，所以"入口"（`smoke.mjs`）只负责按顺序调用、打印、定出口码。
 *
 * 这里刻意不引任何第三方库：一个两百行的冒烟脚本不该先 `npm i` 一堆东西。
 */

import { readFileSync } from "node:fs";

export { decodeMap, mineIn } from "../sim/wire.mjs";

export const BASE = (process.env.SMOKE_BASE || process.env.BLACKTOP_API || "http://127.0.0.1:8790").replace(/\/+$/u, "");
export const TENANT = process.env.SMOKE_TENANT || "neon";
export const WS_BASE = BASE.replace(/^http/u, "ws");

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const results = [];

export function check(name, ok, note = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "✔" : "✘"} ${name}${note ? ` — ${note}` : ""}`);
}

/** 只报"跳过"不算失败：需要管理员密钥的用例在没有密钥时不该把整个冒烟搞红。 */
export function skip(name, why) {
  results.push({ name, ok: true, skipped: true });
  console.log(`○ ${name} — 跳过：${why}`);
}

export async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* 有些响应没有 body */ }
  return { status: res.status, data };
}

/** 极简 WebSocket 客户端：消息先进队列，"等某条消息"可以先到先取、也可以等未来。 */
export function connect(url) {
  const ws = new WebSocket(url);
  const queue = [];
  const waiters = [];
  // 超时的报错里必须能看出是"连接断了"还是"服务端压根没发"——否则每次偶发都得重新猜。
  let closedCode = null;
  ws.addEventListener("close", ev => { closedCode = ev.code; });
  ws.addEventListener("message", ev => {
    let msg;
    try { msg = JSON.parse(String(ev.data)); } catch { return; }
    const hit = waiters.findIndex(w => w.match(msg));
    if (hit >= 0) { const [w] = waiters.splice(hit, 1); clearTimeout(w.timer); w.resolve(msg); return; }
    queue.push(msg);
  });
  const next = (match, ms = 5000) => {
    const hit = queue.findIndex(match);
    if (hit >= 0) return Promise.resolve(queue.splice(hit, 1)[0]);
    return new Promise((resolve, reject) => {
      const w = { match, resolve, timer: setTimeout(() => {
        const i = waiters.indexOf(w);
        if (i >= 0) waiters.splice(i, 1);
        reject(new Error(`等待消息超时${closedCode === null ? "" : `（连接已被关闭 code=${closedCode}）`}`));
      }, ms) };
      waiters.push(w);
    });
  };
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve("open"));
    ws.addEventListener("close", ev => reject(new Error(`closed ${ev.code}`)));
    ws.addEventListener("error", () => reject(new Error("WebSocket 连不上")));
  });
  return { ws, next, opened, send: payload => ws.send(JSON.stringify(payload)) };
}

export const guest = name => api(`/v1/${TENANT}/guest`, { method: "POST", body: { name } });

/**
 * 管理员密钥：注册租户要它。
 *
 * 本地 `wrangler dev` 的密钥在 `.dev.vars` 里（不入库），线上在 Worker 的 secret 里。
 * 探测顺序是"环境变量优先、其次文件"——CI 里注入环境变量，本机直接读文件。
 */
export function adminKey() {
  if (process.env.ADMIN_KEY) return process.env.ADMIN_KEY;
  try {
    const text = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
    const line = text.split(/\r?\n/u).find(l => l.trim().startsWith("ADMIN_KEY="));
    return line ? line.slice(line.indexOf("=") + 1).trim() : "";
  } catch { return ""; }
}

/**
 * 目标租户不存在就顺手注册一个。
 *
 * 为什么需要它：全新克隆下来的仓库，本地 D1 是空的，直接跑冒烟会全线 404；
 * 而"先手打三条 curl 才能开始测"这种事最容易让下一个人放弃。注册是**幂等意图**
 * 写在判断里的：租户能列出房间就什么都不做。
 */
export async function ensureTenant(id) {
  const listed = await api(`/v1/${id}/rooms`);
  if (listed.status !== 404) return true;
  const key = adminKey();
  if (!key) return false;
  const created = await api("/v1/tenants", {
    method: "POST", token: key, body: { id, displayName: `冒烟租户 ${id}` },
  });
  return created.status === 201;
}
