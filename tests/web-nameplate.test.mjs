/**
 * **名字牌要贴住那个人。**
 *
 * 上线之后柠檬叔的一句话："车手上的那个名字，离车手头顶有点远啊，那个柠檬叔三个字。"
 * 上一版的数字是 `2.9 × 像素每米`——离地快三米，而车手连人带盔才 1.84 米高。
 * 于是名字飘在半空，和它下面那个人读起来是两件事：一个命名标签一旦和它的目标脱开，
 * 就不再是标签，只是一行碍眼的字。
 *
 * 这里钉的不是"好不好看"，而是三条**能算出来的**关系：
 *   1. 高过贴图的顶边（1.84 米）——压在盔上会糊成一块；
 *   2. 也没有多余的一截（贴着盔顶一两指头）——这就是这次要修的那件事；
 *   3. 全站只许有这一个出处：画名字的地方必须用 `NAME_H`，不许再有第二处魔数。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NAME_H } from "../web/js/render.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = p => readFileSync(path.join(ROOT, p), "utf8");

/** 车手贴图的顶边（米）：`web/js/sprites.mjs` 的 `BOX.y1`（头盔顶 1.776 + 余量）。 */
const SPRITE_TOP = 1.84;

test("名字牌高过盔顶，但只高一点点", () => {
  assert.ok(NAME_H > SPRITE_TOP, `名字牌压在头盔上了（${NAME_H} ≤ ${SPRITE_TOP}）`);
  assert.ok(NAME_H - SPRITE_TOP < 0.45,
    `名字牌离盔顶还有 ${(NAME_H - SPRITE_TOP).toFixed(2)} 米——这又飘起来了`);
});

test("换算到屏幕上也是一两指头：贴着车的时候大约几十像素，不是半个屏幕", () => {
  // 自己那台车在相机后 8.6 米处，900 像素高的窗口里约 131 像素/米（见 sprites.mjs）。
  for (const ppm of [40, 131, 209]) {
    const gap = (NAME_H - 1.776) * ppm;
    assert.ok(gap < 70, `每米 ${ppm} 像素时，名字离头盔 ${gap.toFixed(0)} 像素——太远了`);
  }
});

test("全站只有一个出处：画名字的地方用 NAME_H，没有第二处魔数", () => {
  const src = read("web/js/render.mjs");
  assert.match(src, /p\.sy - NAME_H \* p\.ppm/u, "名字牌必须由 NAME_H 摆位");
  assert.doesNotMatch(src, /2\.9 \* p\.ppm/u, "旧的 2.9 还留着——名字又会飘回半空");
});
