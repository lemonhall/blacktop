/**
 * 震屏。**这一条是"整个游戏卡卡的"的一半。**
 *
 * 上一版是 `(Math.random() - .5) * S.shake`：混战里 `shake` 常年挂在 7~14，
 * 也就是每一帧把整幅画随机挪 ±3.5~7 像素。人眼读到的不是"震了一下"，而是
 * **这台机器在抖**——逐帧的随机位移恰恰就是"卡顿"在视觉上的长相。
 *
 * 换成同一个幅度下的正弦之后，要钉的是三件事：确定性（同一相位同一结果）、
 * 连续性（相邻两帧不许跳）和死区（没在震的时候一丝都别动）。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { shakeOffset } from "../web/js/camshake.mjs";

/** 线上渲染循环推相位的速度（`fx.stepFx` 里那一条，34 rad/s ≈ 5.4 赫兹）。 */
const OMEGA = 34;
const DT = 1 / 60;

test("没在震的时候返回 null：多一次 save/restore 也是钱", () => {
  assert.equal(shakeOffset(1.23, 0), null);
  assert.equal(shakeOffset(1.23, 0.02), null, "0.02 像素的抖动没人看得见，不该开这一段变换");
  assert.equal(shakeOffset(Number.NaN, 10), null, "相位坏了就当没震");
  assert.ok(shakeOffset(1.23, 10), "真在震的时候要有偏移");
});

test("同一个相位一定给出同一个偏移：随机数做不到这一条", () => {
  for (const phase of [0, 0.4, 2.7, 6.1]) {
    assert.deepEqual(shakeOffset(phase, 9), shakeOffset(phase, 9));
  }
});

/** 采样一遍，返回相邻两帧之间最大的位移跳变（像素）。 */
function worstJump(dt, amp = 12, n = 400) {
  let phase = 0, worst = 0, prev = shakeOffset(phase, amp);
  for (let i = 0; i < n; i++) {
    phase = (phase + dt * OMEGA) % (Math.PI * 2);
    const now = shakeOffset(phase, amp);
    worst = Math.max(worst, Math.abs(now.dx - prev.dx), Math.abs(now.dy - prev.dy));
    prev = now;
  }
  return worst;
}

test("相邻两帧不许跳：这是「抖的是镜头」和「这台机器在卡」的区别", () => {
  // 60 帧下，最大的一跳要小于 4 像素（振幅本身才 ±5.4）。随机版的相邻两帧差值
  // 是在 ±12 像素里随便取，均值就有 4，最坏能到 12——那才是"卡"的观感。
  const at60 = worstJump(DT);
  assert.ok(at60 < 4, `60 帧下相邻两帧跳了 ${at60.toFixed(2)} 像素——那就是下一秒的"卡顿感"`);
  // 这一条才是"连续"的真正证据：把采样加密四倍，跳变也必须跟着缩到四分之一左右。
  // 逐帧独立的随机数做不到这一条——它的跳变和采样率无关。
  const at240 = worstJump(DT / 4);
  assert.ok(at240 < at60 * 0.4, `采样加密后跳变没跟着缩（${at60.toFixed(2)} → ${at240.toFixed(2)}），说明它不连续`);
});

test("相位绕回 2π 时接得上，不许每绕一圈突然闪一下", () => {
  const before = shakeOffset(Math.PI * 2 - 1e-6, 12);
  const after = shakeOffset(0, 12);
  assert.ok(Math.abs(before.dx - after.dx) < 1e-3, `绕回时横向跳了 ${(before.dx - after.dx).toFixed(3)}`);
  assert.ok(Math.abs(before.dy - after.dy) < 1e-3, "绕回时纵向也不许跳");
});

test("幅度越大晃得越大，但旋转始终只是一点点", () => {
  const small = shakeOffset(1.1, 4);
  const big = shakeOffset(1.1, 16);
  assert.ok(Math.abs(big.dx) > Math.abs(small.dx));
  assert.ok(Math.abs(big.rot) > Math.abs(small.rot));
  // 屏幕上整幅画一起转，超过半度就不是"被撞得晃了一下"而是"翻车了"。
  // 22 是 `S.shake` 实际能到的上限（表现层各处都是 `Math.min(18~22, ...)`），
  // 拿一个线上到不了的 30 去验，验的就不是这套东西了。
  assert.ok(Math.abs(shakeOffset(0.8, 22).rot) < 0.0087, "转得太狠了");
});
