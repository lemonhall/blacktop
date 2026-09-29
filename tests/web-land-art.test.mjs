/**
 * 八条路各自的**下半张画与上半张画**：天空、地面配色、路肩痕迹、海。
 *
 * 上一版这套东西的毛病是"第三条路就露馅"：天空只有城市和荒野两套配色，第三条
 * 路直接退回城市；路边道具一共五种，八条路上长的是同一批树。所以这一批测试的
 * 主题是**表驱动**——八条路各自的表必须齐全、名字必须画得出来、互不串味。
 *
 * 路边道具的**画法**（含八件彩蛋）在 `web-prop-art.test.mjs`；路上那些畜生在
 * `web-critter-art.test.mjs`。这里只管"天、地、路面"这三层。
 *
 * 美术本身没法断言，能断言的是它的几条硬规矩：`save/restore` 配平、没有
 * `undefined` 当颜色、坐标里没有 NaN，以及"八条路两两长得不一样"。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { MODES } from "../sim/maps.mjs";
import { GROUNDS, tonesOf } from "../web/js/grounds.mjs";
import { SEA, hasWear, seaBand } from "../web/js/roadwear.mjs";
import { BY_MODE, PALETTES } from "../web/js/skies.mjs";
import { backdrop, skyIds, skyOf } from "../web/js/sky.mjs";
import { withDom } from "./helpers/dom.mjs";
import { assertBalanced, assertSane, fingerprint, spyCtx } from "./helpers/spy-ctx.mjs";

const MODE_IDS = Object.keys(MODES);

test("八条路八种天：每一种天都有自己的表，模式 id 也都指得到", () => {
  assert.equal(MODE_IDS.length, 8, "这一版是八条路");
  assert.deepEqual(skyIds().sort(), [...new Set(Object.values(BY_MODE))].sort(),
    "有的天建了表却没被任何一条路用上");
  for (const mode of MODE_IDS) {
    const sky = MODES[mode].sky || mode;
    assert.ok(PALETTES[sky], `${mode} 指到的天 ${sky} 没有表`);
    assert.equal(skyOf(mode), sky, `${mode} 的天色没跟着 maps 走`);
  }
  assert.equal(skyOf("tuesday"), "dusk", "不认识的名字要退回一套能画的，而不是 undefined");
});

test("八种天都画得出来，而且 save/restore 配平、没有 undefined 颜色", () => {
  withDom(() => {
    for (const [i, id] of skyIds().entries()) {
      // 每条路给自己一个不同的地平线高度：缓存键里带着它，顺带验"高度变了要重画"。
      const canvas = backdrop(id, 1280, 720, 300 + i * 7);
      assert.ok(canvas.width >= 2 && canvas.height >= 2, `${id} 的天空没画出来`);
      const spy = canvas.__spy;
      assertBalanced(spy.ops, `${id} 的天`);
      assertSane(spy.ops, spy.invalid, `${id} 的天`);
      assert.ok(spy.ops.length > 0, `${id} 的天一笔都没画`);
    }
  });
});

test("八种天的画法各不相同——否则第三条路就露馅", () => {
  withDom(() => {
    const seen = new Map();
    for (const id of skyIds()) {
      const fp = fingerprint(backdrop(id, 640, 360, 120 + seen.size * 3).__spy.ops);
      assert.ok(!seen.has(fp), `${id} 和 ${seen.get(fp)} 画出来一模一样`);
      seen.set(fp, id);
    }
    assert.equal(seen.size, skyIds().length);
  });
});

test("地平线高度进了缓存键：同一片天换个高度得重画一次", () => {
  withDom(() => {
    const low = backdrop("snow", 480, 270, 200);
    const high = backdrop("snow", 480, 270, 260);
    assert.notEqual(fingerprint(low.__spy.ops), fingerprint(high.__spy.ops),
      "地平线挪了六十像素而天空一笔没变——多半是把高度漏在缓存键外了");
  });
});

test("八种地面配色齐全：路面、路缘、车道线、路肩、雾、颗粒，一样都不能少", () => {
  assert.equal(Object.keys(GROUNDS).length, 8);
  for (const [id, tone] of Object.entries(GROUNDS)) {
    for (const key of ["road", "rumble", "shoulder"]) {
      assert.equal(tone[key].length, 2, `${id} 的 ${key} 不是两档——斑马纹会缺一格`);
      for (const c of tone[key]) assert.equal(typeof c, "string", `${id}.${key} 里有非颜色`);
    }
    for (const key of ["lane", "divider", "fog", "building", "haze", "grain"]) {
      assert.ok(tone[key], `${id} 少了 ${key}`);
    }
    assert.ok(tone.wet >= 0 && tone.wet <= 1, `${id} 的湿路面强度 ${tone.wet} 越界了`);
    // 轮胎痕的颜色**必须**在表里：漏了不会报错（`fillStyle = undefined` 是静默的），
    // 只会悄悄少画两道沟
    assert.match(tone.rut, /^rgba?\(/, `${id} 少了轮胎痕的颜色 rut（写 rgba 才压得住路面）`);
  }
});

test("八条路各自的路肩痕迹都画得出来：漏一条就会退回城市的水洼", () => {
  for (const id of Object.keys(GROUNDS)) {
    assert.equal(hasWear(id), true, `${id} 没有路肩痕迹——它会长得和城市一模一样`);
  }
  assert.equal(hasWear("nope"), false);
});

/**
 * 海是唯一一处"只画在屏幕半边"的东西，而它的多边形有一端**必然跑到画面外**。
 * 上一版就是在这里翻的车：近处几片的岸边点在屏幕右边之外、远点却在屏幕左边，
 * 一条多边形于是横跨整个画面，把路面涂成了一片水。判据很简单——凡是画出来的水，
 * 它的每一笔都必须落在岸线右边。
 */
test("海只铺在岸线右边；近处那几片整片跳过，不许横跨画面", () => {
  const slice = (ppm, x) => ({ x, hw: 100, rumble: 10, ppm, y: 400 });
  const geom = (far, near) => ({ far, near, yF: 380, yN: 620, z: 90 });
  const W = 1440;

  // 近景片：12.5 米外就是一千多像素外，岸线根本不在画面里 → 一个字都不许画
  const near = spyCtx();
  seaBand(near.ctx, "coast", geom(slice(240, 700), slice(300, 706)), W);
  assert.equal(near.ops.length, 0, "岸线在画面外的那一片不该画水");

  // 远景片：岸线在画面里 → 画，而且画出来的 x 全在岸线右侧
  const far = spyCtx();
  seaBand(far.ctx, "coast", geom(slice(22, 690), slice(26, 700)), W);
  assert.ok(far.ops.length > 0, "岸线明明在画面里，一滴水都没画");
  const shore = 700 + (100 + 10 + SEA.coast.from * 26);
  for (const [, args] of far.ops) {
    for (const v of args) {
      if (typeof v !== "number") continue;
      assert.ok(v >= shore - 2 || v <= W + 2, `水画到了岸线左边的 ${v}`);
    }
  }
  // 不是海的赛道：怎么喊都不画
  const dry = spyCtx();
  seaBand(dry.ctx, "desert", geom(slice(22, 690), slice(26, 700)), W);
  assert.equal(dry.ops.length, 0);
});

test("拿模式 id 或地面 id 都能取到配色，不认识的名字退回城市", () => {
  for (const mode of MODE_IDS) {
    assert.equal(tonesOf(mode), GROUNDS[MODES[mode].ground], `${mode} 取到的是别人的配色`);
  }
  assert.equal(tonesOf("open"), GROUNDS.open, "地面 id 也得认");
  assert.equal(tonesOf("地平线"), GROUNDS.city, "不认识的名字要退回一套能画的");
});
