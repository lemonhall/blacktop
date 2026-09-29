/**
 * 手感探针：在**注入延迟**的链路上按住一个方向走一段，然后把"被拽回"量出来。
 *
 * 它测的不是"能不能动"，而是"动得像不像样"：逐帧采样本机预测坐标，做一次滑动窗口
 * 方向估计，再看有多少帧真的往后退了。跨境链路上人走一段被拽回一小段，就是这里
 * 应当出现负数——本机 localhost 上这个数字恒等于 0，所以必须挂着延迟代理跑。
 *
 * 用法：
 *   node tools/netcode-probe.mjs                    # 100ms 单向 + 30ms 抖动 + 周期拥塞
 *   PROBE_DELAY=150 PROBE_STALL=300 node tools/netcode-probe.mjs
 *   PROBE_OUT=.blacktop-scratch/netcode.json node tools/netcode-probe.mjs
 *   PROBE_KEY=KeyA node tools/netcode-probe.mjs     # 换个轴（默认是油门 KeyW）
 *
 * 需要：本机已在 8790 上跑着 `npx wrangler dev`（本脚本自己不起服务），
 * 以及 Playwright + 本机 Chrome（`channel:"chrome"`，不下载自带浏览器）。
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { startLatencyProxy } from "./latency-proxy.mjs";

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    const dir = process.env.E2E_PLAYWRIGHT_DIR;
    if (!dir) throw new Error(`解析不到 playwright（${error.message}）。装一个，或设 E2E_PLAYWRIGHT_DIR。`);
    return import(new URL("playwright/index.mjs", `file:///${dir.replace(/\\/gu, "/").replace(/\/?$/u, "/")}`).href);
  }
}

const { chromium } = await loadPlaywright();

const DEV_PORT = Number(process.env.PROBE_DEV_PORT) || 8790;
const PROXY_PORT = Number(process.env.PROBE_PORT) || 8899;
const DELAY = Number(process.env.PROBE_DELAY ?? 100);
const JITTER = Number(process.env.PROBE_JITTER ?? 30);
const STALL = Number(process.env.PROBE_STALL ?? 0);
const HOLD_MS = Number(process.env.PROBE_HOLD ?? 6000);
const HEADLESS = process.env.PROBE_HEADED !== "1";

/**
 * 按住的键 → 投影轴与正方向。
 *
 * 赛车有两个自由度，而它们**不是同一件事**：油门（W）推的是"沿路跑了多少米"（z），
 * 压车（A/D）推的是"离路中心多少米"（x）。被拽回的现象在两条轴上都可能出现，
 * 但主运动轴才是玩家一眼就能看出来的那一条——所以默认探油门。
 */
const KEY_AXIS = {
  KeyW: ["z", 1], KeyS: ["z", -1], KeyA: ["x", -1], KeyD: ["x", 1],
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(fn, { timeout = 25000, every = 200, what = "条件" } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await sleep(every);
  }
  throw new Error(`等待超时：${what}`);
}

/** 逐帧采样**本机预测坐标**——用户眼睛看到的就是它（view.mjs 用它覆盖了权威坐标）。 */
const SAMPLER = `
window.__nc = { t: [], x: [], z: [], ak: [], rtt: [], gap: [], q: [] };
const ncLoop = () => {
  const S = window.BLACKTOP && window.BLACKTOP.S;
  const p = S && S.predictMe;
  if (p && window.__nc.t.length < 30000) {
    window.__nc.t.push(performance.now());
    window.__nc.x.push(p.x); window.__nc.z.push(p.z);
    window.__nc.ak.push(S.mine && Number.isFinite(S.mine.ak) ? S.mine.ak : -1);
    window.__nc.rtt.push(S.rtt | 0);
    window.__nc.gap.push(S.mine ? Math.hypot(p.x - S.mine.x, p.z - S.mine.z) : 0);
    window.__nc.q.push(S.cmds ? S.cmds.length : -1);
  }
  requestAnimationFrame(ncLoop);
};
requestAnimationFrame(ncLoop);
`;

/**
 * 从逐帧轨迹里挑出"往后退"的帧。
 *
 * 这里用**已知的按键轴**当方向，而不是从轨迹里估方向——因为一次硬吸附本身就有
 * 一两百像素，任何滑窗方向估计都会被它带偏，反而把要测的东西算成"前进"。
 * 探针按住的方向是确定的，所以这一层可以做到绝对干净。
 */
function analyze({ t, x, z }, axis, sign) {
  const comp = axis === "x" ? x : z;
  const frames = t.length;
  let forward = 0, backward = 0, maxBack = 0, worstAt = 0, backFrames = 0;
  for (let i = 1; i < frames; i++) {
    const step = sign * (comp[i] - comp[i - 1]);
    if (step >= 0) { forward += step; continue; }
    backward += -step;
    backFrames++;
    if (-step > maxBack) { maxBack = -step; worstAt = t[i] - t[0]; }
  }
  return { frames, forward, backward, backFrames, maxBack, worstAt };
}

async function main() {
  const proxy = await startLatencyProxy({
    port: PROXY_PORT, targetPort: DEV_PORT, delayMs: DELAY, jitterMs: JITTER, stallMs: STALL,
  });
  const browser = await chromium.launch({ channel: "chrome", headless: HEADLESS });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.on("pageerror", error => console.log(`  [页面报错] ${error.message}`));
    await page.addInitScript(SAMPLER);
    await page.goto(proxy.url, { waitUntil: "domcontentloaded" });
    await page.fill("#nickInput", "探针");
    await page.dispatchEvent("#nickInput", "change");
    await until(async () => page.evaluate(() => !!window.BLACKTOP), { what: "前端启动完成" });

    await page.click("#openCreateButton");
    await page.fill("#createName", "手感探针场");
    await page.selectOption("#createMode", "city");
    await page.selectOption("#createBots", "6");
    await page.click("#createRoomButton");
    await until(() => page.evaluate(() => window.BLACKTOP.S.screen === "staging"), { what: "进入候场" });
    await page.click("#startButton");
    await until(() => page.evaluate(() => window.BLACKTOP.S.screen === "play" && !!window.BLACKTOP.S.predictMe),
      { what: "进入对局" });
    // 发车倒数里油门是锁死的，世界也还没开始动——等它走完再计时，否则量到的
    // 全是"倒数期间本机预测本来就不该动"这段空转。
    await until(() => page.evaluate(() => window.BLACKTOP.S.countdown <= 0), { what: "发车倒数结束" });
    await sleep(700);

    // 探针只用一条轴：默认油门（z 往前）。这一步顺便让预测器从"刚进场"的抖动里
    // 稳下来，所以**正式计时从这之后才开始**。
    const key = process.env.PROBE_KEY || "KeyW";
    if (!KEY_AXIS[key]) throw new Error(`PROBE_KEY 只能是 ${Object.keys(KEY_AXIS).join(" / ")}`);
    await page.evaluate(() => {
      for (const k of ["t", "x", "z", "ak", "rtt", "gap", "q"]) window.__nc[k].length = 0;
    });
    await page.evaluate(c => document.dispatchEvent(new KeyboardEvent("keydown", { code: c })), key);
    await sleep(HOLD_MS);
    await page.evaluate(c => document.dispatchEvent(new KeyboardEvent("keyup", { code: c })), key);
    await sleep(400);

    const trace = await page.evaluate(() => window.__nc);
    const rtt = trace.rtt.reduce((a, b) => Math.max(a, b), 0);
    const [axis, sign] = KEY_AXIS[key];
    const result = analyze(trace, axis, sign);
    const span = trace.t.length ? (trace.t[trace.t.length - 1] - trace.t[0]) / 1000 : 0;
    const travel = sign * (axis === "x" ? trace.x.at(-1) - trace.x[0] : trace.z.at(-1) - trace.z[0]);
    const acks = trace.ak.filter(v => v >= 0);
    const acked = acks.length ? acks.at(-1) - acks[0] : 0;
    const median = values => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)] ?? 0;
    };

    const report = {
      proxy: { delayMs: DELAY, jitterMs: JITTER, stallMs: STALL },
      key, seconds: +span.toFixed(2), frames: result.frames, rttMs: rtt,
      // 单位是**米**（赛车的坐标系），不再是射击版的像素。
      traveledM: +travel.toFixed(1), forwardM: +result.forward.toFixed(1),
      backwardM: +result.backward.toFixed(1), backwardFrames: result.backFrames,
      maxBackJerkM: +result.maxBack.toFixed(1), worstAtMs: Math.round(result.worstAt),
      gapMedianM: +median(trace.gap).toFixed(1), gapMaxM: +Math.max(...trace.gap).toFixed(1),
      ackedCommands: acked, proxyStats: { ...proxy.stats },
    };
    console.log(JSON.stringify(report, null, 2));
    if (process.env.PROBE_OUT) {
      mkdirSync(path.dirname(process.env.PROBE_OUT), { recursive: true });
      writeFileSync(process.env.PROBE_OUT, JSON.stringify(report, null, 2), "utf8");
    }
    return report;
  } finally {
    await browser.close();
    await proxy.close();
  }
}

await main();
