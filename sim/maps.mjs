/**
 * 八条赛道的数值表。**只有数据，没有逻辑**——调平衡不用读任何代码。
 *
 * 一条赛道由五组数字定义，每一组都对应画面上能看出来的一件事：
 *
 *   1. **路**：`lanes` / `length` / `curveA`+`curveB` / `hillA`+`hillB`。
 *      曲率是两个正弦的叠加（碎弯 + 长弯），坡度同理。路本身永远是直的，
 *      弯的是视线——所以这两个数同时决定"视线怎么甩"和"离心力多大"。
 *   2. **天与地**：`sky` / `ground`。**这里只写 id，配色在渲染层**（`web/js/sky.mjs`
 *      与 `grounds.mjs`）。共享内核不该知道 "#221a44" 这种字符串，两个宿主也就
 *      不必为了换一个天色去同步美术。
 *   3. **路边长什么**：`scenery` 是权重表。同一张表在两个宿主上算出来的每一棵树
 *      都在同一个地方（`track.mjs` 用 (种子, 槽位号) 查表）。
 *   4. **路上有什么**：`same` / `oncom` 两张车流权重表 + `oncomingShare`。
 *      社会车辆的种类是按赛道配的：工业支线上跑的是半挂和搅拌车，山道上跑的是
 *      拖拉机和皮卡。这就是"每条路有自己的脾气"最省事的一种表达。
 *   5. **几个人**：`maxHumans` / `bots`。这条赛道一次能坐进来几个真人、几个机器人。
 *
 * `maxHumans: 2` 是刻意的：两个真人 + 十三个机器人，正好填满 1996 年那版的十五台车。
 */

export const MODES = {
  city: {
    id: "city", name: "夜色环路", sub: "CITY LOOP",
    desc: "四车道柏油路 · 车流最密 · 弯道碎",
    lanes: 4, length: 3600, trafficMs: 1500, dayunMs: 26000,
    curveA: 1 / 240, curveB: 1 / 720, hillA: 5.5, hillB: 2.2,
    sky: "dusk", ground: "city",
    propStep: 24, oncomingShare: 0.34, maxTraffic: 9,
    scenery: {
      building: 3.4, lamp: 3.0, tree: 2.0, sign: 1.4,
      neonsign: 0.9, kiosk: 0.7, busstop: 0.6, hydrant: 0.5, trafficlight: 0.5,
    },
    same: { car: 6, van: 2, pickup: 1.2, truck: 1, bus: 0.8, trike: 0.7 },
    oncom: { oncom: 6, truck: 1.2, bus: 1, police: 0.6 },
    maxHumans: 2, bots: 13,
  },
  coast: {
    id: "coast", name: "海崖公路", sub: "COAST ROAD",
    desc: "双车道 · 一边是海 · 长弯贴着悬崖",
    lanes: 2, length: 4200, trafficMs: 2100, dayunMs: 30000,
    curveA: 1 / 300, curveB: 1 / 520, hillA: 8, hillB: 3.4,
    sky: "coast", ground: "coast",
    propStep: 22, oncomingShare: 0.36, maxTraffic: 8,
    scenery: {
      guardrail: 3.2, palm: 2.6, rock: 2.2, sign: 1.2,
      lighthouse: 0.4, boulder: 1.1, bench: 0.6, neonsign: 0.7,
    },
    same: { car: 5, van: 2, pickup: 1.4, truck: 0.8, trike: 0.5 },
    oncom: { oncom: 5, truck: 1.4, bus: 1.2, tanker: 0.6 },
    maxHumans: 2, bots: 13,
  },
  wild: {
    id: "wild", name: "荒野公路", sub: "OPEN ROAD",
    desc: "双车道 · 土路肩 · 长弯大坡 · 车流稀疏",
    lanes: 2, length: 4200, trafficMs: 2400, dayunMs: 34000,
    curveA: 1 / 420, curveB: 1 / 260, hillA: 11, hillB: 4.5,
    sky: "noon", ground: "open",
    propStep: 26, oncomingShare: 0.32, maxTraffic: 8,
    scenery: {
      tree: 4, rock: 2.4, fence: 1.6, haybale: 1.4, sign: 1.2,
      barn: 0.8, tumble: 0.7, windmill: 0.4, watertower: 0.3, derrick: 0.4,
    },
    same: { car: 4, van: 2, truck: 1.6, pickup: 1.6, tractor: 1.0, bus: 0.5 },
    oncom: { oncom: 4, truck: 2, tanker: 1, tractor: 0.8, bus: 0.6 },
    maxHumans: 2, bots: 13,
  },
  desert: {
    id: "desert", name: "沙漠干道", sub: "DESERT RUN",
    desc: "四车道 · 又直又长 · 风滚草与井架",
    lanes: 4, length: 3900, trafficMs: 1900, dayunMs: 28000,
    curveA: 1 / 560, curveB: 1 / 980, hillA: 4.2, hillB: 1.8,
    sky: "desert", ground: "desert",
    propStep: 30, oncomingShare: 0.34, maxTraffic: 9,
    scenery: {
      cactus: 3.2, rock: 2, deadtree: 1.4, sign: 1.2,
      billboard: 1, derrick: 0.8, tumble: 0.8, watertower: 0.3,
    },
    same: { car: 5, pickup: 2, van: 1.6, truck: 1.2, mixer: 0.5 },
    oncom: { oncom: 5, truck: 1.6, tanker: 1.2, bus: 0.7 },
    maxHumans: 2, bots: 13,
  },
  forest: {
    id: "forest", name: "红杉林道", sub: "REDWOOD PASS",
    desc: "双车道 · 两米一棵树 · 弯急看不见出口",
    lanes: 2, length: 4400, trafficMs: 2600, dayunMs: 32000,
    curveA: 1 / 260, curveB: 1 / 480, hillA: 9.5, hillB: 3.6,
    sky: "forest", ground: "forest",
    propStep: 17, oncomingShare: 0.33, maxTraffic: 7,
    scenery: {
      redwood: 3.6, pine: 3, boulder: 1.4, stump: 1.1,
      logpile: 0.8, sign: 1, rangerhut: 0.5,
    },
    same: { car: 4, van: 2.4, pickup: 1.6, truck: 1.2 },
    oncom: { oncom: 4, truck: 1.8, tanker: 0.8, bus: 0.6 },
    maxHumans: 2, bots: 13,
  },
  snow: {
    id: "snow", name: "雪原山口", sub: "ALPINE PASS",
    desc: "双车道 · 急弯大坡 · 雪杆一路到底",
    lanes: 2, length: 4600, trafficMs: 2800, dayunMs: 30000,
    curveA: 1 / 200, curveB: 1 / 430, hillA: 13, hillB: 5.4,
    sky: "snow", ground: "snow",
    propStep: 21, oncomingShare: 0.35, maxTraffic: 7,
    scenery: {
      pine: 3.6, snowpole: 2.6, boulder: 1.4, sign: 1.2, lodge: 0.5,
    },
    same: { car: 4, van: 2, truck: 1.4, pickup: 1.2, bus: 0.8 },
    oncom: { oncom: 4, truck: 2, bus: 1, tanker: 0.8 },
    maxHumans: 2, bots: 13,
  },
  works: {
    id: "works", name: "工业支线", sub: "INDUSTRIAL SPUR",
    desc: "四车道 · 车流最凶 · 筒仓与集装箱",
    lanes: 4, length: 3400, trafficMs: 1300, dayunMs: 24000,
    curveA: 1 / 300, curveB: 1 / 640, hillA: 3.4, hillB: 1.6,
    sky: "works", ground: "works",
    propStep: 22, oncomingShare: 0.36, maxTraffic: 9,
    scenery: {
      chainfence: 2.4, building: 2.2, floodlight: 2, container: 1.4,
      barrel: 1.2, sign: 1.2, silo: 1.2, gantry: 1, pipe: 1,
    },
    same: { car: 5, van: 2.4, truck: 2.4, container: 1.2, tanker: 1, mixer: 0.8, pickup: 1 },
    oncom: { oncom: 4, truck: 2.2, container: 1, tanker: 1, bus: 0.6 },
    maxHumans: 2, bots: 13,
  },
  neon: {
    id: "neon", name: "霓虹夜市", sub: "NEON MILE",
    desc: "四车道 · 招牌糊脸 · 三轮车到处乱窜",
    lanes: 4, length: 3200, trafficMs: 1600, dayunMs: 27000,
    curveA: 1 / 220, curveB: 1 / 560, hillA: 3, hillB: 1.4,
    sky: "neon", ground: "neon",
    propStep: 17, oncomingShare: 0.34, maxTraffic: 9,
    scenery: {
      neonsign: 3, lamp: 3, building: 2.4, kiosk: 1.6, tree: 1.4,
      billboard: 1.2, busstop: 0.8, hydrant: 0.7, trafficlight: 0.6,
    },
    same: { car: 5, van: 2, trike: 1.6, bus: 1, pickup: 1 },
    oncom: { oncom: 5, bus: 1.6, truck: 1, police: 0.8, trike: 0.6 },
    maxHumans: 2, bots: 13,
  },
};

/** 八条赛道的 id，按"从最规整到最野"的顺序：界面上的卡片就是这个顺序。 */
export const MODE_IDS = Object.keys(MODES);
