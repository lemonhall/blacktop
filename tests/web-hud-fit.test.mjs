/**
 * 仪表舱的高度预算。
 *
 * 这块板压在画面下缘，而相机是追尾视角——它每高一点，挡掉的就是眼前那条路。
 * 线上原话："下面的那个速度表盘占用了太多高度了，很恶心，挡住了。"当时实测
 * （1280×800）整块 206px，屏幕高的四分之一；表盘 118px 撑起其中一大半。
 *
 * 真去量像素要有浏览器，那件事交给 `npm run e2e` 里那条"仪表舱只占屏幕下缘那一条"。
 * 这一份守的是**输入**：表盘尺寸、上弧高度、以及进度条与舱体之间那条不能破的间距。
 * 三个断点（桌面 / 触屏 / 窄屏）都要守——媒体查询是这类高度预算最容易漏掉的地方。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const RAW = readFileSync(path.join(ROOT, "web/styles/hud.css"), "utf8");
// 注释里也写着 `.dash-block` 这些名字，先摘掉，免得匹配到注释。
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//gu, "");

const at = (needle) => {
  const i = CSS.indexOf(needle);
  assert.ok(i >= 0, `hud.css 里找不到 ${needle}`);
  return i;
};
/** 三段：基础 / 触屏 / 窄屏。触屏那一段排在窄屏媒体查询前面。 */
const SECTIONS = {
  桌面: CSS.slice(0, at("html.touch-device")),
  触屏: CSS.slice(at("html.touch-device"), at("@media (max-width: 760px)")),
  窄屏: CSS.slice(at("@media (max-width: 760px)")),
};

/** 取一条规则的声明体：`选择器 { ... }`。 */
function decls(section, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const m = section.match(new RegExp(`${esc}\\s*\\{([^}]*)\\}`, "u"));
  assert.ok(m, `这一段里没有 ${selector} 这条规则`);
  return m[1];
}
/** 声明里某个属性的第一个数值（`padding: 18px 22px 6px` → 18，`calc(232px + …)` → 232）。 */
function px(block, prop) {
  const m = block.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*(?:calc\\(\\s*)?(-?[\\d.]+)px`, "u"));
  assert.ok(m, `${prop} 不是一条写死的 px`);
  return Number(m[1]);
}

test("表盘的三个断点都在预算里：桌面 96 以内，触屏、窄屏只会更小", () => {
  const size = (section) => px(decls(SECTIONS[section], ".dash-block canvas"), "width");
  const desk = size("桌面");
  assert.ok(desk <= 96, `桌面表盘 ${desk}px——这块板的高度大头，超过 96 就该重新算账`);
  assert.ok(size("触屏") <= desk, `触屏表盘 ${size("触屏")}px，比桌面还大`);
  assert.ok(size("窄屏") <= desk, `窄屏表盘 ${size("窄屏")}px，比桌面还大`);
});

test("导流罩上弧与上边距都不许长回去（那是占太多高度的另一半）", () => {
  const dash = decls(SECTIONS["桌面"], ".hud-dash");
  const m = dash.match(/border-radius:\s*50%\s*50%\s*0\s*0\s*\/\s*([\d.]+)px/u);
  assert.ok(m, "上弧不是那条横轴 50%、纵轴固定高度的椭圆弧了");
  assert.ok(Number(m[1]) <= 44, `上弧纵轴 ${m[1]}px——两边沉不下去，中间就白白多出一截`);
  assert.ok(px(dash, "padding") <= 22, "面板上边距又长回去了");
});

test("进度条必须让开仪表舱：两者叠在一起就是路被挡了两遍", () => {
  for (const section of ["桌面", "触屏", "窄屏"]) {
    const pad = px(decls(SECTIONS[section], ".hud-dash"), "padding");
    // 表盘探出罩子上沿（`margin-top` 是负的），所以它占掉的净高度是 上边距 + 表盘。
    const dial = px(decls(SECTIONS[section], ".dash-block canvas"), "width");
    const rail = px(decls(SECTIONS[section], ".progress-rail"), "bottom");
    assert.ok(rail >= pad + dial + 20,
      `${section}：进度条让在 ${rail}px 处，而仪表舱已经有 ${pad + dial}px，会叠上`);
  }
});
