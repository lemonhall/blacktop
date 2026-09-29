/**
 * 八种"地上"的配色：路面、路缘石、车道线、路肩、雾、颗粒。
 *
 * 一张表管一条路的**下半张画**。为什么单独一个文件：`road.mjs` 里的投影算法
 * 一年也改不了一次，而"沙漠的柏油该是偏黄还是偏灰"是天天在调的事——把这两件事
 * 塞在一个文件里，改配色就得先读懂透视。
 *
 * 每个字段都在画面上有明确的一处：
 *   - `road` / `rumble` 各两档：路面和路缘石的斑马纹按 z 轮着用这两档；
 *   - `lane` 是车道虚线，`divider` 是分隔双向车流的那条实线（它比虚线亮、且比它粗）；
 *   - `shoulder` 同样是两档，铺满整幅画面（路肩外面就是它）；
 *   - `fog` 是地平线附近那条带子的颜色：远处的东西都往它上面化；
 *   - `grain` 是颗粒贴图的种类（`grain.mjs` 里有两张：沥青和土）；
 *   - `building` 是路边楼房的墙身本色，`wet` 是路面上那层"反光"的强度。
 */

export const GROUNDS = {
  // 夜色环路：湿沥青 + 黄色分隔线 + 暖雾
  city: {
    road: ["#23262f", "#1e212a"], rumble: ["#c8475a", "#eef1f8"],
    lane: "rgba(238,243,255,.5)", divider: "rgba(233,194,87,.62)",
    shoulder: ["#171c27", "#141821"], fog: "rgba(72,46,72,.85)",
    grain: "asphalt", wet: 0.1, building: "#2c2f3f", haze: "#4a2f46",
  },
  // 海崖公路：海边的沥青被晒得发白，路肩是碎石
  coast: {
    road: ["#3c3b3a", "#373635"], rumble: ["#e6e2d8", "#a8b6c2"],
    lane: "rgba(255,252,240,.55)", divider: "rgba(240,200,110,.62)",
    shoulder: ["#8d8272", "#7d7466"], fog: "rgba(176,198,214,.82)",
    grain: "sand", wet: 0.06, building: "#4a4a50", haze: "#9fb4c4",
  },
  // 荒野公路：土路肩 + 正午的白雾
  open: {
    road: ["#5f5d57", "#565550"], rumble: ["#e2dccb", "#b2473f"],
    lane: "rgba(252,250,242,.52)", divider: "rgba(233,194,87,.6)",
    shoulder: ["#8c7c56", "#7d7048"], fog: "rgba(205,222,236,.8)",
    grain: "dirt", wet: 0, building: "#8a8479", haze: "#c3d3de",
  },
  // 沙漠干道：黄沙 + 被晒化的柏油（偏棕，裂纹感靠颗粒）
  desert: {
    road: ["#5b544a", "#544e45"], rumble: ["#f0e4c8", "#b98a4a"],
    lane: "rgba(255,250,235,.5)", divider: "rgba(236,196,104,.58)",
    shoulder: ["#c8a468", "#b9955c"], fog: "rgba(232,205,158,.78)",
    grain: "sand", wet: 0, building: "#a08a6c", haze: "#e0c79c",
  },
  // 红杉林道：几乎看不到天的路，路肩是落叶，雾是墨绿的
  forest: {
    road: ["#3a3a36", "#343430"], rumble: ["#cfc9b6", "#8a5c46"],
    lane: "rgba(248,246,232,.46)", divider: "rgba(226,190,96,.5)",
    shoulder: ["#4d4a33", "#43412c"], fog: "rgba(96,112,86,.78)",
    grain: "dirt", wet: 0.04, building: "#5a5340", haze: "#6d7a5c",
  },
  // 雪原山口：白路肩 + 冷雾，路面是撒了盐的深灰
  snow: {
    road: ["#494d55", "#43474e"], rumble: ["#eef2f8", "#b9c4d2"],
    lane: "rgba(240,246,255,.55)", divider: "rgba(200,216,236,.6)",
    shoulder: ["#dfe6f0", "#cbd5e2"], fog: "rgba(214,226,238,.86)",
    grain: "snow", wet: 0.12, building: "#7c7f88", haze: "#dce6f0",
  },
  // 工业支线：水泥灰 + 橙黄的分隔线 + 粉尘雾
  works: {
    road: ["#3b3d3c", "#353736"], rumble: ["#d8c184", "#8e9296"],
    lane: "rgba(246,240,214,.5)", divider: "rgba(244,166,52,.66)",
    shoulder: ["#5c5c53", "#525249"], fog: "rgba(120,112,98,.8)",
    grain: "dirt", wet: 0.08, building: "#4c4f52", haze: "#7c7264",
  },
  // 霓虹夜市：下过雨的柏油、倒映着一整条街的招牌
  neon: {
    road: ["#282a35", "#232530"], rumble: ["#f4e2c0", "#6a5a8e"],
    lane: "rgba(246,244,255,.55)", divider: "rgba(255,180,64,.68)",
    shoulder: ["#1d1f2c", "#191b26"], fog: "rgba(88,60,110,.82)",
    grain: "asphalt", wet: 0.38, building: "#33303f", haze: "#6b4a86",
  },
};

/**
 * 取一套地面配色。**允许传模式 id 或者地面 id**：调用方有的地方手里只有
 * `S.mode`（房间配置），有的地方只有 `track.ground`（赛道对象）。两种都能用，
 * 少一处"我该传哪个"的犹豫。
 */
export const tonesOf = key => GROUNDS[key] || GROUNDS[MODE_GROUND[key]] || GROUNDS.city;

/** 模式 id → 地面 id。只用来兜底，所以是一张手写的小表。 */
const MODE_GROUND = {
  city: "city", coast: "coast", wild: "open", desert: "desert",
  forest: "forest", snow: "snow", works: "works", neon: "neon",
};
