/**
 * 撞击的镜头语言（`web/js/fxevent.mjs` → `road.mjs` → `overlays.mjs`）。
 *
 * 同一场撞车，配上"镜头一顿"和纯粹抖两下，玩起来是两款游戏。这一层全是主观的，
 * 但它的**规则**可以钉死，而且必须钉死，因为最丑的坏法是不讲道理：
 *   - 镜头被推的份量要跟"这一下有多重"走（大运 > 轿车 > 一拳）；
 *   - **红闪只给"我挨打"**，踹飞是暖白——两个颜色混了以后，谁打了谁就只剩声音；
 *   - 别人那边的热闹不许推到我的镜头上（除非就炸在我旁边）；
 *   - 推出去的那一拳必须自己回零，而且回不到负数。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createTrack } from "../sim/track.mjs";
import { FX, S } from "../web/js/state.mjs";
import { stepFx } from "../web/js/fx.mjs";
import { consumeEvents } from "../web/js/fxevent.mjs";
import { createCamera } from "../web/js/road.mjs";
import { drawOverlays } from "../web/js/overlays.mjs";
import { assertBalanced, countOps, gradientStops, spyCtx } from "./helpers/spy-ctx.mjs";

const ME = 7;
const mine = () => ({ id: ME, name: "柠檬叔", z: 100, x: 0, v: 30, state: "ride", lean: 0, wobble: 0 });
const view = () => ({ mine: mine(), racers: [mine(), { id: 3, name: "老周" }] });

function punchOf(events) {
  S.punch = 0; S.flash = 0; S.flashColor = "255,236,214";
  consumeEvents(events, view());
  return { p: S.punch, f: S.flash, c: S.flashColor };
}

const hit = (a, b) => ({ k: "hit", a, b, x: 0, z: 100, d: 14 });
const fling = (a, kind, pay = 60) => ({ k: "fling", a, kind, x: 0, z: 100, pay });

test("打中别人：镜头挨一拳，但不闪——红闪是「我挨打」专用的", () => {
  const r = punchOf([hit(ME, 3)]);
  assert.ok(r.p > 0, "打上了镜头必须动一下，不然玩家会说「像没打上」");
  assert.equal(r.f, 0, "我打别人不该闪");
});

test("我被打：红闪，而且这一下比打人重", () => {
  const mineHit = punchOf([hit(3, ME)]);
  const dealHit = punchOf([hit(ME, 3)]);
  assert.ok(mineHit.p > dealHit.p, `挨打要比打人沉：${mineHit.p} vs ${dealHit.p}`);
  assert.ok(mineHit.f > 0.3, "挨打要有看得见的一闪");
  const [r, g, b] = mineHit.c.split(",").map(Number);
  assert.ok(r > 200 && g < 140 && b < 140, `挨打必须是红闪，现在是 ${mineHit.c}`);
});

test("踹飞：轿车一拳，大运是两倍重的暖白闪", () => {
  const car = punchOf([fling(ME, "car")]);
  const dayun = punchOf([fling(ME, "dayun", 1500)]);
  assert.ok(car.p > 0.3, `踹飞轿车太轻了：${car.p}`);
  assert.ok(dayun.p > car.p * 1.5, `大运该明显更沉：${car.p} vs ${dayun.p}`);
  assert.ok(dayun.f > car.f, "大运那一闪也该更亮");
  for (const r of [car, dayun]) {
    const [rr, gg, bb] = r.c.split(",").map(Number);
    assert.ok(rr > 200 && gg > 180 && bb > 150, `踹飞是暖白，不是红：${r.c}`);
  }
  assert.notEqual(dayun.c, punchOf([hit(3, ME)]).c, "踹飞和挨打绝不能是同一个颜色");
});

test("摔车：镜头那一拳是最大档，还要红闪", () => {
  const r = punchOf([{ k: "wreck", a: ME, s: "headon", x: 0, z: 100 }]);
  assert.ok(r.p >= 0.6, `自己摔车的镜头太轻：${r.p}`);
  assert.ok(r.f > 0.3, "摔车也得闪一下，不然会以为是被空气绊倒的");
});

test("别人那边的热闹不进我的镜头，除非炸在我旁边", () => {
  const far = punchOf([fling(3, "dayun", 1500)]);
  assert.equal(far.p, 0, "别人踹飞大运，我的镜头凭什么动");
  const near = punchOf([{ k: "boom", x: 0, z: 140, b: 2 }]);
  assert.ok(near.p > 0, "炸在我前面四十米，镜头得晃");
  const away = punchOf([{ k: "boom", x: 0, z: 400, b: 2 }]);
  assert.equal(away.p, 0, "离得远就不该推镜头——一路上到处在炸，全推就等于一直在抖");
});

test("那一拳和那一闪都会自己回零，而且回不到负数", () => {
  consumeEvents([fling(ME, "dayun", 1500)], view());
  assert.ok(S.punch > 0 && S.flash > 0);
  stepFx(0.05, null);
  assert.ok(S.punch > 0, "刚过 50 毫秒就归零，那就成了闪一下");
  stepFx(2, null);
  assert.equal(S.punch, 0, "推出去的拳头必须自己收回来");
  assert.equal(S.flash, 0);
  stepFx(10, null);
  assert.ok(S.punch >= 0 && S.flash >= 0, "衰减不能减成负数");
});

test("视野：挨得越重往外张得越多，但始终是有限的", () => {
  const camAt = punch => {
    return createCamera({
      me: { x: 0, z: 0, v: 0 }, view: { w: 1280, h: 720 }, punch,
      track: createTrack({ seed: 1, mode: "city" }),
    });
  };
  const calm = camAt(0), hard = camAt(0.85), maxed = camAt(1);
  assert.ok(hard.F > calm.F, "挨了一下，画面该往外张");
  assert.ok(maxed.F >= hard.F);
  assert.ok((maxed.F / calm.F - 1) < 0.12, "这一拳只是「顿」一下，不能把画面推成鱼眼");
  assert.equal(camAt(0).camZ, calm.camZ, "镜头那一拳不许改机位——机位一动，人就乱了");
});

test("画面上：有闪才多画那一层，闪回零就不画", () => {
  const rig = flash => {
    S.flash = flash; S.flashColor = "255,90,78";
    const { ctx, ops, invalid } = spyCtx();
    drawOverlays(ctx, { mine: mine(), countdown: 0 }, { W: 1280, H: 720, horizon: 302 });
    return { ops, invalid, grad: gradientStops(ops) };
  };
  const calm = rig(0), hurt = rig(0.5);
  assert.equal(calm.grad.length, 1, "不闪的时候只有暗角那一层渐变");
  assert.equal(hurt.grad.length, 2, "闪的时候要多一层");
  assert.ok(hurt.grad[1].some(c => c.includes("255,90,78")), "闪的颜色得真的用上");
  assert.ok(hurt.grad[1][0].includes(",0)"), "一闪的中心必须是干净的，不能糊住脚下的路");
  assert.equal(countOps(hurt.ops, "createRadialGradient"), 2);
  assertBalanced(hurt.ops, "挨打那一帧");
  assert.deepEqual(hurt.invalid, []);
  // 闪归零之后不许再留一层几乎看不见的膜——那种"洗不干净"的颜色最难查。
  S.flash = 0.005;
  const faint = spyCtx();
  drawOverlays(faint.ctx, { mine: mine(), countdown: 0 }, { W: 1280, H: 720, horizon: 302 });
  assert.equal(gradientStops(faint.ops).length, 1);
});

test("冲击环：份量越大推得越大，攒不下超过 24 圈", () => {
  FX.rings.length = 0;
  consumeEvents([hit(ME, 3)], view());
  consumeEvents([fling(ME, "dayun", 1500)], view());
  assert.equal(FX.rings.length, 2, "打一拳一圈、踹飞一圈");
  assert.ok(FX.rings[1].k > FX.rings[0].k, "大运那圈要比一拳那圈大");
  for (let i = 0; i < 60; i++) consumeEvents([hit(ME, 3)], view());
  assert.ok(FX.rings.length <= 24, `环攒到 ${FX.rings.length} 个了，得封顶`);
});
