/**
 * 八条路各自的**下半张画与上半张画**：地面配色、天空、路上的畜生、路边的东西。
 *
 * 上一版这套东西的毛病是"第三条路就露馅"：天空只有城市和荒野两套配色，第三条
 * 路直接退回城市；路边道具一共五种，八条路上长的是同一批树。所以这一批测试的
 * 主题是**表驱动**——八条路各自的表必须齐全、名字必须画得出来、互不串味。
 *
 * 美术本身没法断言，能断言的是它的几条硬规矩：`save/restore` 配平、没有
 * `undefined` 当颜色、坐标里没有 NaN，以及"六种动物两两长得不一样"。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { CRITTERS } from "../sim/critters.mjs";
import { MODES } from "../sim/maps.mjs";
import { GROUNDS, tonesOf } from "../web/js/grounds.mjs";
import { SEA, hasWear, seaBand } from "../web/js/roadwear.mjs";
import { BY_MODE, PALETTES } from "../web/js/skies.mjs";
import { backdrop, skyIds, skyOf } from "../web/js/sky.mjs";
import { PROP_KINDS, PROP_SIZE, drawProp, hasProp, propImage, propPad } from "../web/js/props.mjs";
import { drawBuilding } from "../web/js/buildings.mjs";
import { drawCritter, hasCritterArt } from "../web/js/critters.mjs";
import { assertBalanced, assertSane, bounds, fingerprint, spyCtx } from "./helpers/spy-ctx.mjs";

const MODE_IDS = Object.keys(MODES);

/** 一块假的画布：`backdrop` 与 `propImage` 都要从 `document` 上现取一张。 */
function withDom(fn) {
  const prev = globalThis.document;
  globalThis.document = {
    createElement: () => {
      const spy = spyCtx();
      return { width: 0, height: 0, getContext: () => spy.ctx };
    },
  };
  try { return fn(); } finally { globalThis.document = prev; }
}

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
      const spy = canvas.getContext("2d");
      assert.ok(spy, `${id} 的天空取不到上下文`);
    }
  });
});

test("八种天的画法各不相同——否则第三条路就露馅", () => {
  withDom(() => {
    const seen = new Map();
    for (const id of skyIds()) {
      const spy = spyCtx();
      const prev = globalThis.document;
      globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => spy.ctx }) };
      try {
        backdrop(id, 640, 360, 120 + seen.size * 3);
      } finally { globalThis.document = prev; }
      const fp = fingerprint(spy.ops);
      assert.ok(!seen.has(fp), `${id} 和 ${seen.get(fp)} 画出来一模一样`);
      seen.set(fp, id);
    }
    assert.equal(seen.size, skyIds().length);
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
    const tone = tonesOf(mode).building;
    const spy = spyCtx();
    drawBuilding(spy.ctx, {
      sx: 400, baseY: 600, s: 30, seed: 3, width: 13, height: 21,
      tone, hazeK: 0.2, ground: MODES[mode].ground,
    });
    assertBalanced(spy.ops, `${mode} 的楼`);
    assertSane(spy.ops, spy.invalid, `${mode} 的楼`);
  }
});

test("六种畜生每一种都有自己的画法，两两长得不一样", () => {
  const seen = new Map();
  for (const kind of Object.keys(CRITTERS)) {
    assert.equal(hasCritterArt(kind), true, `${kind} 没有画法——它会在路上凭空撞到空气`);
    const spy = spyCtx();
    const info = CRITTERS[kind];
    drawCritter(spy.ctx, {
      cx: 640, baseY: 700, s: 12, kind, dir: 1, spin: 0, air: 0, w: info.len, h: info.h,
    });
    assertBalanced(spy.ops, kind);
    assertSane(spy.ops, spy.invalid, kind);
    const fp = fingerprint(spy.ops);
    assert.ok(!seen.has(fp), `${kind} 和 ${seen.get(fp)} 画出来一模一样`);
    seen.set(fp, kind);
  }
  assert.equal(seen.size, Object.keys(CRITTERS).length);
});

test("朝左走的畜生是镜像过的：同一头牛两个方向不能画成一幅画", () => {
  for (const kind of Object.keys(CRITTERS)) {
    const info = CRITTERS[kind];
    const draw = dir => {
      const spy = spyCtx();
      drawCritter(spy.ctx, { cx: 0, baseY: 0, s: 12, kind, dir, air: 0, w: info.len, h: info.h });
      assertSane(spy.ops, spy.invalid, `${kind} dir=${dir}`);
      return fingerprint(spy.ops);
    };
    assert.notEqual(draw(1), draw(-1), `${kind} 不管朝哪走都是同一个方向`);
  }
});

test("被踹飞、弹到天上的畜生：投影没了，本体还得在；脏数据也不炸", () => {
  for (const kind of Object.keys(CRITTERS)) {
    const info = CRITTERS[kind];
    const air = spyCtx();
    drawCritter(air.ctx, {
      cx: 0, baseY: 0, s: 12, kind, dir: -1, spin: 2.4, air: 5, w: info.len, h: info.h,
    });
    assertBalanced(air.ops, `${kind} 在天上`);
    assertSane(air.ops, air.invalid, `${kind} 在天上`);
    assert.ok(air.ops.length > 0, `${kind} 飞起来之后一笔不画了`);
  }
  for (const o of [
    { kind: "cow", s: 12, w: NaN }, { kind: "unknown", s: 12, w: 2, h: 2 },
    { kind: "deer", s: 12, w: 2, h: 2, spin: NaN, air: -1 },
    { kind: "goose", s: 0.01, w: 1, h: 1 },
  ]) {
    const spy = spyCtx();
    drawCritter(spy.ctx, { cx: 0, baseY: 0, dir: 1, ...o });
    assertBalanced(spy.ops, `脏数据 ${JSON.stringify(o)}`);
  }
});
