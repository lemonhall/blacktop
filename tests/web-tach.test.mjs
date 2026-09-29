/**
 * 转速表的**数**（`web/js/tach.mjs`）。
 *
 * 转速表上那根针唯一的意义就是：**换挡那一瞬间它会掉回来**。这件事在画面上只有
 * 零点几秒，肉眼看不出对错，但它是"这是一台摩托"的全部错觉来源——所以拿测试钉住：
 * 起步怠速、每挡爬升、换挡回落、红线封顶。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { revs, TACH } from "../web/js/tach.mjs";

const VMAX = 187;   // 街霸 400：52 m/s

test("停着是怠速，不熄火也不指 0", () => {
  const r = revs(0, VMAX);
  assert.equal(r.gear, 1);
  assert.ok(Math.abs(r.rpm - TACH.idle) < 1e-9, `怠速该是 ${TACH.idle} 千转，实际 ${r.rpm}`);
});

test("跑到极速是六挡、转速顶在换挡点", () => {
  const r = revs(VMAX, VMAX);
  assert.equal(r.gear, 6);
  assert.ok(Math.abs(r.rpm - TACH.shift) < 1e-9);
});

test("一到六挡全都用得上，而且随着速度只往前不往回", () => {
  let last = 0;
  for (let v = 0; v <= VMAX; v += 2) {
    const r = revs(v, VMAX);
    assert.ok(r.gear >= last, `${v} km/h 掉挡了：${last} → ${r.gear}`);
    last = r.gear;
  }
  assert.equal(last, 6, "跑到极速只用到 6 挡，说明没有空缺的挡");
});

test("换挡那一瞬间针要掉回来——这就是转速表存在的理由", () => {
  const drop = (a, b) => {
    const before = revs(a, VMAX), after = revs(b, VMAX);
    assert.equal(after.gear, before.gear + 1, `${a} → ${b} km/h 没有换挡`);
    assert.ok(after.rpm < before.rpm - 4,
      `换挡后转速没掉：${before.rpm.toFixed(2)} → ${after.rpm.toFixed(2)}`);
  };
  drop(VMAX * 0.175, VMAX * 0.185);
  drop(VMAX * 0.32, VMAX * 0.34);
  drop(VMAX * 0.81, VMAX * 0.83);
});

test("氮气把速度推过极速时，针压在红区里、不会画出量程外", () => {
  const r = revs(VMAX * 1.18, VMAX);
  assert.equal(r.gear, 6);
  assert.ok(r.rpm > TACH.redline, "超过极速还在红区外就说明量程算错了");
  assert.ok(r.rpm <= TACH.max, "针不能画出表盘");
});

test("同一挡里转速随速度单调上升，而且永远是个能画出来的数", () => {
  let prev = -1;
  for (let v = VMAX * 0.4; v <= VMAX * 0.47; v += 0.5) {
    const { rpm } = revs(v, VMAX);
    assert.ok(Number.isFinite(rpm) && rpm >= 0);
    assert.ok(rpm > prev, `${v} km/h 转速没往上走`);
    prev = rpm;
  }
  assert.ok(Number.isFinite(revs(0, 0).rpm), "拿不到车型数据时也得给个数");
});
