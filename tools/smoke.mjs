/**
 * 冒烟入口：**不开浏览器**，几秒钟确认这次部署还能不能玩。
 *
 *   node tools/smoke.mjs                                        # 默认打本机 127.0.0.1:8790
 *   $env:SMOKE_BASE='https://blacktop-api.lemonhall.me'; node tools/smoke.mjs
 *
 * 用例按关注点分成两个文件，共用 `smoke-lib.mjs` 的 HTTP/WS 客户端与结果表：
 *   - `smoke-room.mjs`   —— 一间房从建到结算的主线契约；
 *   - `smoke-tenant.mjs` —— 多租户隔离（一个账号上并存多个游戏）。
 *
 * 出口码：全过 0，有任何一条不过 1。
 */

import { BASE, TENANT, check, ensureTenant, results } from "./smoke-lib.mjs";
import { runRoom } from "./smoke-room.mjs";
import { runTenant } from "./smoke-tenant.mjs";

console.log(`—— BLACKTOP 冒烟 ——\n目标 ${BASE} · 主租户 ${TENANT}\n`);

// 全新克隆的仓库本地 D1 是空的，直接跑会全线 404；先在必要且有权限时把租户补上。
if (!(await ensureTenant(TENANT))) {
  console.log(`✘ 租户 ${TENANT} 不存在，且没有 ADMIN_KEY 能注册它（见 README 的"本地跑起来"）`);
  process.exit(1);
}

try {
  await runRoom();
  await runTenant();
} catch (error) {
  // 用例里的错误都自己接住了；能落到这里说明是脚本级的事故（连不上、协议对不上）。
  check("冒烟脚本自身没崩", false, String(error?.message || error));
}

const failed = results.filter(r => !r.ok);
console.log(`\n—— 冒烟结果 ——\n${results.length - failed.length} / ${results.length} 项通过`);
process.exit(failed.length ? 1 : 0);
