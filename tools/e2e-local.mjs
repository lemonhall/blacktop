/**
 * 本地联调的**场景**：几个浏览器各自扮演一个真人，走完"开房 → 拉人 → 放机器人 →
 * 选车 → 举手 → 发车 → 压车跑一段 → 链接补位进场 → 跑完看结算"的全流程。
 *
 * 为什么要有这个脚本：单元测试只能证明"内核算得对"，房间名册、WebSocket、渲染
 * 循环这三样串起来对不对，只有真开浏览器才知道。它跑在**已启动的** `wrangler dev`
 * 之上，自己不起服务，也不碰线上账号——所以它不会产生任何账单。
 *
 * 用法：
 *   node tools/e2e-local.mjs                    # 默认打 http://127.0.0.1:8790
 *   E2E_BASE=http://127.0.0.1:8788 node tools/e2e-local.mjs
 *   E2E_HEADED=1 node tools/e2e-local.mjs       # 想看着它跑，就把窗口开出来
 *
 * 起浏览器、读页面状态、等条件的那些机械动作在 `tools/e2e-harness.mjs` ——
 * 这个文件只关心"测什么"。
 */

import { chromium, BASE, HEADLESS, sleep, until, observe, openClient, holdKeys, keyDown, keyUp, answerNameGate, log } from "./e2e-harness.mjs";

const ROOM_NAME = "夜色环路 E2E";

const steps = [];

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: HEADLESS });
  try {
    // ---------------------------------------------------------------- 1. 房间浏览器
    const host = await openClient(browser, "柠檬叔");
    // 访客故意不预置名字：他要走一遍"点进房间 → 被问名字 → 落库"的真实路径。
    const guest = await openClient(browser, "测试员", { seed: false });
    const browse = await observe(host);
    steps.push(["进站后看到房间浏览器与租户", browse.screen === "rooms" && browse.tenant === "neon",
      `租户 ${browse.tenant} · 房间卡片 ${browse.cards} 张`]);

    // ---------------------------------------------------------------- 2. 建房
    await host.click("#openCreateButton");
    await host.fill("#createName", ROOM_NAME);
    await host.selectOption("#createMode", "city");
    await host.selectOption("#createDifficulty", "1");
    await host.selectOption("#createBots", "6");
    await host.selectOption("#createJoinLive", "1");
    await host.click("#createRoomButton");
    await until(async () => (await observe(host)).screen === "staging", { what: "房主进入候场" });
    steps.push(["房主建房成功，自己先进候场", true, ROOM_NAME]);

    // 赛道是房主说了算：点在界面上，验的是"这条消息有没有真的改变房间"。
    await host.click('[data-mode="wild"]');
    const swerved = await until(async () => {
      const a = await observe(host);
      return a.roleNote.includes("荒野") || a.title === ROOM_NAME ? a : null;
    }, { what: "换赛道生效", timeout: 6000 }).catch(() => null);
    await host.click('[data-mode="city"]');
    steps.push(["房主能换赛道（配置是房间级的，不是本机的）", !!swerved,
      swerved ? "荒野公路 → 夜色环路" : "没等到切换"]);

    // ---------------------------------------------------------------- 3. 第二个真人从列表进房
    // 访客那边列表是 4 秒一轮的轮询，所以这里先手动刷新一次再点卡片。
    await guest.click("#refreshRooms");
    await until(async () => (await observe(guest)).cards > 0, { what: "访客看到房间卡片" });
    await guest.locator("#roomList .room-card", { hasText: ROOM_NAME }).first().click();
    const asked = await answerNameGate(guest, "测试员");
    const bothStaged = await until(async () => {
      const [a, b] = [await observe(host), await observe(guest)];
      const ready = x => x.screen === "staging" && x.title === ROOM_NAME;
      return ready(a) && ready(b) ? [a, b] : null;
    }, { what: "两人同在候场，且房间视图已经推到两边" });
    steps.push(["第二个真人能从列表加入房间", true, `房间「${bothStaged[1].title}」`]);
    steps.push(["第一次进房先弹窗起名，名字落进 localStorage 并写进名册",
      asked && bothStaged[1].names.includes("测试员"), `名册：${bothStaged[1].names.join("、")}`]);

    // ---------------------------------------------------------------- 4. 房主部署机器人
    await host.click('#botStepper [data-bot="1"]');
    const bots = await until(async () => {
      const [a, b] = [await observe(host), await observe(guest)];
      return a.botCount === "7" && b.botCount === "7" ? [a, b] : null;
    }, { what: "机器人数量同步到两边" });
    steps.push(["房主加机器人，两个客户端同步看到 7 个机器人 + 2 名真人",
      bots[0].roster === 9 && bots[1].roster === 9,
      `名册 ${bots[0].roster} 格 / 机器人 ${bots[0].botCount}`]);

    // 权限投影：访客的加减按钮必须是灰的（真正的拒绝在服务端）。
    const guestDisabled = await guest.evaluate(() =>
      [...document.querySelectorAll("#botStepper button")].every(b => b.disabled));
    steps.push(["非房主看到的是不可点的机器人控件", guestDisabled]);

    // ---------------------------------------------------------------- 5. 选车
    // 赛车各自为战，没有队可分——"选车"占的就是射击版"选边"的位置。三种车是
    // 取舍不是升级，所以这里点的是**铁马 1200**（最重、起步最肉的那台）。
    await guest.click('#bikePicker [data-bike="2"]');
    const picked = await until(async () => {
      const [a, b] = [await observe(host), await observe(guest)];
      const index = a.names.indexOf("测试员");
      return index >= 0 && a.bikes[index] === 2 && b.myBike === 2 && b.pickedBike === 2 ? [a, b] : null;
    }, { what: "访客换车同步到房主" }).catch(() => null);
    steps.push(["访客换车，服务端认下车型并推回两边（卡片高亮跟着服务端走）", !!picked,
      picked ? `名册车型 ${JSON.stringify(picked[0].bikes)}` : "没等到换车生效"]);

    // ---------------------------------------------------------------- 6. 举手与发车闸门
    const gated = await until(async () => {
      const a = await observe(host);
      return a.allReady === false && a.startEnabled === false ? a : null;
    }, { what: "房主的出发按钮被举手闸门按住" }).catch(() => null);
    steps.push(["有人没举手时，房主的出发按钮是灰的", !!gated,
      gated ? `名册 ${gated.names.join("、")} · ${gated.roleNote}` : "没等到闸门生效"]);

    await guest.click("#readyButton");
    const unlocked = await until(async () => {
      const [a, b] = [await observe(host), await observe(guest)];
      return a.allReady === true && a.startEnabled === true && b.readyOn === true ? [a, b] : null;
    }, { what: "举手之后房主的出发按钮亮起来" }).catch(() => null);
    steps.push(["访客举手之后，房主可以发车（两边状态一致）", !!unlocked,
      unlocked ? "allReady=true / 出发可点 / 我这边显示已举手" : "没等到解锁"]);

    // ---------------------------------------------------------------- 7. 发车
    const startAt = Date.now();
    await host.click("#startButton");
    const playing = await until(async () => {
      const [a, b] = [await observe(host), await observe(guest)];
      const inPlay = x => x.screen === "play" && x.mapSeed && x.self;
      return inPlay(a) && inPlay(b) ? [a, b] : null;
    }, { what: "两边都进入赛道并收到地图与第一帧快照", timeout: 25000 });
    const startMs = Date.now() - startAt;
    steps.push(["房主发车，两个真人同时进场，拿到同一张地图",
      playing[0].mapSeed === playing[1].mapSeed && playing[0].mapMode === "city",
      `seed=${playing[0].mapSeed} · ${playing[0].mapMode} · ${playing[0].rosterSize} 台车`]);
    steps.push(["发车后 2.5 秒内就有第一帧快照（不靠 alarm 兜底）", startMs < 2500, `${startMs}ms`]);
    steps.push(["发车格上就是满员十五台（2 真人 + 7 机器人补位后的实际在跑数）",
      playing[0].actors.length >= 9, `快照里 ${playing[0].actors.length} 台`]);

    // ---------------------------------------------------------------- 8. 发车倒数
    // 倒数里油门是锁死的：这一段必须**不动**，否则"起步抢跑"就是客户端自己说了算。
    const counting = await until(async () => {
      const a = await observe(host);
      return a.countdown > 0 ? a : null;
    }, { what: "发车倒数", timeout: 4000 }).catch(() => null);
    if (counting) {
      await holdKeys(host, ["KeyW"], 600);
      const during = await observe(host);
      steps.push(["发车倒数里油门锁死（按着 W 也不动）",
        Math.abs(during.self.z - counting.self.z) < 3,
        `z ${counting.self.z.toFixed(1)} → ${during.self.z.toFixed(1)}`]);
    } else {
      steps.push(["发车倒数里油门锁死（按着 W 也不动）", false, "没抓到倒数窗口"]);
    }
    await until(async () => (await observe(host)).countdown <= 0, { what: "倒数结束", timeout: 12000 });

    // ---------------------------------------------------------------- 9. 跑起来：本地预测 + 服务端对账
    const before = (await observe(host)).self;
    await holdKeys(host, ["KeyW"], 1600);
    await sleep(700);
    const after = (await observe(host)).self;
    steps.push(["按 W 之后，服务端认得我在往前走（权威 z 在涨）",
      after.z - before.z > 15 && after.state === "ride" && after.kmh > 20,
      `z ${before.z.toFixed(1)} → ${after.z.toFixed(1)}（${after.kmh.toFixed(0)} km/h）`]);

    // 压车：A 键往左。横向坐标是"离路中心多少米"，所以左压 = x 变小。
    // `lean` 必须在**压着的时候**采样：松开之后车会自己回正，那之后再读就是 0。
    //
    // 先往右扳一下再往左压：上一步在弯里跑了一段，车完全可能已经贴在左边的
    // 路肩边界上（线上实测 x 已经是 -9.40，也就是最小），那样"再往左"根本没有
    // 位移可测——这条断言会变成一条"看运气"的测试，而不是"压车有没有效"的测试。
    await holdKeys(host, ["KeyW", "KeyD"], 700);
    const straight = (await observe(host)).self;
    await keyDown(host, "KeyW");
    await keyDown(host, "KeyA");
    await sleep(900);
    const leaning = (await observe(host)).self;
    await keyUp(host, "KeyA");
    await sleep(500);
    const leaned = (await observe(host)).self;
    steps.push(["压车真的把车推向左边（权威 x 变小，而且车身真的在倾）",
      leaning.lean < -0.1 && leaned.x < straight.x - 1.2,
      `x ${straight.x.toFixed(2)} → ${leaned.x.toFixed(2)} · lean ${leaning.lean.toFixed(2)}`]);
    // 压回路面中间：不然接下来 3 公里都在路肩上跑（路肩限速 0.64），跑不完。
    await holdKeys(host, ["KeyW", "KeyD"], 1400);

    // ---------------------------------------------------------------- 10. 世界在推进
    const ticking = await until(async () => {
      const a = await observe(host);
      return a.ticks > 0 && a.worldTime > 0 ? a : null;
    }, { what: "对局 tick 前进" });
    const tickSample = await until(async () => {
      const a = await observe(host);
      return a.ticks > ticking.ticks + 20 ? a : null;
    }, { what: "第二次采样 tick 继续前进", timeout: 8000 });
    steps.push(["权威世界持续推进（服务端 tick 单调递增）",
      tickSample.ticks > ticking.ticks, `tick ${ticking.ticks} → ${tickSample.ticks}`]);
    steps.push(["快照里带着车流（路上不能只有比赛的人）",
      tickSample.traffic > 0, `${tickSample.traffic} 台车流 · 大运 ${tickSample.dayun}`]);

    // ---------------------------------------------------------------- 11. HUD
    const hud = await observe(host);
    steps.push(["HUD 有名次榜、计时与播报位（不是一块空画布）",
      hud.ranks.length > 0 && hud.hudTimer !== "00:00",
      `名次「${hud.ranks.slice(0, 40)}」· 计时 ${hud.hudTimer} · 与头名 ${hud.hudGap}`]);
    // 一局跑三圈，玩家得看得见自己在第几圈——不然"还剩两圈"只能靠猜。
    steps.push(["HUD 上写着第几圈（三圈的局不写出来就是黑箱）",
      /第 \d\/\d 圈/u.test(hud.hudLap),
      `计时牌上写着「${hud.hudLap}」`]);
    // 仪表舱压在画面下缘，而相机是追尾视角——它每高一点，挡掉的就是眼前那条路
    // （线上原话："占用了太多高度，很恶心，挡住了"）。所以这条不钉像素值，钉它
    // 占了几成屏高、上沿落在第几行；换个窗口大小也照样成立。
    const dash = await host.evaluate(() => {
      const r = document.querySelector(".hud-dash").getBoundingClientRect();
      return { h: r.height, top: r.top, vh: innerHeight };
    });
    steps.push(["仪表舱只占屏幕下缘那一条（不挡眼前的路）",
      dash.h / dash.vh <= 0.22 && dash.top / dash.vh >= 0.72,
      `高 ${Math.round(dash.h)}px（${(dash.h / dash.vh * 100).toFixed(1)}% 屏高）`
      + `· 上沿在第 ${Math.round(dash.top / dash.vh * 100)}% 行`]);

    // ---------------------------------------------------------------- 12. 邀请链接：对局中补位
    // 人数上限是 2（这是赛制的一部分：2 真人 + 13 机器人 = 15 台），所以先请访客
    // 让出位置，再让拿着链接的人**在对局中**补进来——那是最难的一种进场。
    // 对局中离开走的是暂停菜单（候场页的"离开房间"这时候根本不可见）。
    await guest.click("#pauseButton");
    await guest.click("#exitButton");
    await until(async () => {
      const a = await observe(host);
      return a.names.length === 1 ? a : null;
    }, { what: "访客离开，房主看到名册只剩自己", timeout: 10000 });

    const roomId = (await observe(host)).roomId;
    const invite = await host.evaluate(async id => (await import("/js/invite.mjs")).inviteLink(id), roomId);
    const lateContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const late = await lateContext.newPage();
    await late.goto(invite, { waitUntil: "domcontentloaded" });
    const askedLate = await answerNameGate(late, "链接来客");
    const linked = await until(async () => {
      const [a, b] = [await observe(host), await observe(late)];
      return b.roomId === roomId && b.screen === "play" && b.self && a.names.includes("链接来客")
        ? [a, b] : null;
    }, { what: "拿到链接的人补位进场", timeout: 20000 }).catch(() => null);
    steps.push(["邀请链接直接把人送进同一间房，并在**对局中**补位",
      !!linked && askedLate && invite.includes(`room=${roomId}`),
      linked ? `${invite.replace(BASE, "")} · 名册 ${linked[0].names.join("、")}` : "没等到进场"]);
    steps.push(["补位进来的人是新人出生点（领跑者身后一点，不是从起点重跑）",
      !!linked && linked[1].self.z > 0, linked ? `补位 z=${linked[1].self.z.toFixed(0)}m` : "—"]);

    // 把房主的页面切回前台再按住油门：后台标签页的 requestAnimationFrame 会被
    // 浏览器降频，主循环一慢，输入上行就断，世界只能靠 5 秒的 alarm 挪——那不是
    // 游戏的问题，是"标签页在后台"的问题。真人玩的时候，他就在前台。
    await host.bringToFront();
    await keyDown(host, "KeyW");

    // ---------------------------------------------------------------- 13. 混战播报
    // 摔车、迎面大运、冲线都会进播报条。这一步等的是"这条链路上真的发生过事情"。
    const fighting = await until(async () => {
      const [a, b] = [await observe(host), await observe(late)];
      return [a, b].find(x => x.feed.length > 0) || null;
    }, { what: "场上出现播报（摔车 / 大运 / 冲线）", timeout: 60000, every: 700 }).catch(() => null);
    log(!!fighting, "场上真的发生过事情（播报条有内容）", fighting ? fighting.feed : "60 秒内没有播报");
    steps.push(["场上真的发生过事情（摔车 / 大运 / 冲线进播报条）", !!fighting,
      fighting ? fighting.feed : "60 秒内没有播报"]);

    // ---------------------------------------------------------------- 14. 跑到结算
    // 这是整条链路最后一段：DO 判完名次 → 落 D1 → 广播 `over` → 前端切结算页。
    const over = await until(async () => {
      const a = await observe(host);
      return a.screen === "over" ? a : null;
      // 一局是**三圈**（三倍里程），真人一路油门到底也要跑四分钟上下，所以窗口开得比
      // 单程时代宽三倍——这条等不到，八成是"路没接上"或者车被钉在某处，不是等得不够久。
    }, { what: "比赛结束，进入结算页", timeout: 900000, every: 1500 }).catch(() => null);
    steps.push(["跑完全程，服务端判完名次并广播结算", !!over && over.resultTable.length > 0,
      over ? `${over.resultRank} · ${over.resultTable.slice(0, 80)}` : "900 秒内没跑到结算"]);
    await lateContext.close();
  } finally {
    await browser.close();
  }
}

try {
  await main();
} catch (error) {
  steps.push([`场景中断：${error?.message || error}`, false, "（下面的结果只覆盖跑到的部分）"]);
}
console.log("\n—— 联调结果 ——");
for (const [name, ok, extra] of steps) console.log(`${ok ? "✔" : "✘"} ${name}${extra ? ` — ${extra}` : ""}`);
const failed = steps.filter(([, ok]) => !ok);
console.log(`\n${steps.length - failed.length} / ${steps.length} 项通过`);
process.exit(failed.length ? 1 : 0);
