/**
 * 速度线（`web/js/speedlines.mjs`）。
 *
 * 这个模块上一版是"屏幕上固定角度的斜线"，看着像有人拿钥匙划了玻璃。改成
 * 放射状之后，好看不好看仍然只能靠眼睛，但**物理**可以逐条钉住：
 *   - 线只能从消失点往外放射，不能横着飘；
 *   - 越靠外越长越快（这正是"速度感"的来源，也是它敢叫速度线的理由）；
 *   - 一整圈里唯一那次位置突变，必须发生在几乎看不见的时刻上。
 *
 * 最后一条最要紧：速度线最丑的坏法不是画错方向，是"啪"地闪一下。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { drawSpeedLines, lineShape, speedStrength } from "../web/js/speedlines.mjs";
import { assertBalanced, assertSane, countOps, fingerprint, spyCtx } from "./helpers/spy-ctx.mjs";

const CAM = { W: 1440, H: 900, horizon: 900 * 0.42 };
const FOE = { x: CAM.W / 2, y: CAM.horizon };

const dist = (x, y) => Math.hypot(x - FOE.x, y - FOE.y);
const lenOf = L => Math.hypot(L.x1 - L.x0, L.y1 - L.y0);
const fract = x => x - Math.floor(x);
/** 和模块内部同一把哈希——这里要故意抄一份，抄错了测试就会自己暴露。 */
const phase = i => fract(Math.sin(i * 127.1 + 311.7) * 43758.5453);
/**
 * 取第 `i` 条线在生命周期 `u ∈ (0,1)` 处的样子：把 u **反解**回 `now`。
 * 满速时一圈是 2 遍/秒，所以 `+1200` 正好是 2400 整圈，不影响相位。
 */
function at(i, u) {
  const now = (u - phase(i)) / 2 + 1200;
  return lineShape(i, 1, now, CAM);
}

test("慢速一笔都不画：这一层是「快了才有」的东西", () => {
  const { ctx, ops } = spyCtx();
  for (const v of [0, 6, 13.9, 14]) {
    assert.equal(drawSpeedLines(ctx, CAM, v, 12), 0, `${v} m/s 不该有线`);
  }
  assert.equal(ops.length, 0, "慢速时一个画布调用都不该发出去");
  assert.equal(speedStrength(40), 1, "满速是 1");
  assert.ok(speedStrength(20) > 0 && speedStrength(20) < 1, "中间档得是渐变的");
});

test("每一条线都从消失点放射：延长线必须穿过它", () => {
  for (let i = 0; i < 12; i++) {
    const L = at(i, 0.7);
    assert.ok(L, `第 ${i} 条该画得出来`);
    // 尾巴和头都在同一条射线上 → 方向向量与"FOE → 头"平行。
    const dx = L.x1 - L.x0, dy = L.y1 - L.y0;
    const rx = L.x1 - FOE.x, ry = L.y1 - FOE.y;
    const cross = Math.abs(dx * ry - dy * rx);
    assert.ok(cross <= 1e-6 * Math.hypot(dx, dy) * Math.hypot(rx, ry),
      `第 ${i} 条不是从消失点放射出来的（叉积 ${cross}）`);
    assert.ok(dx * rx + dy * ry > 0, `第 ${i} 条的方向反了：头该比尾更靠外`);
    assert.ok(dist(L.x1, L.y1) > dist(L.x0, L.y0), `第 ${i} 条的头必须在尾的外侧`);
  }
});

test("越靠外越长：贴边的线外圈那截，要比中间的长一倍以上", () => {
  for (let i = 0; i < 8; i++) {
    const mid = lenOf(at(i, 0.62));
    const edge = lenOf(at(i, 0.999));
    assert.ok(edge > mid * 1.4, `第 ${i} 条：${mid.toFixed(1)}px → ${edge.toFixed(1)}px，外圈不够长`);
  }
});

test("一条线的整圈：从中心长出来、一路变长、贴边淡出去", () => {
  const i = 5;
  let prevLen = -1;
  for (let k = 0; k <= 30; k++) {
    const u = 0.3 + (k / 30) * 0.69;
    const L = at(i, u);
    assert.ok(L, `u=${u.toFixed(3)} 该画得出来`);
    const len = lenOf(L);
    assert.ok(len > prevLen, `u=${u.toFixed(3)} 处长度没有继续变长（${prevLen} → ${len}）`);
    prevLen = len;
  }
  assert.ok(at(i, 0.25).a < at(i, 0.6).a * 0.5, "刚出生那一下必须很淡");
  assert.ok(at(i, 0.999).a < at(i, 0.6).a * 0.2, "贴到画面边必须淡掉，不能生生截断");
});

test("整圈里唯一那次位置突变，落在几乎看不见的时刻上", () => {
  for (let i = 0; i < 10; i++) {
    const drawn = [];
    for (let k = 0; k < 200; k++) {
      const L = at(i, k / 200 + 1e-4);
      if (L) drawn.push(L);
    }
    assert.ok(drawn.length > 120, `第 ${i} 条一圈里画得出来的太少了（${drawn.length}）`);
    // 把首尾接起来：绕圈那一下**必须**一起比进来，否则这条测试只验了平滑的中间段。
    let worst = 0, aHere = 1;
    for (let k = 0; k < drawn.length; k++) {
      const a = drawn[k], b = drawn[(k + 1) % drawn.length];
      const jump = Math.hypot(b.x1 - a.x1, b.y1 - a.y1);
      if (jump > worst) { worst = jump; aHere = Math.max(a.a, b.a); }
    }
    assert.ok(worst > 40, `第 ${i} 条整整一圈都没挪窝，那就不叫速度线了`);
    assert.ok(aHere < 0.05, `第 ${i} 条跳变时透明度 ${aHere.toFixed(3)}——闪那一下会看见`);
  }
});

test("无穷远的东西不拖影：往天上的线必须被压到几乎看不见", () => {
  const GOLD = 2.399963229728653;
  let road = 0, sky = 0, up = 0;
  for (let i = 0; i < 22; i++) {
    const ang = i * GOLD + 0.9;
    const si = Math.sin(ang), co = Math.cos(ang);
    // 生命周期的峰值（g≈0.82）——这里最能看出"这一条到底有多亮"。
    const peak = at(i, Math.sqrt(0.82));
    assert.ok(peak, `第 ${i} 条在峰值时该画得出来`);
    if (si > 0.5) { road++; assert.ok(peak.a > 0.25, `路面侧第 ${i} 条太淡了：${peak.a.toFixed(3)}`); }
    if (si < -0.5) {
      up++;
      assert.ok(peak.a <= 0.12, `第 ${i} 条冲着天上去还这么亮：${peak.a.toFixed(3)}`);
      // 越接近"笔直朝上"，越该压到没有——那条射线对应的点在无穷远。
      if (Math.abs(co) < 0.25) assert.ok(peak.a < 0.04, `第 ${i} 条几乎是垂直往上的`);
    }
    if (si < 0) sky++;
  }
  assert.ok(road >= 3 && up >= 3 && sky >= 6, `方向分布不对：路面 ${road} 条、天上 ${up} 条`);
});

test("画在画布上：条数随速度变多，颜色和坐标都干净", () => {
  const slow = spyCtx(), fast = spyCtx();
  const a = drawSpeedLines(slow.ctx, CAM, 20, 7.5);
  const b = drawSpeedLines(fast.ctx, CAM, 46, 7.5);
  assert.ok(a > 0, "20 m/s 就该有线了");
  assert.ok(b > a, `满速的线必须更多：${a} → ${b}`);
  assertSane(fast.ops, fast.invalid, "一屏速度线");
  assertBalanced(fast.ops, "一屏速度线");
  assert.equal(countOps(fast.ops, "beginPath"), b, "每条线自己一条路径");
  assert.equal(countOps(fast.ops, "stroke"), b * 2, "一条路径描两遍：外发光 + 芯");
  assert.ok(fast.strokes.every(c => c === "rgba(222,240,255,1)"),
    "颜色是常量，浓淡交给 globalAlpha");
});

test("同一时刻两次调用逐笔一致：线不许自己乱跳", () => {
  const one = spyCtx(), two = spyCtx();
  drawSpeedLines(one.ctx, CAM, 44, 3.25);
  drawSpeedLines(two.ctx, CAM, 44, 3.25);
  assert.equal(fingerprint(one.ops), fingerprint(two.ops));
  // 但换个时刻必须真的换样——否则上面那条相等是"因为压根没画"。
  const other = spyCtx();
  drawSpeedLines(other.ctx, CAM, 44, 3.31);
  assert.notEqual(fingerprint(one.ops), fingerprint(other.ops));
});
