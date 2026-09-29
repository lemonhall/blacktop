/**
 * `web/index.html` 是**拼出来的**，这份测试盯着"拼出来的那一份"和 `web/parts/` 一致。
 *
 * 防的是这么一种事故：有人（或者某个 agent）改了 `parts/lobby.html`，本机跑得通，
 * 但忘了重新构建——于是仓库里提交的 `index.html` 还是旧的。这个项目里后果特别重：
 * `vercel.json` 把 `web/` 当纯静态目录上传，**Vercel 不跑构建**，线上用的就是提交
 * 进去的那一份。改了源码却没重拼，等于线上根本没变。
 *
 * 顺带钉住三条结构契约：
 *   - 每一块部件都在 300 行以内（拆开它的理由就是这个，得有人守着）；
 *   - 每一块部件都必须被外壳引用（加了一屏忘了接线，测试要红）；
 *   - `web/index.html` 里那份"这是生成的"告示不能丢，否则下一个人会直接改它。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { assembleSite, INDEX, PARTS } from "../tools/assemble-html.mjs";

const lf = s => s.replace(/\r\n/gu, "\n");
const parts = readdirSync(PARTS).filter(n => n.endsWith(".html"));

test("提交的那一份 web/index.html 就是现拼的那一份", () => {
  const built = lf(readFileSync(INDEX, "utf8"));
  assert.equal(built, assembleSite(),
    "web/index.html 和 web/parts/ 不一致——改了 parts 记得跑 `node tools/build.mjs`");
});

test("每一块部件都在三百行以内", () => {
  for (const name of parts) {
    const n = lf(readFileSync(path.join(PARTS, name), "utf8")).split("\n").length - 1;
    assert.ok(n <= 300, `${name} 有 ${n} 行，该再拆一层了`);
  }
});

test("外壳上写着「这是生成的」，插槽也一个不少", () => {
  const shell = lf(readFileSync(path.join(PARTS, "shell.html"), "utf8"));
  assert.match(shell, /这个文件是\*\*拼出来的\*\*/u, "生成的告示不能丢");
  const slots = [...shell.matchAll(/<!--include ([a-z0-9-]+\.html)-->/gu)].map(m => m[1]);
  assert.deepEqual(slots, ["rooms.html", "lobby.html", "arena.html", "results.html", "modals.html"]);
});

test("没有部件被落在外面", () => {
  const html = assembleSite();
  for (const name of parts) {
    if (name === "shell.html") continue;
    const first = lf(readFileSync(path.join(PARTS, name), "utf8")).split("\n").find(l => l.trim())?.trim();
    assert.ok(first && html.includes(first), `${name} 的内容没有出现在产物里`);
  }
});
