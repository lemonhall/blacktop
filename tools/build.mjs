/**
 * 构建：把共享内核复制进静态站点，再把后地址注入成构建期常量。
 *
 * 为什么是"复制"而不是"打包"：`sim/` 里的模块是**服务端和浏览器同时** import 的
 * 纯 ES 模块，没有依赖、没有转译需求。一个 30 行的复制循环比引入 Vite/Rollup
 * 更透明——构建产物就是你写的文件，打开 DevTools 能一行行对上。
 *
 * 产物直接落在 `web/`：它既是 Cloudflare 静态资源目录，也是 Vercel 的输出目录。
 * 同一份产物部署到两个地方，这正是"前端能换成任何静态托管"的具体含义。
 */

import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { assembleSite } from "./assemble-html.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const SIM = path.join(ROOT, "sim");
const WEB = path.join(ROOT, "web");
const WEB_SIM = path.join(WEB, "sim");
const JS = path.join(WEB, "js");

const api = (process.env.BLACKTOP_API || "").replace(/\/+$/u, "");

/** 1. 共享内核：服务端 import `../sim/x.mjs`，浏览器 import `/sim/x.mjs`，同一份文件。 */
rmSync(WEB_SIM, { recursive: true, force: true });
mkdirSync(WEB_SIM, { recursive: true });
let copied = 0;
for (const name of readdirSync(SIM)) {
  if (!name.endsWith(".mjs")) continue;
  cpSync(path.join(SIM, name), path.join(WEB_SIM, name));
  copied++;
}

/** 2. 构建期注入的后端地址：同源部署留空，跨域部署（Vercel → Workers）写绝对地址。 */
const banner = [
  "/**",
  " * 构建期常量，由 `tools/build.mjs` 生成——**不要手工改这个文件**。",
  " * 改 `BLACKTOP_API` 环境变量再跑一次构建即可。",
  " */",
  "",
].join("\n");
writeFileSync(path.join(JS, "env.mjs"), `${banner}export const BUILD_API = "${api}";\n`, "utf8");

/**
 * 3. 便宜但有用的检查：静态站点引用的每一个共享内核模块都必须真的复制过去了。
 *
 * 三种写法都要认：`/sim/x.mjs`（写死的绝对路径）、`../sim/x.mjs`、`../../sim/x.mjs`
 * （相对路径）。后两种在浏览器里解析出来**仍然是 `/sim/x.mjs`**（URL 解析过不了
 * 站点根），而 `node --test` 会把它们引到源码目录——渲染层因此第一次可测。
 * 检查的口径统一成"取路径里的 `sim/…` 那一段，看它在 `web/` 下存不存在"。
 */
const missing = [];
for (const name of readdirSync(JS)) {
  if (!name.endsWith(".mjs") || name === "env.mjs") continue;
  const source = readFileSync(path.join(JS, name), "utf8");
  for (const [, spec] of source.matchAll(/from\s+"(?:\.\.\/)*\/?(sim\/[^"]+)"/gu)) {
    const file = path.join(WEB, spec);
    try { readFileSync(file); } catch { missing.push(`${name} → ${spec}`); }
  }
}
if (missing.length) {
  console.error("以下共享内核引用没有对应的文件，前端会在运行时 404：");
  for (const item of missing) console.error("  " + item);
  process.exit(1);
}

/**
 * 4. 拼 `web/index.html`：真源码是 `web/parts/` 下那一堆"一块屏幕一个文件"。
 * 产物照样入库——`vercel.json` 只把 `web/` 当静态目录上传，不跑构建，
 * 所以提交进去的那一份必须永远是最新的。忘了重拼有测试兜底。
 */
const html = assembleSite();
writeFileSync(path.join(WEB, "index.html"), html, "utf8");

console.log(`共享内核   ${copied} 个模块 → web/sim/`);
console.log(`后端地址   ${api || "(同源)"}`);
console.log(`站点入口   web/index.html（由 web/parts/ 的 ${readdirSync(path.join(WEB, "parts")).length - 1} 块拼成）`);
