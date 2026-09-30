/**
 * 被踹飞的车在屏幕上待多久。
 *
 * sim-fling-sight 量的是"它相对玩家在哪"，那还不够：玩家说的"看不见了"是**画面
 * 里没了**。相机挂在踹人的人身后 8.6 米，能看见的横向范围只有 `半屏 ÷ ppm` 米
 * ——车贴到眼前时那只有七米。早先横向给的是 11 米/秒，半秒就出画（线上原话：
 * "车很快地消失在画面外了，被踢出路边的画面来不及看到"）。
 *
 * 这份测试用**渲染层自己那套相机与投影**（`web/js/road.mjs`），逐格问一句"它还
 * 在画面上吗"。这是那句原话唯一诚实的度量方式。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DT } from "../sim/constants.mjs";
import { build } from "./helpers.mjs";
import { stepRacer } from "../sim/racer.mjs";
import { fling, spawnTraffic, stepTraffic } from "../sim/traffic.mjs";
import { buildSlices, createCamera, project } from "../web/js/road.mjs";

const W = 1280, H = 800;
const input = { th: 1, br: 0, st: 0, nos: 0, act: 0 };

/** 迎面来一台车、在贴脸处踹飞，然后逐格推进。 */
function onScreen(kind, playerV, ticks = 90) {
  const w = build({ seed: 3, bots: 1, humans: [] });
  const a = w.racers[0];
  w.countdown = 0; w.traffic.length = 0; w.events.length = 0;
  a.x = 0; a.z = 1000; a.v = playerV;
  const v = spawnTraffic(w, a.z + 400, kind);
  v.dir = -1; v.x = -3; v.z = a.z + 9; v.v = 26;
  fling(w, v, Math.sign(v.x - a.x) || 1, a.v);

  const S = { view: { w: W, h: H }, track: w.track, me: { x: a.x, z: a.z, v: a.v }, punch: 0 };
  const out = [];
  for (let i = 0; i < ticks; i++) {
    stepRacer(w, a, DT, input);
    stepTraffic(w, DT);
    S.me = { x: a.x, z: a.z, v: a.v };
    const cam = createCamera(S);
    const p = project(cam, buildSlices(S, cam), v.x, w.track.hillAt(v.z), v.z);
    const visible = !!p && p.sx > 0 && p.sx < W && p.sy > 0 && p.sy < H && p.ppm > 0.03;
    out.push({ t: i * DT, visible, sx: p ? p.sx : null });
  }
  return out;
}

/** 最后一次出现在画面里的时刻。 */
const goneAt = rows => rows.filter(r => r.visible).at(-1)?.t ?? 0;

for (const kind of ["car", "bus", "dayun"]) {
  test(`踹飞一台${kind}：整段飞行都在画面里，不会半秒就横着溜出去`, () => {
    const rows = onScreen(kind, 41);
    assert.ok(goneAt(rows) >= 1.2,
      `${kind} 只看得见 ${goneAt(rows).toFixed(2)} 秒——玩家还没看清就没了`);
  });
}

test("踹得越快它跟得越紧：慢速和一百四十公里下都不掉出画面", () => {
  for (const speed of [18, 45]) {
    const seen = goneAt(onScreen("car", speed));
    assert.ok(seen >= 1.2, `${speed} m/s 时只看得见 ${seen.toFixed(2)} 秒`);
  }
});

test("横向位移要收得住：它不是被一炮打出去，是被一脚踹向路肩", () => {
  const xs = onScreen("car", 41, 78).filter(r => r.visible).map(r => r.sx);
  const sweep = Math.max(...xs) - Math.min(...xs);
  assert.ok(sweep < W * 0.5, `一秒多里它在屏幕上横扫了 ${Math.round(sweep)} 像素`);
});
