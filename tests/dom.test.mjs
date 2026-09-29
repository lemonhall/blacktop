/**
 * DOM 契约：前端脚本里 `$("xxx")` 提到的每个 id，index.html 里都必须真的存在。
 *
 * 为什么值得单独一个测试：这套前端有十几个模块跨文件引用同一份被抽取出来的标记，
 * 打错一个 id 在浏览器里只表现为"某个按钮点了没反应"，非常难查但极度容易发生。
 * 一条正则扫过去，就能在 `node --test` 阶段把它按住。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const html = readFileSync(path.join(ROOT, "web", "index.html"), "utf8");
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/gu)].map(m => m[1]));

const modules = readdirSync(path.join(ROOT, "web", "js"))
  .filter(name => name.endsWith(".mjs"))
  .map(name => ({ name, source: readFileSync(path.join(ROOT, "web", "js", name), "utf8") }));

test("index.html 里有房间浏览器、候场名册与竞技场这三屏", () => {
  for (const id of ["rooms", "roomList", "createPanel", "roomBanner", "rosterPanel", "lobby", "arena", "results"]) {
    assert.ok(ids.has(id), `index.html 缺少 #${id}`);
  }
});

/**
 * 1996 那版的家伙系统在界面上有三个落点，少一个玩家就只能靠猜：
 * **HUD 上"我腰里有什么"、键位小字里的换家伙、触屏上的换械按钮**。
 */
test("家伙系统在界面上说得清楚：牌子、键位、触屏按钮一个都不能少", () => {
  assert.ok(ids.has("hudBelt"), "HUD 缺一行显示腰里那几件");
  assert.match(html, /<kbd>Q<\/kbd>/u, "键位与帮助里必须写出换家伙的键");
  assert.match(html, /data-hold="cycle"/u, "触屏上没有换械按钮，手机玩家就没法换家伙");
  assert.match(html, /data-hold="punchBack"/u, "回身打的按钮不能丢");
});

test("脚本引用的每一个 DOM id 都在标记里存在", () => {
  const missing = [];
  for (const { name, source } of modules) {
    for (const [, id] of source.matchAll(/\$\(\s*"([a-zA-Z][\w-]*)"\s*\)/gu)) {
      if (!ids.has(id)) missing.push(`${name} → #${id}`);
    }
    for (const [, id] of source.matchAll(/getElementById\(\s*"([a-zA-Z][\w-]*)"\s*\)/gu)) {
      if (!ids.has(id)) missing.push(`${name} → #${id}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("标记引用的样式表与脚本都真的存在", () => {
  const assets = [...html.matchAll(/(?:href|src)="(\/[^"]+)"/gu)].map(m => m[1]);
  assert.ok(assets.length >= 3);
  for (const asset of assets) {
    const file = path.join(ROOT, "web", asset.slice(1));
    assert.doesNotThrow(() => readFileSync(file), `静态资源缺失：${asset}`);
  }
});

/**
 * 前端模块的 import 分两类，都必须落在 `web/` 里真的存在：
 *
 *   1. `/sim/x.mjs` —— 站点绝对路径，浏览器就是从这个地址取共享内核；
 *   2. `./x.mjs` 和 `../sim/x.mjs` —— 相对路径。允许它们的原因只有一个：像
 *      `web/js/predict.mjs` 这种"预测 + 对账"的核心逻辑要被 Node 测试直接 import
 *      去跑（手感问题只有能被自动化量出来才算修好），而 Node 不认识站点绝对路径。
 *      相对路径在浏览器里等价：`web/sim` 就是 `sim` 的构建副本，都在 web/ 根下。
 *
 *   3. `../../sim/x.mjs` —— 这一种要单独说，因为它是个"同一份文件的两个地址"。
 *      URL 规范化不许往上翻出站点根：`/js/predict.mjs` 再往上一层还是 `/`，所以
 *      `../../sim/x.mjs` 在浏览器里就是 `/sim/x.mjs`；而在 Node 里它落到仓库根的
 *      `sim/`——正是 `web/sim/` 的那份正本（build 每回都从它拷过去）。两个地址、
 *      一份内容，于是渲染层的代码第一次能被 `node --test` 直接 import 进来跑。
 *
 * 所以这条测试守的是**可解析性**：每个本地引用都要落到 `web/` 或仓库根的 `sim/`
 * 里真存在的一份文件，缺了就说明前端会在运行时 404——不管它写的是哪一类路径。
 */
test("前端模块的每一个本地 import 都指向 web/ 里真实存在的文件", () => {
  const missing = [];
  for (const { name, source } of modules) {
    const fromDir = path.join(ROOT, "web", "js", path.dirname(name));
    for (const [, spec] of source.matchAll(/from\s+"(\/sim\/[^"]+|\.\.?\/[^"]+)"/gu)) {
      const target = spec.startsWith("/sim/")
        ? path.join(ROOT, "web", spec.slice(1))
        : path.resolve(fromDir, spec);
      const inWeb = target.startsWith(path.join(ROOT, "web"));
      const inKernel = target.startsWith(path.join(ROOT, "sim"));
      assert.ok(inWeb || inKernel, `${name} → ${spec} 落到了 web/ 与 sim/ 之外`);
      try { readFileSync(target); } catch { missing.push(`${name} → ${spec}`); }
    }
  }
  assert.deepEqual(missing, [], "前端模块引到了不存在的文件，运行时会 404");
});
