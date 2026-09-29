/**
 * 把 `web/parts/*.html` 拼成 `web/index.html`。
 *
 * 为什么要拆：`index.html` 原来有三百六十行，看着像一堵墙——改"候场"那一屏要在
 * 六百行的脑子里翻定位。拆成"一块屏幕一个文件"之后，每个文件都在两百行以内，
 * 找东西的成本从"顺着往下扫"变成"打开那个文件"。
 *
 * 为什么是"拼"而不是运行时 fetch：运行时加载意味着**首屏要等一次网络往返**，
 * 而且 E2E 与 `dom.test.mjs` 都得先等 DOM 长出来才能问它问题。构建期拼死，
 * 产物仍然是一个普通的静态 HTML 文件，谁都能直接打开看。
 *
 * 规则只有一条：外壳里那一行 `<!--include x.html-->` 会被换成一整个部件。
 * 拼完还会反查一遍——`parts/` 里没被用上的部件会直接报错，防的是"顺手加了一屏，
 * 忘了接到外壳上"。
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
export const PARTS = path.join(ROOT, "web", "parts");
export const INDEX = path.join(ROOT, "web", "index.html");

const INCLUDE = /^<!--include ([a-z0-9-]+\.html)-->$/gmu;
/** 换行统一成 LF：仓库里存的是 LF，工作区却可能被 git 拉成 CRLF。 */
const lf = s => s.replace(/\r\n/gu, "\n");
const read = file => lf(readFileSync(file, "utf8"));
/** 部件尾巴上的空行由外壳排，不然插槽上下会多出一串空行。 */
const trimEnd = s => s.replace(/\n+$/u, "");

export function assembleSite() {
  const used = new Set();
  const shell = read(path.join(PARTS, "shell.html"));
  const html = shell.replace(INCLUDE, (_, name) => {
    used.add(name);
    return trimEnd(read(path.join(PARTS, name)));
  });
  if (/<!--include /u.test(html)) {
    throw new Error("还有没替换掉的 `<!--include …-->`（插槽一行一个，名字只允许小写字母、数字和 -）");
  }
  const stray = readdirSync(PARTS)
    .filter(n => n.endsWith(".html") && n !== "shell.html" && !used.has(n));
  if (stray.length) throw new Error(`parts/ 里这些部件没有被外壳引用：${stray.join("、")}`);
  return html;
}
