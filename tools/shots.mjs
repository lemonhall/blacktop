/**
 * 出图：用真 Chrome 跑一局，顺手把界面拍下来放进 `docs/shots/`。
 *
 * 为什么不手工截屏：README 与 `docs/` 里的图一旦过期，就成了"文档在说谎"。
 * 这个脚本每次跑完都会覆盖同一批文件名，所以重新出图是一条命令的事。
 *
 * 它跑在**已启动的** `wrangler dev` 之上（`E2E_BASE` 默认 127.0.0.1:8790），
 * 不看线上、不花一分钱。整局跑到底大约 2 分钟，其中大部分时间在等第一名冲线。
 *
 *   node tools/shots.mjs              # 无头
 *   E2E_HEADED=1 node tools/shots.mjs # 想看它自己跑就开窗口
 */

import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium, HEADLESS, sleep, until, observe, openClient, holdKeys, log } from "./e2e-harness.mjs";

const OUT = fileURLToPath(new URL("../docs/shots/", import.meta.url));
const ROOM_NAME = "夜色环路 · 八号车库";

/** 等画面"稳下来"再按快门：刚切屏时画布还没画完，截到的会是一块空底。 */
async function shot(page, name, { settle = 700 } = {}) {
  await sleep(settle);
  const path = `${OUT}${name}`;
  await page.screenshot({ path });
  log(true, `出图 ${name}`, `${Math.round(1)} 张`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: HEADLESS });
  try {
    const host = await openClient(browser, "柠檬叔");

    // ------------------------------------------------------------ 建房表单
    await host.click("#openCreateButton");
    await sleep(400);
    await shot(host, "01-create-room.png");

    // ------------------------------------------------------------ 建房 → 候场
    await host.fill("#createName", ROOM_NAME);
    await host.selectOption("#createMode", "city");
    await host.selectOption("#createDifficulty", "1");
    await host.selectOption("#createBots", "13");
    await host.selectOption("#createJoinLive", "1");
    await host.click("#createRoomButton");
    await until(async () => (await observe(host)).screen === "staging", { what: "进入候场" });
    await until(async () => (await observe(host)).roster >= 5, { what: "名册渲染出来" });
    await shot(host, "02-lobby-staging.png", { settle: 1400 });

    // ------------------------------------------------------------ 大厅
    // 用**第二个浏览器**去看大厅：房主自己一离开房间，那间房就没人了（空房会被
    // alarm 回收），回头再点卡片只会看到"这一间进不去"——不是 bug，是设计。
    const fan = await openClient(browser, "路过的老王");
    await fan.click("#refreshRooms");
    await until(async () => (await observe(fan)).cards > 0, { what: "列表里有房" });
    await shot(fan, "00-rooms.png", { settle: 1200 });
    await fan.context().close();

    // ------------------------------------------------------------ 发车
    await host.click("#startButton");
    await until(async () => (await observe(host)).screen === "play", { what: "进入赛道" });
    // 倒数 3.2 秒：抓中间那一下，画面上还有大大的倒计时数字。
    await until(async () => (await observe(host)).countdown <= 2.6, { what: "倒数走到一半", timeout: 6000 });
    await shot(host, "03-countdown.png", { settle: 250 });

    // ------------------------------------------------------------ 跑起来
    await until(async () => (await observe(host)).countdown <= 0, { what: "发车", timeout: 6000 });
    await holdKeys(host, ["KeyW"], 5200);
    await shot(host, "04-race.png", { settle: 300 });

    // 再骑一段，等播报条上出现点事（摔车 / 大运 / 撂倒），那张图最像"游戏在发生"。
    const lively = await until(async () => {
      const seen = await observe(host);
      return seen.feed.length > 8 ? seen : null;
    }, { what: "播报条有内容", timeout: 45000, every: 500 }).catch(() => null);
    await holdKeys(host, ["KeyW"], 1200);
    await shot(host, "05-brawl.png", { settle: 300 });
    log(!!lively, "拍到混战瞬间", lively ? lively.feed.slice(0, 40) : "没等到播报，拍到的是常规跟车");

    // ------------------------------------------------------------ 跑完全程 → 结算
    // 3.6km 的赛道、极速 63m/s，第一名大约 75~90 秒冲线；人只要一直拧着油门就能
    // 在差不多的时刻跑完。这里一边按油门一边盯屏幕——**不能松手等**：人停住的
    // 话，服务端要等到时间上限（210 秒）才会结算，出图就得多等两分钟。
    let over = null;
    const deadline = Date.now() + 200000;
    while (!over && Date.now() < deadline) {
      await holdKeys(host, ["KeyW"], 2500);
      const seen = await observe(host);
      if (seen.screen === "over") over = seen;
    }
    await shot(host, "06-results.png", { settle: 900 });
    log(!!over, "跑到结算", over ? `名次 ${over.resultRank} · ${over.resultTable.slice(0, 40)}` : "没在 200 秒内跑到结算");
  } finally {
    await browser.close();
  }
}

await main();
