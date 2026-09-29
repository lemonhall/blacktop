/**
 * 赛制与车型的数值表。**只有数据，没有逻辑**——这样调平衡不用读任何代码。
 *
 * 一场比赛满员 15 台车（1 名玩家 + 14 个对手），这个数字是照着 1991～1996 那几代
 * 《暴力摩托》定的：当年的规则就是"跑进前四名才算过关，而场上有十四个人"。
 * 我们把它当上限（`MAX_RACERS`），两个真人各带一堆机器人正好填满。
 */

import { LANE_W } from "./constants.mjs";

export const MAX_RACERS = 15;

/*
 * 八条赛道的表住在 `maps.mjs`——它比这个文件里的任何一张表都长（八条路 × 五个
 * 维度），而且是"哪天再加一条路"时唯一要改的地方。这里转出去，是为了让所有
 * 既有调用方继续 `import { MODES } from "./data.mjs"`，而不必关心表搬过家。
 */
export { MODE_IDS, MODES } from "./maps.mjs";

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

export const laneOffset = (lanes, i) => (i - (lanes - 1) / 2) * LANE_W;
