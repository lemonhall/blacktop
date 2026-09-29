/**
 * 赛制与车型的数值表。**只有数据，没有逻辑**——这样调平衡不用读任何代码。
 *
 * 一场比赛满员 15 台车（1 名玩家 + 14 个对手），这个数字是照着 1991～1996 那几代
 * 《暴力摩托》定的：当年的规则就是"跑进前四名才算过关，而场上有十四个人"。
 * 我们把它当上限（`MAX_RACERS`），两个真人各带一堆机器人正好填满。
 */

import { LANE_W } from "./constants.mjs";

export const MAX_RACERS = 15;

/**
 * 两条赛道。共同点：终点是一条带格子的横幅，路面按车道数算宽度。
 * 不同点全部写在表里——车道、长度、弯道烈度、坡度、车流密度、配色。
 */
export const MODES = {
  city: {
    id: "city", name: "夜色环路", sub: "CITY LOOP",
    desc: "四车道柏油路 · 车流最密 · 弯道碎",
    lanes: 4, length: 3600, trafficMs: 1500, dayunMs: 26000,
    curveA: 1 / 240, curveB: 1 / 720, hillA: 5.5, hillB: 2.2,
    sky: "dusk", ground: "city",
    maxHumans: 2, bots: 13,
  },
  wild: {
    id: "wild", name: "荒野公路", sub: "OPEN ROAD",
    desc: "双车道 · 土路肩 · 长弯大坡 · 车流稀疏",
    lanes: 2, length: 4200, trafficMs: 2400, dayunMs: 34000,
    curveA: 1 / 420, curveB: 1 / 260, hillA: 11, hillB: 4.5,
    sky: "noon", ground: "open",
    maxHumans: 2, bots: 13,
  },
};

export const DIFFICULTIES = [
  { id: 0, name: "休闲", sub: "CRUISE", skill: 0.74 },
  { id: 1, name: "标准", sub: "STANDARD", skill: 0.87 },
  { id: 2, name: "老兵", sub: "VETERAN", skill: 0.98 },
];

/**
 * 车型。三个数决定手感，彼此是**取舍**而不是升级：
 *   - `vmax` 极速、`accel` 推力；`turn` 压车灵敏度、`grip` 抗甩能力（弯道里被
 *     离心力推出去的多少）；`mass` 撞车时谁更吃亏（重的更稳，摔得也更久）。
 */
export const BIKES = [
  { id: "street", name: "街霸 400", en: "STREET 400", vmax: 52, accel: 9.6, turn: 1.14, grip: 1.08, mass: 1.00,
    note: "起步快、好压弯，极速一般" },
  { id: "sport", name: "暴走 750", en: "SPORT 750", vmax: 63, accel: 12.8, turn: 0.84, grip: 0.90, mass: 0.92,
    note: "直线最快的疯子，弯道里最难压住" },
  { id: "cruiser", name: "铁马 1200", en: "CRUISER 1200", vmax: 58, accel: 7.2, turn: 1.26, grip: 1.20, mass: 1.32,
    note: "重、稳、抗撞，起步肉得像拖拉机" },
];

/** 车手配色（皮衣 / 头盔 / 车架 / 描边）。机器人和真人从同一张表里取色。 */
export const PALETTES = [
  { jacket: "#ff5f7e", helmet: "#ffe066", bike: "#3ad2ff", trim: "#0d1220" },
  { jacket: "#7cf7a0", helmet: "#f8f9ff", bike: "#ffb03a", trim: "#0d1220" },
  { jacket: "#ffd166", helmet: "#ff5f7e", bike: "#8b7dff", trim: "#0d1220" },
  { jacket: "#6ad7ff", helmet: "#1ad6a8", bike: "#ff7a45", trim: "#0d1220" },
  { jacket: "#c691ff", helmet: "#ffd166", bike: "#4fe3c1", trim: "#0d1220" },
  { jacket: "#ff9f45", helmet: "#6ad7ff", bike: "#ff5f7e", trim: "#0d1220" },
  { jacket: "#f2f4ff", helmet: "#c691ff", bike: "#39d0ff", trim: "#0d1220" },
  { jacket: "#57e08a", helmet: "#ff8f5f", bike: "#ffe066", trim: "#0d1220" },
];

/** 机器人名字。故意不用"bot1/bot2"——名册上要像一屋子真人。 */
export const BOT_NAMES = [
  "铁手阿海", "夜路狂徒", "老周不刹车", "疤脸", "钢板小杨",
  "飙车阿珍", "断线风筝", "老K", "黑皮", "独眼杰克",
  "南二环之王", "油门到底", "水泥老李", "疯子大熊", "红隼",
  "冷面刀客", "半挂终结者", "雨夜独行", "三档起步", "秃鹫",
];

/** 车队/队伍名，结算页用。 */
export const TEAM_TAGS = ["赤", "青", "黄", "白"];

/** 赛前播报与结算文案。放表里是为了让"改一句话"不用碰逻辑。 */
export const LINES = {
  start: ["油门到底", "别撞大运", "上啊"],
  fling: "大运起飞！",
  wreck: "摔车",
  downed: "被撂倒",
  finish: "冲线",
  lastLap: "最后一段",
};

export const laneOffset = (lanes, i) => (i - (lanes - 1) / 2) * LANE_W;
