/**
 * 粒子的**高度基准**（`web/js/render.mjs` 的 `drawFx`）。
 *
 * 这条测试对应的翻车很具体：扬尘、火星、跳字的 `y` 是"**离地**多高"，而 `project`
 * 要的是"**世界**多高"（车、道具、骑手传进去的都是 `hillAt(z) + 离地`）。混用之后，
 * 粒子就成了"离地 0.1 米"减"相机的世界高度"：在洼地里（`hillAt` 为负）这一减是
 * 正数，于是自己后轮扬起的土一路飘到天上，变成几枚挂在半空的大圆饼——远看像镜头
 * 光斑，其实是一团土。上坡时错在另一头，土沉到路面以下，白撒。
 *
 * 断言不用"某个像素应该在哪"（那是美术天天在调的事），而用一条**与高度基准无关**
 * 的不变量：把整条路整体抬高 7 米，画面不该有任何变化。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createTrack } from "../sim/track.mjs";
import { buildSlices, createCamera } from "../web/js/road.mjs";
import { drawFx } from "../web/js/render.mjs";
import { FX, S } from "../web/js/state.mjs";
import { withDom } from "./helpers/dom.mjs";
import { spyCtx } from "./helpers/spy-ctx.mjs";

const ME_Z = 640;

/** 装一局：`lift` 把整条路抬高多少米。相机、切片、粒子全部跟着这条路走。 */
function rig(lift) {
  const track = createTrack({ seed: 4242, mode: "coast" });
  const base = track.hillAt;
  track.hillAt = z => base(z) + lift;
  Object.assign(S, {
    mode: "coast", track, view: { w: 1280, h: 720 },
    me: { x: 0, z: ME_Z, v: 40 }, shake: 0, punch: 0,
  });
  const cam = createCamera(S);
  return { cam, tbl: buildSlices(S, cam) };
}

const near = { x: 0.3, z: ME_Z - 3, y: 0.1 };

/** 每一种粒子的装弹方式 + 从记账里取出"它被画在屏幕的哪一行"。 */
const KINDS = {
  烟: [
    () => FX.smoke.push({ ...near, vx: 0, vz: 0, vy: 0, life: 0.5, max: 0.68,
      size: 0.22, color: "rgba(198,178,138,.34)" }),
    ops => { const o = ops.find(o => o[0] === "arc"); return o && o[1][1]; },
  ],
  火星: [
    () => FX.sparks.push({ ...near, vx: 0, vz: 0, vy: 0, life: 0.4, max: 0.5,
      size: 0.1, color: "#ffd24a" }),
    ops => { const o = ops.find(o => o[0] === "fillRect"); return o && o[1][1] + o[1][3] / 2; },
  ],
  冲击环: [
    () => FX.rings.push({ ...near, k: 1, color: "rgba(255,236,190,", t: 0, max: 0.6 }),
    ops => { const o = ops.find(o => o[0] === "ellipse"); return o && o[1][1]; },
  ],
  跳字: [
    () => FX.floaters.push({ ...near, text: "+400", color: "#ffe9a8", big: false, life: 1, max: 1 }),
    // 贴图缓存能烘就烘（`drawImage`）；假 DOM 里烘不出来，退化成现场写字（`fillText`）。
    // 两条路都要能测——不然这条测试只覆盖了其中一半。
    ops => {
      const img = ops.find(o => o[0] === "drawImage");
      if (img) return img[1][1];
      const text = ops.find(o => o[0] === "fillText");
      return text && text[1][2];
    },
  ],
};

function draw(kind, lift) {
  FX.smoke = []; FX.sparks = []; FX.rings = []; FX.floaters = [];
  const { cam, tbl } = rig(lift);
  KINDS[kind][0]();
  const { ctx, ops } = spyCtx();
  drawFx(ctx, cam, tbl);
  return { sy: KINDS[kind][1](ops), horizon: cam.horizon, ops };
}

for (const kind of Object.keys(KINDS)) {
  test(`${kind}的高度是"世界高度"：整条路抬高 7 米，画在同一条线上`, () => {
    withDom(() => {
      const flat = draw(kind, 0);
      const lifted = draw(kind, 7);
      assert.ok(Number.isFinite(flat.sy), `${kind}应该被画出来（记账里没找到这一笔）`);
      assert.ok(Math.abs(flat.sy - lifted.sy) < 0.5,
        `抬高 7 米后 ${kind}挪了 ${Math.round(Math.abs(flat.sy - lifted.sy))} 像素——` +
        "说明它还在拿\"离地高度\"去减相机的世界高度");
    });
  });
}

test("扬尘画在自己车后的路面上，不是挂在天上", () => {
  withDom(() => {
    const { sy, horizon } = draw("烟", 0);
    assert.ok(sy > horizon,
      `扬尘画在地平线上方 ${Math.round(horizon - sy)} 像素——在洼地里它会飘到天上`);
  });
});
