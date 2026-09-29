/**
 * 赛道与随机源：**同一颗种子在两台机器上必须算出同一条路**。
 *
 * 这是整条"服务器权威 + 客户端预测"链路的物理基础：客户端不是把路面当成
 * 服务器发来的数据，而是拿种子**自己算一遍**。所以这里测的不是"路好不好看"，
 * 而是"两遍算出来是不是逐位相同"。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createTrack, gridSlot } from "../sim/track.mjs";
import { hash2, cosmeticRng } from "../sim/rng.mjs";
import { MODES } from "../sim/data.mjs";
import { LANE_W, SHOULDER_W } from "../sim/constants.mjs";
import { PROP_SIZE, hasProp } from "../web/js/props.mjs";

test("同种子同模式 → 同一条路（逐位一致）", () => {
  const a = createTrack({ seed: 2024, mode: "city" });
  const b = createTrack({ seed: 2024, mode: "city" });
  for (let z = 0; z < 3600; z += 7) {
    assert.equal(a.curveAt(z), b.curveAt(z));
    assert.equal(a.hillAt(z), b.hillAt(z));
  }
  assert.deepEqual(a.propsBetween(0, 400), b.propsBetween(0, 400));
});

test("不同种子 → 不同的弯（种子真的在用，而不是摆样子）", () => {
  const a = createTrack({ seed: 1, mode: "city" });
  const b = createTrack({ seed: 2, mode: "city" });
  let diff = 0;
  for (let z = 0; z < 900; z += 3) if (Math.abs(a.curveAt(z) - b.curveAt(z)) > 1e-9) diff++;
  assert.ok(diff > 200, `两颗种子只有 ${diff} 个采样点不同，赛道几乎一样`);
});

test("路的宽度就是车道数算出来的宽度，路肩之外没有路", () => {
  for (const mode of Object.keys(MODES)) {
    const t = createTrack({ seed: 9, mode });
    assert.equal(t.halfWidth, MODES[mode].lanes * LANE_W / 2);
    assert.equal(t.limitX, t.halfWidth + SHOULDER_W - 0.6);
    assert.equal(t.surfaceAt(0), "road");
    assert.equal(t.surfaceAt(t.halfWidth), "road");
    assert.equal(t.surfaceAt(t.halfWidth + 1.2), "shoulder");
    assert.ok(t.limitX < t.halfWidth + SHOULDER_W, "车不能压到路肩的最外沿");
  }
});

/**
 * 路边道具：无状态、可复现、密度够。**八条路一起验**。
 *
 * 以前这条测试只认 lamp/tree/sign/building 四种，八张地图一上来它就成了唯一的
 * 拦路石——但它真正该守的是"这条路长出来的东西，画得出来"：`maps.mjs` 里写下的
 * 每一个名字，都得在 `props.mjs` 里有尺寸、有画法。名字写错（`snowPole` vs
 * `snowpole`）在两个宿主上都只会表现为"路边凭空少了一排东西"，肉眼极难发现。
 */
test("路边道具：八条路都无状态、可复现、密度够、名字都有画法", () => {
  for (const mode of Object.keys(MODES)) {
    const t = createTrack({ seed: 55, mode });
    const props = t.propsBetween(400, 800);
    const step = MODES[mode].propStep || 26;
    assert.ok(props.length >= Math.floor(400 / step) - 2,
      `${mode}：400 米里只有 ${props.length} 个道具（步长 ${step}），路边太空`);
    assert.deepEqual(props, createTrack({ seed: 55, mode }).propsBetween(400, 800),
      `${mode}：同一颗种子算出来的道具不一样`);
    const kinds = new Set(t.sceneryKinds);
    for (const p of props) {
      assert.ok(p.z >= 400 && p.z <= 800);
      assert.ok(Math.abs(p.x) > t.halfWidth, `${mode}：道具不能长在路面上`);
      assert.ok(kinds.has(p.kind), `${mode}：长出了 ${p.kind}，但它不在 scenery 表里`);
      assert.ok(hasProp(p.kind), `${mode}：${p.kind} 没有画法，路会凭空缺一块`);
      assert.ok(PROP_SIZE[p.kind], `${mode}：${p.kind} 没有尺寸`);
      assert.ok(p.s > 0.7 && p.s < 1.4, "尺寸要在一个不吓人的区间里");
    }
  }
});

test("发车格：十五台车错开成三列，不重叠、都在起点之后", () => {
  const t = createTrack({ seed: 3, mode: "city" });
  const slots = Array.from({ length: 15 }, (_, i) => gridSlot(t, i));
  assert.equal(new Set(slots.map(s => `${s.x}|${s.z}`)).size, 15, "不能有两个人在同一个格位");
  for (const s of slots) {
    assert.ok(s.z <= 0, "发车格在起点线之后");
    assert.ok(Math.abs(s.x) < t.halfWidth, "发车格在路面之内");
  }
  assert.ok(slots[0].z > slots[14].z, "序号越大越靠后");
});

/**
 * 路边道具的**分布**：不许挤成一堆。
 *
 * 背景是一次真实的翻车：荒野公路上抽到一颗种子，一屏之内立了三座一模一样的井架。
 * 每一槽独立摇号，概率上没错；看起来就是贴图复制粘贴。修法是给每种道具算一条
 * "最小间距"（权重越低、间隔越长），所以这里钉的是三条**设计性质**，不是具体数字：
 *   1. 同一种不许连着两槽出现；
 *   2. 越稀有的，两次之间隔得越远（不然"稀有"只体现在总数上，看不出来）；
 *   3. 一屏（660 米）之内，稀有地标最多两件。
 */
test("同一种道具不会挨着长：两次之间至少隔开一槽", () => {
  for (const mode of Object.keys(MODES)) {
    const t = createTrack({ seed: 77, mode });
    const last = new Map();
    for (const p of t.propsBetween(0, 2600)) {
      const prev = last.get(p.kind);
      if (prev !== undefined) {
        assert.ok(p.i - prev >= 2,
          `${mode}：第 ${prev} 槽和第 ${p.i} 槽都长出了 ${p.kind}，它们挨着`);
      }
      last.set(p.kind, p.i);
    }
  }
});

test("越稀有的道具隔得越远：最少见的那个，间距至少是最常见的四倍", () => {
  for (const mode of Object.keys(MODES)) {
    const weights = MODES[mode].scenery;
    const kinds = Object.keys(weights);
    const rare = kinds.reduce((a, b) => (weights[a] <= weights[b] ? a : b));
    const common = kinds.reduce((a, b) => (weights[a] >= weights[b] ? a : b));
    // 拿**实际长出来的**间距量，而不是再算一遍公式：公式改了，这条测试还得成立。
    const gaps = new Map();
    for (let seed = 1; seed <= 60; seed++) {
      const last = new Map();
      for (const p of createTrack({ seed, mode }).propsBetween(0, 2600)) {
        const prev = last.get(p.kind);
        if (prev !== undefined) gaps.set(p.kind, Math.min(gaps.get(p.kind) ?? 99, p.i - prev));
        last.set(p.kind, p.i);
      }
    }
    const rareGap = gaps.get(rare), commonGap = gaps.get(common);
    assert.ok(rareGap && commonGap, `${mode}：${rare} / ${common} 一整条路都没长出来过`);
    assert.ok(rareGap >= commonGap * 4,
      `${mode}：${rare}（权重 ${weights[rare]}）只隔 ${rareGap} 槽就再来一件，` +
      `${common}（权重 ${weights[common]}）隔 ${commonGap} 槽——稀有的那件没被推开`);
  }
});

test("一屏之内最多两件稀有地标（回归：荒野上那三座井架）", () => {
  for (const mode of Object.keys(MODES)) {
    const weights = MODES[mode].scenery;
    const rare = Object.keys(weights).filter(k => weights[k] <= 0.45);
    for (let seed = 1; seed <= 120; seed++) {
      const props = createTrack({ seed, mode }).propsBetween(0, 660);
      for (const kind of rare) {
        const n = props.filter(p => p.kind === kind).length;
        assert.ok(n <= 2, `${mode} 种子 ${seed}：一屏之内有 ${n} 件 ${kind}`);
      }
    }
  }
});

test("压掉成簇之后，彩蛋仍然找得到（没有顺手把稀有件全挡没）", () => {
  for (const mode of Object.keys(MODES)) {
    const weights = MODES[mode].scenery;
    const egg = Object.keys(weights).find(k => weights[k] <= 0.2);
    assert.ok(egg, `${mode} 没有彩蛋了`);
    let found = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const t = createTrack({ seed, mode });
      if (t.propsBetween(0, t.length).some(p => p.kind === egg)) found++;
    }
    assert.ok(found >= 60, `${mode}：120 局里只有 ${found} 局能找到 ${egg}，太藏了`);
  }
});

test("表现层随机源与模拟随机源是两条独立的流", () => {
  const a = cosmeticRng(7), b = cosmeticRng(7);
  assert.equal(a(), b(), "同种子同序列");
  assert.notEqual(cosmeticRng(7)(), cosmeticRng(8)(), "不同种子不同序列");
  assert.equal(hash2(3, 11), hash2(3, 11));
  assert.notEqual(hash2(3, 11), hash2(3, 12));
});
