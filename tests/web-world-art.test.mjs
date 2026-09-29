/**
 * 环境美术的**画法契约**（`web/js/road.mjs` + `props.mjs` + `vehicles.mjs`）。
 *
 * 这里的每一条都对应过一次真实的翻车：
 *   - 相机在自己车后 8.6 米，开局时 `z` 是**负数**，斑马纹下标取到 `-1`，
 *     颜色表读出 `undefined`。浏览器把 `fillStyle = undefined` 默默忽略，
 *     直到有人拿它去 `shade()` 才把整条渲染循环炸掉——所以它必须有一条回归。
 *   - 车流画出来的宽度**就是碰撞判定的宽度**。画窄了，玩家会觉得"明明还有
 *     空隙"；画宽了，会觉得"这都能撞上"。
 *   - 楼房的大气透视（越远越化进天色）没有几何可断言，只能验颜色。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { FOG, haze, shade } from "../web/js/art.mjs";
import { createTrack } from "../sim/track.mjs";
import { VEHICLES } from "../sim/traffic.mjs";
import { buildSlices, createCamera, drawRoad } from "../web/js/road.mjs";
import { drawBuilding } from "../web/js/props.mjs";
import { drawVehicle } from "../web/js/vehicles.mjs";
import { assertBalanced, assertSane, fingerprint, gradientStops, spyCtx, widestX } from "./helpers/spy-ctx.mjs";

/** 一块假的画布：`road.mjs` 的沥青颗粒要从 `document` 上现取一张平铺贴图。 */
function withDom(fn) {
  const prev = globalThis.document;
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => spyCtx().ctx }),
  };
  try { return fn(); } finally { globalThis.document = prev; }
}

/** 一台相机 + 一条视线。`meZ` 是"我"在路上的位置——0 就是发车线。 */
function rig(mode, meZ) {
  const S = {
    mode,
    track: createTrack({ seed: 4242, mode }),
    view: { w: 1280, h: 720 },
    me: { x: 0, z: meZ },
  };
  const cam = createCamera(S);
  return { S, cam, tbl: buildSlices(S, cam) };
}

test("发车线（相机落在负 Z 区）上整条路画得出来，没有把 undefined 当颜色", () => {
  withDom(() => {
    const { S, cam, tbl } = rig("city", 0);
    assert.ok(cam.camZ < 0, "这条测试的前提是相机在负 Z 区——camZ 应该小于 0");
    const { ctx, ops, invalid } = spyCtx();
    drawRoad(ctx, cam, tbl, S);
    assertBalanced(ops, "开局的路");
    assertSane(ops, invalid, "开局的路");
  });
});

test("跑到中段、荒野配色：路照样画得出来", () => {
  withDom(() => {
    for (const [mode, meZ] of [["city", 640], ["wild", 1180]]) {
      const { S, cam, tbl } = rig(mode, meZ);
      const { ctx, ops, invalid } = spyCtx();
      drawRoad(ctx, cam, tbl, S);
      assertBalanced(ops, `${mode} 的路`);
      assertSane(ops, invalid, `${mode} 的路`);
    }
  });
});

test("楼房越远越化进天色：雾量大时，墙面的每一档颜色都更接近雾色", () => {
  const tone = "#5a6070";
  const build = hazeK => {
    const { ctx, ops, invalid } = spyCtx();
    drawBuilding(ctx, { sx: 400, baseY: 600, s: 30, seed: 3, width: 13, height: 21, tone, hazeK });
    assertBalanced(ops, `雾量 ${hazeK} 的楼`);
    assertSane(ops, invalid, `雾量 ${hazeK} 的楼`);
    return gradientStops(ops)[0];
  };
  const near = build(0), far = build(1);
  // 只钉**关系**，不钉具体明暗数值——墙身该亮多少是美术天天在调的事，
  // 一改就把测试改红，那条测试最后只会被人删掉。
  assert.equal(near[1], tone, "雾量为 0 时中间那档就是墙身本色");
  assert.equal(far[1], haze(tone, 0.8), "雾量为 1 时墙身必须被拉到雾色上");
  const lum = h => (parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16)) / 3;
  assert.ok(lum(near[0]) > lum(near[1]) && lum(near[2]) < lum(near[1]), "光从左上来：左亮右暗");
  const dist = (a, b) => {
    const p = h => [(parseInt(h.slice(1, 3), 16)), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const [x, y] = [p(a), p(b)];
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  };
  for (let i = 0; i < 3; i++) {
    assert.ok(dist(far[i], FOG.city) < dist(near[i], FOG.city),
      `第 ${i} 档墙面没有变淡：近 ${near[i]} → 远 ${far[i]}，雾色是 ${FOG.city}`);
  }
});

test("雾量不写、越界、楼房小到看不见：都不该出事", () => {
  for (const o of [
    { sx: 0, baseY: 100, s: 4, seed: 1, width: 13, height: 21, tone: "#666" },
    { sx: 0, baseY: 100, s: 4, seed: 1, width: 13, height: 21, tone: "#666", hazeK: 9 },
    { sx: 0, baseY: 100, s: 4, seed: 1, width: 13, height: 21, tone: "#666", hazeK: -9 },
    { sx: 0, baseY: 100, s: 0.01, seed: 1, width: 13, height: 21, tone: "#666" },
  ]) {
    const { ctx, ops, invalid } = spyCtx();
    drawBuilding(ctx, o);
    assertBalanced(ops, `楼房 ${JSON.stringify(o.hazeK)}`);
    assert.deepEqual(invalid, []);
  }
});

/**
 * 楼房这一版的细节是分层堆出来的（层线 / 窗套 / 底层店面 / 屋顶设备），
 * 每一层都只在**看得见的时候**才画。这条测试守的就是那道闸门：
 * 近了要把细节给足，远了要真的省下来——不然一屏十几栋楼会把帧率吃光。
 */
test("近处的楼画全套，远处的楼只留墙和窗格", () => {
  const build = s => {
    const { ctx, ops, invalid } = spyCtx();
    drawBuilding(ctx, { sx: 500, baseY: 700, s, seed: 5, width: 13, height: 21, tone: "#5a6070", hazeK: 0.1 });
    assertBalanced(ops, `s=${s} 的楼`);
    assertSane(ops, invalid, `s=${s} 的楼`);
    return ops;
  };
  const near = build(60), far = build(6);
  const rects = ops => ops.filter(([n]) => n === "fillRect").length;
  assert.ok(rects(near) > rects(far) * 3,
    `近处 ${rects(near)} 笔、远处 ${rects(far)} 笔——远处的楼没省下来`);
  // 屋顶那几件（箱子、天线）必须画在屋脊**以上**：`y + h <= 屋脊`。
  const top = 700 - 21 * 60;
  assert.ok(near.some(([n, a]) => n === "fillRect" && a[1] + a[3] <= top),
    "屋顶上什么都没有，楼就没有顶");
});

test("同一栋楼每一帧长得一样：窗户不许自己乱跳", () => {
  const draw = seed => {
    const { ctx, ops } = spyCtx();
    drawBuilding(ctx, { sx: 500, baseY: 700, s: 40, seed, width: 13, height: 21, tone: "#5a6070", hazeK: 0 });
    return fingerprint(ops);
  };
  assert.equal(draw(5), draw(5), "同一个种子画两遍居然不一样");
  assert.notEqual(draw(5), draw(9), "两栋楼的窗户一模一样，整条街就成了一栋楼");
});

test("五种车各有各的长相", () => {
  const seen = new Map();
  // 用的是它们**在游戏里真实的样子**：car/van/truck 走同向车道（看到车尾），
  // oncom/dayun 走对向车道（车头迎面而来）。
  const onRoad = { car: 1, van: 1, truck: 1, oncom: -1, dayun: -1 };
  for (const kind of Object.keys(VEHICLES)) {
    const dir = onRoad[kind] || 1;
    const { ctx, ops, invalid } = spyCtx();
    drawVehicle(ctx, { kind, id: 3, cx: 640, baseY: 700, s: 20, dir });
    assertBalanced(ops, kind);
    assertSane(ops, invalid, kind);
    const fp = fingerprint(ops);
    assert.ok(!seen.has(fp), `${kind} 和 ${seen.get(fp)} 画出来一模一样`);
    seen.set(fp, kind);
  }
});

test("迎面来的车必须点着大灯：灯的冷暖由朝向定，不由车型定", () => {
  for (const kind of ["car", "van", "truck"]) {
    const paint = dir => {
      const { ctx, ops, fills } = spyCtx();
      drawVehicle(ctx, { kind, id: 5, cx: 640, baseY: 700, s: 30, dir });
      assertBalanced(ops, `${kind} 朝向 ${dir}`);
      return fills;
    };
    const head = paint(-1), tail = paint(1);
    assert.ok(head.includes("#fff6cf"), `${kind} 迎面开来却没点大灯：${head.slice(0, 6).join(" ")}`);
    assert.ok(tail.includes("#ff4a5a"), `${kind} 同向却没点尾灯：${tail.slice(0, 6).join(" ")}`);
    assert.ok(!tail.includes("#fff6cf"), `${kind} 同向行驶却开着一盏大灯照后面`);
  }
});

test("大运是迎面来的，所以画的必须是车头——那道黄黑斜纹要在保险杠上", () => {
  const { ctx, ops, fills, invalid } = spyCtx();
  drawVehicle(ctx, { kind: "dayun", id: 9, cx: 640, baseY: 700, s: 30, dir: -1 });
  assertBalanced(ops, "大运");
  assertSane(ops, invalid, "大运");
  assert.ok(fills.includes("#fff6cf"), "大运迎面开来，却没有大灯");
  assert.ok(fills.includes("#f2c018"), "保险杠上的黄黑斜纹不见了——那是它最好认的一笔");
  assert.ok(!fills.includes("#ff4a5a"), "迎面来的大运亮着红尾灯：它被画成车尾了");
});

test("画出来的宽度就是判定的宽度：大运必须比轿车明显宽", () => {
  const width = kind => {
    const { ctx, ops } = spyCtx();
    drawVehicle(ctx, { kind, id: 1, cx: 0, baseY: 0, s: 1, dir: 1 });
    return widestX(ops);
  };
  const car = width("car"), dayun = width("dayun");
  assert.ok(car > VEHICLES.car.wid * 0.4, `轿车画出来只有 ${car.toFixed(2)} 米宽，判定是 ${VEHICLES.car.wid}`);
  assert.ok(dayun > car * 1.3, `大运 ${dayun.toFixed(2)} 米、轿车 ${car.toFixed(2)} 米——宽得不够，看不出来要躲`);
});

test("小到看不见的车一笔都不该画", () => {
  const { ctx, ops } = spyCtx();
  drawVehicle(ctx, { kind: "car", id: 1, cx: 100, baseY: 400, s: 0.02, dir: 1 });
  assert.equal(ops.length, 0, `s=0.02 的车还画了 ${ops.length} 条指令`);
});
