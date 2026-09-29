/**
 * 路边道具的画法契约（`web/js/props.mjs` + `buildings.mjs` + 两本彩蛋）。
 *
 * 道具这一层有两件事必须自动管住：
 *
 *   1. **表里写了名字，就得有画法**。八条路各自写一份权重表，谁手滑写错一个词，
 *      画面上不会报错——那件东西只是**不出现**。所以"表里的名字"和"画笔的名单"
 *      必须对得上，这是最容易被忽略、也最难靠肉眼发现的一类漏。
 *   2. **贴图框必须装得下这幅画**。一件道具画的是一块固定大小的离屏画布，
 *      画到框外面的部分直接被切掉，画面上就是一条笔直的硬边。判据从画法本身量出来，
 *      所以画宽了会被抓、余量表忘了改也会被抓。
 *
 * 彩蛋（一条路一件）另加两条：八条路**各藏一件、互不重复**，而且真的会在路上
 * 出现——但出现率必须低到"几十件里混进去一件"，否则它就不是彩蛋，是布景。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { MODES } from "../sim/maps.mjs";
import { createTrack } from "../sim/track.mjs";
import { GROUNDS, tonesOf } from "../web/js/grounds.mjs";
import { PROP_KINDS, PROP_SIZE, drawProp, hasProp, propImage, propPad } from "../web/js/props.mjs";
import { drawBuilding } from "../web/js/buildings.mjs";
import * as eggWild from "../web/js/eggwild.mjs";
import * as eggWood from "../web/js/eggwood.mjs";
import * as eggCarve from "../web/js/eggcarve.mjs";
import * as eggUrban from "../web/js/eggurban.mjs";
import * as eggYard from "../web/js/eggyard.mjs";
import { withDom } from "./helpers/dom.mjs";
import { assertBalanced, assertSane, bounds, fingerprint, spyCtx } from "./helpers/spy-ctx.mjs";

const MODE_IDS = Object.keys(MODES);
/** 八件彩蛋的名字：**从画法的导出里取**，不从测试里再抄一遍。 */
const EGG_KINDS = [
  ...Object.keys(eggWild), ...Object.keys(eggWood),
  ...Object.keys(eggCarve),
  ...Object.keys(eggUrban), ...Object.keys(eggYard),
];

test("每一条路边上写的道具名字都真的画得出来", () => {
  for (const mode of MODE_IDS) {
    const scenery = MODES[mode].scenery || {};
    assert.ok(Object.keys(scenery).length > 0, `${mode} 路边什么都没有`);
    for (const kind of Object.keys(scenery)) {
      assert.ok(hasProp(kind), `${mode} 路边写着 ${kind}，可是没有画法`);
      assert.ok(PROP_SIZE[kind], `${kind} 没有尺寸——贴图和判定宽度都会退回默认值`);
    }
  }
});

test("三十九种道具每一种都画得出来，而且两两不是同一件", () => {
  assert.ok(PROP_KINDS.length >= 39, `道具只有 ${PROP_KINDS.length} 种`);
  const seen = new Map();
  for (const ground of Object.keys(GROUNDS)) {
    for (const kind of PROP_KINDS) {
      if (kind === "building") continue; // 楼房现画，走下面那条
      const [w, h] = PROP_SIZE[kind];
      const spy = spyCtx();
      drawProp(spy.ctx, ground, kind, w, h, 7);
      assertBalanced(spy.ops, `${ground}/${kind}`);
      assertSane(spy.ops, spy.invalid, `${ground}/${kind}`);
      assert.ok(spy.ops.length > 0, `${ground} 上的 ${kind} 一笔都没画`);
      if (ground !== "city") continue;
      const fp = fingerprint(spy.ops);
      assert.ok(!seen.has(fp), `${kind} 和 ${seen.get(fp)} 画出来一模一样`);
      seen.set(fp, kind);
    }
  }
  assert.equal(seen.size, PROP_KINDS.length - 1);
});

/**
 * 一件道具的贴图是一块**固定大小的画布**：画到框外面的部分会被直接切掉，画面上
 * 就是一条笔直的硬边。所以这不是审美问题，是"光锥只剩一小条""树冠被切平"这种事
 * 的成因。
 *
 * 判据**从画法本身量出来**，不是把 `PROP_PAD` 抄一遍：拿画笔轨迹量出这幅画真正
 * 占多宽，再看余量表够不够。所以它同时管两头——画宽了会被抓，余量表忘了改也会被抓。
 * 每边再留 `EDGE` 米的富余，因为轨迹里量不出描边宽度和渐变。
 */
const EDGE = 0.1;
/** 这件道具需要多少余量才装得下（往上取整到 0.05，省得表里是一串 3.86）。 */
const padFor = (widest, w) => Math.ceil((widest + EDGE) * 2 / w * 20) / 20;

test("三十九种道具都画在自己的贴图框里，画出去的部分会被裁掉", () => {
  const short = [], tooTall = [];
  for (const kind of PROP_KINDS) {
    if (kind === "building") continue; // 楼房不走贴图，现画
    const [w, h] = PROP_SIZE[kind];
    const spy = spyCtx();
    drawProp(spy.ctx, "city", kind, w, h, 7);
    const b = bounds(spy.ops);
    const [padX, padY] = propPad(kind);
    const half = w * padX / 2;
    const widest = Math.max(b.x1, -b.x0);
    if (half < widest + EDGE) {
      short.push(`${kind} 要 ±${(widest + EDGE).toFixed(2)} 米，框只有 ±${half.toFixed(2)}（横向余量该写 ${padFor(widest, w)}）`);
    }
    // 纵向同理：冒出去的部分是塔顶、树梢，齐头切下去最显眼
    const top = h * padY;
    if (top < b.y1 + EDGE) {
      tooTall.push(`${kind} 要 ${(b.y1 + EDGE).toFixed(2)} 米高，框只有 ${top.toFixed(2)}（纵向余量该写 ${padFor(b.y1, h)}）`);
    }
  }
  assert.deepEqual(short, [], `这些道具会把画出去的部分裁掉：\n  ${short.join("\n  ")}`);
  assert.deepEqual(tooTall, [], `这些道具比它声明的高度还高：\n  ${tooTall.join("\n  ")}`);
});

test("同一件道具换一条路就是另一种材质：木屋在雪原和沙漠里不该一个色", () => {
  const paint = ground => {
    const spy = spyCtx();
    drawProp(spy.ctx, ground, "lodge", PROP_SIZE.lodge[0], PROP_SIZE.lodge[1], 3);
    return new Set([...spy.fills, ...spy.strokes]);
  };
  const snow = paint("snow"), desert = paint("desert");
  const shared = [...snow].filter(c => desert.has(c)).length;
  assert.ok(shared < snow.size, "雪原和沙漠里的木屋用的是完全同一套颜色");
});

test("道具贴图按 (地面, 种类) 缓存：同一件取两次是同一张，换地面要重画", () => {
  withDom(() => {
    assert.equal(propImage("city", "lamp"), propImage("city", "lamp"));
    assert.notEqual(propImage("city", "lamp"), propImage("neon", "lamp"),
      "换了一条路还是同一张贴图——材质分化等于没做");
  });
});

test("楼房现画：八条路各自的墙色都能画，而且是按地面分化的", () => {
  for (const mode of MODE_IDS) {
    const spy = spyCtx();
    drawBuilding(spy.ctx, {
      sx: 400, baseY: 600, s: 30, seed: 3, width: 13, height: 21,
      tone: tonesOf(mode).building, hazeK: 0.2, ground: MODES[mode].ground,
    });
    assertBalanced(spy.ops, `${mode} 的楼`);
    assertSane(spy.ops, spy.invalid, `${mode} 的楼`);
  }
});

/** 扫若干颗种子跑完整一圈，数一数整条路上有多少件道具、其中几件是彩蛋。 */
function sweep(mode, seeds = 12) {
  let props = 0, eggs = 0, lapsWithEgg = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const track = createTrack({ seed, mode });
    let here = 0;
    for (const p of track.propsBetween(0, track.length)) {
      props++;
      if (EGG_KINDS.includes(p.kind)) { eggs++; here++; }
    }
    if (here > 0) lapsWithEgg++;
  }
  return { props, eggs, lapsWithEgg, laps: seeds };
}

test("八条路各藏一件彩蛋，互不重复，而且每一件都真的有画法", () => {
  assert.equal(EGG_KINDS.length, 8, `彩蛋有 ${EGG_KINDS.length} 件，八条路配不平`);
  const used = new Set();
  for (const mode of MODE_IDS) {
    const mine = Object.keys(MODES[mode].scenery).filter(k => EGG_KINDS.includes(k));
    assert.equal(mine.length, 1, `${mode} 身上有 ${mine.length} 件彩蛋：${mine.join("/")}——一条路一件`);
    assert.ok(!used.has(mine[0]), `${mine[0]} 被两条路共用，第二条路上看见它就不新鲜了`);
    used.add(mine[0]);
    assert.ok(hasProp(mine[0]), `${mode} 的彩蛋 ${mine[0]} 没有画法`);
  }
  assert.equal(used.size, EGG_KINDS.length, "有彩蛋画好了却没挂在任何路上");
});

/**
 * 出现率：**几十件道具里混进去一件**是设计意图，不是随便挑的数字。太常见就变成布景
 * （路边多一个雪人不新鲜），一辈子碰不上又等于白画。所以两头都夹住：跑一圈**大多
 * 数时候能碰上**，但占比不到百分之几。
 */
test("彩蛋真的会出现，而且只在几十件道具里混一件", () => {
  for (const mode of MODE_IDS) {
    const { props, eggs, lapsWithEgg, laps } = sweep(mode);
    assert.ok(props > 1000, `${mode} 一圈只有 ${props / laps} 件道具？`);
    assert.ok(eggs > 0, `${mode} 的彩蛋跑了 ${laps} 圈一次都没出现——画了等于没画`);
    assert.ok(lapsWithEgg >= laps / 3,
      `${mode} 只有 ${lapsWithEgg}/${laps} 圈碰得到彩蛋，太藏了`);
    const rate = eggs / props;
    assert.ok(rate > 0.004 && rate < 0.06,
      `${mode} 的彩蛋占了 ${(rate * 100).toFixed(2)}% 的道具，这不是彩蛋是布景`);
  }
});
