/**
 * **相机不许跟着整格台阶走。**
 *
 * 这一份是从一次线上实测里切出来的一条：在第二台电脑上进来，路面上的社会车辆
 * "顿得像幻灯片"。根因不在网络，也不在车流本身——车流的世界位置是平滑的，
 * 抖动的是**镜头**：
 *
 *   本地预测是**整格**推进的（`predict.mjs` 攒够 1/60 秒才走一格），而相机严格
 *   贴着我这台车的 `z`（`road.mjs` 的 `createCamera`）。60fps 下"一帧一格"刚刚好
 *   看不出来；120fps 变成"一格走两帧"，30fps 变成"一帧走两格"，于是**整幅画面**
 *   连同路上所有的车一起一格一跳。车越近、速度越快，跳得越明显。
 *
 * 修法是把"已经过去、还没被模拟"的那一小段时间补上（`view.mjs` 的
 * `subTickSeconds`）。这一份用**假时钟**把帧循环原样跑一遍，量两件事：
 *   - 我自己那台车逐帧的位移是否均匀（这是台阶的直接指纹）；
 *   - 一台社会车辆相对于镜头的位移是否均匀（这是玩家真正看到的那件事）。
 *
 * 两条都拿"关掉修法的同一份代码"做对照。没有对照组，这种测试会在某次重构之后
 * 悄悄变成一条永远绿的摆设。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DT } from "../sim/constants.mjs";
import { createTrack } from "../sim/track.mjs";
import { decodeMap, decodeRacer, encodeMap, encodeSnapshot, racerIdOf } from "../sim/wire.mjs";
import { buildView, latest, pushSnapshot } from "../web/js/view.mjs";
import { initPredict, stepPredict } from "../web/js/predict.mjs";
import { build, run } from "./helpers.mjs";

const SNAP_MS = 50;          // 服务端 20Hz 广播
const CONTROLS = { th: 1, br: 0, st: 0, nos: false };

/** 假时钟：`buildView` 与 `pushSnapshot` 都读 `performance.now()`。 */
function withClock(fn) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "performance");
  let now = 1_000_000;
  Object.defineProperty(globalThis, "performance", {
    configurable: true, writable: true, value: { now: () => now },
  });
  try { return fn(tick => { now += tick; }); }
  finally {
    if (original) Object.defineProperty(globalThis, "performance", original);
    else delete globalThis.performance;
  }
}

/**
 * 原样跑一段帧循环，返回逐帧的画面记录。
 *
 * `fix: false` 就是**上一版的代码**：`S.tickAcc` 永远是 0，也就是"预测停在整格上，
 * 相机也停在整格上"。除了这一项，两次跑的每一个数都相同。
 */
function drive({ fps = 120, seconds = 5, fix = true, seed = 11 }) {
  return withClock(advance => {
    const w = build({ seed, bots: 3, humans: [{ ownerId: "me", name: "我", bike: 0 }] });
    run(w, 20);
    w.countdown = 0;
    const map = decodeMap(encodeMap(w));
    const selfId = racerIdOf(map.roster, "me");
    const S = {
      snaps: [], map, meId: "me", track: createTrack({ seed, mode: "city" }),
      rtt: 0, cmds: [], cmd: null, tickAcc: 0, countdown: 0, serverTime: 0,
      headTm: 0, headAt: 0, mine: null, me: null, predictMe: null, predictW: null,
    };
    pushSnapshot(S, encodeSnapshot(w, selfId, 0));
    initPredict(S, decodeRacer(latest(S).r.find(row => row.i === selfId), map.roster));

    const frame = 1000 / fps;
    const total = Math.round(seconds * fps);
    let lastSnap = 0, acc = 0;
    const rows = [];
    for (let i = 0; i < total; i++) {
      advance(frame);
      if ((i * frame) - lastSnap >= SNAP_MS) {
        lastSnap = i * frame;
        run(w, SNAP_MS / 1000 * 60);
        pushSnapshot(S, encodeSnapshot(w, selfId, 0));
      }
      const view = buildView(S);
      // 帧循环与 `app.mjs` 的 `tickArena` 同序：先出画，再补格，最后把剩下的
      // 那一小段时间留在 `S.tickAcc` 上给下一帧。
      acc = Math.min(acc + frame / 1000, DT * 24);
      while (acc >= DT) { acc -= DT; stepPredict(S, DT, CONTROLS, 0); }
      if (fix) S.tickAcc = acc;
      const car = view.traffic.find(v => v.state === "run" && v.dir > 0) || view.traffic[0];
      rows.push({ me: view.mine.z, car: car ? car.z - view.mine.z : NaN, id: car ? car.id : -1 });
    }
    return { rows, S };
  });
}

/** 一列的"二阶差分"最大值：均匀运动趋近 0，一格一跳就是这个台阶本身。 */
function secondDiff(values) {
  let worst = 0;
  for (let i = 2; i < values.length; i++) {
    worst = Math.max(worst, Math.abs(values[i] - 2 * values[i - 1] + values[i - 2]));
  }
  return worst;
}

/**
 * 车流那一列：**只在同一个 id 连着出现的那几帧之间**量。一辆车驶出视野、
 * 列表里换了一台坐上来，那一下本来就是真的跳，不该算作抖动。
 */
function carDiff(rows) {
  let worst = 0, id = -1, run3 = [];
  for (const row of rows) {
    if (row.id !== id) { id = row.id; run3 = []; }
    if (!Number.isFinite(row.car)) { run3 = []; continue; }
    run3 = [...run3, row.car].slice(-3);
    if (run3.length === 3) worst = Math.max(worst, secondDiff(run3));
  }
  return worst;
}

/** 一整段帧循环的两个指标：我自己的台阶、路面车流的台阶。 */
function roughest(seed, fix) {
  const { rows, S } = drive({ fix, seed });
  const series = rows.slice(30);          // 起步那一段不算，看稳态
  return { me: secondDiff(series.map(r => r.me)), car: carDiff(series), S };
}

test("120fps：自己那台车逐帧位移均匀，相机不再一格一跳", () => {
  const broken = roughest(11, false);
  const fixed = roughest(11, true);
  assert.ok(broken.me > 0.3,
    `对照组没抖起来（${broken.me.toFixed(4)} 米）——这条测试失去了意义，先查帧循环是不是改了`);
  assert.ok(fixed.me < broken.me / 10,
    `补了格内位移还是抖：${fixed.me.toFixed(4)} 米 / 旧版 ${broken.me.toFixed(4)} 米`);
  assert.ok(fixed.me < 0.02, `自己那台车的台阶还有 ${fixed.me.toFixed(4)} 米`);
});

test("120fps：路面上的社会车辆相对镜头也是均匀的——这才是玩家说的'顿挫'", () => {
  const broken = roughest(11, false);
  const fixed = roughest(11, true);
  assert.ok(broken.car > 0.3, `对照组的路面车流没抖（${broken.car.toFixed(4)} 米）`);
  assert.ok(fixed.car < broken.car / 3,
    `路面车流还是顿：${fixed.car.toFixed(4)} 米 / 旧版 ${broken.car.toFixed(4)} 米`);
});

test("30fps 与 60fps 也要均匀：这一条不能只在 120 上成立", () => {
  for (const fps of [30, 60]) {
    const { rows } = drive({ fps, seconds: 4, fix: true });
    const zs = rows.slice(20).map(r => r.me);
    let worst = 0;
    for (let i = 2; i < zs.length; i++) worst = Math.max(worst, Math.abs(zs[i] - 2 * zs[i - 1] + zs[i - 2]));
    assert.ok(worst < 0.05, `${fps}fps 下自己那台车还在跳 ${worst.toFixed(4)} 米`);
  }
});

test("补的是**画面**，不是世界：预测状态逐位不许变", () => {
  const off = drive({ fix: false, seconds: 2 });
  const on = drive({ fix: true, seconds: 2 });
  assert.equal(on.S.predictMe.z, off.S.predictMe.z,
    "补帧补进预测状态里了——下一次对账就会把这几个厘米拽回去，画面反而更抖");
  assert.equal(on.S.predictMe.v, off.S.predictMe.v);
  const lastOn = on.rows.at(-1).me, lastOff = off.rows.at(-1).me;
  assert.ok(lastOn > lastOff, `画面上没占到这个便宜：${lastOn} vs ${lastOff}`);
});

test("没有预测的时候一格都不补：观战画面照旧跟着权威位置走", () => {
  withClock(() => {
    const w = build({ seed: 5, bots: 3, humans: [{ ownerId: "me", name: "我", bike: 0 }] });
    run(w, 20);
    w.countdown = 0;
    const map = decodeMap(encodeMap(w));
    const selfId = racerIdOf(map.roster, "me");
    const S = { snaps: [], map, meId: "me", track: createTrack({ seed: 5, mode: "city" }), rtt: 0 };
    for (let i = 0; i < 3; i++) {
      run(w, 3);
      pushSnapshot(S, encodeSnapshot(w, selfId, 0));
    }
    S.tickAcc = DT / 2;
    const withAcc = buildView(S).mine.z;
    S.tickAcc = 0;
    assert.equal(withAcc, buildView(S).mine.z, "没有本地预测就没有台阶可补，位置不该被推动");
  });
});

/**
 * 画里**只有一个时刻**：车流被补到的那一点，必须和"我"这台车被画出来的那一点
 * 是同一个。少这半格，我这一台就比整条路超前最多一格——38 m/s 下就是 63 厘米，
 * 而玩家看到的是"眼前那台车在抖"。
 */
test("车流补到的时刻跟着格内位移走：我往前半个格子，路上的车也得往前半个格子", () => {
  withClock(() => {
    const w = build({ seed: 7, bots: 3, humans: [{ ownerId: "me", name: "我", bike: 0 }] });
    run(w, 20);
    w.countdown = 0;
    const map = decodeMap(encodeMap(w));
    const selfId = racerIdOf(map.roster, "me");
    const S = { snaps: [], map, meId: "me", track: createTrack({ seed: 7, mode: "city" }), rtt: 0 };
    pushSnapshot(S, encodeSnapshot(w, selfId, 0));
    run(w, 3);
    pushSnapshot(S, encodeSnapshot(w, selfId, 0));
    initPredict(S, decodeRacer(latest(S).r.find(row => row.i === selfId), map.roster));
    S.cmds = [{ sq: 1, th: 1, br: 0, st: 0, nos: 0, act: 0, n: 3 }];

    S.tickAcc = 0;
    const settled = buildView(S).carTime;
    S.tickAcc = DT / 2;
    const half = buildView(S).carTime;
    assert.ok(Math.abs((half - settled) - DT / 2) < 1e-9,
      `格内那半个格子没有算进车流的时刻里（差了 ${((half - settled) * 1000).toFixed(2)}ms）`);
  });
});
