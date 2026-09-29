/**
 * 八种天的**数值表**。只有数据，没有逻辑——和 `sim/maps.mjs` 同一个路子。
 *
 * 一条表说四件事：**渐变怎么走**（`sky`）、**要画哪几层**（`layers`）、
 * 以及那几层各自的颜色与尺度（`stars` / `sun` / `skyline` / …）。
 * 层名对应 `sky.mjs` 里 `PAINT` 的键。加第九种天只需要在这里加一张表。
 *
 * 为什么值得单独一个文件：天色是**天天在调**的东西（"沙漠的正午该更白一点"），
 * 而绘制代码一年也改不了一次。混在一起的话，改一个色号要先读完两百行画法。
 */

/** 每一种天：渐变停靠点 + 要画哪几层 + 那几层的颜色与尺度。 */
export const PALETTES = {
  // 傍晚的城市：上深下橙，楼群是两排锯齿
  dusk: {
    sky: [[0, "#080b1c"], [0.42, "#221a44"], [0.72, "#6b3560"], [0.9, "#d1704f"], [1, "#f2a866"]],
    layers: ["stars", "sun", "skyline", "skyline"],
    stars: 90,
    sun: { x: 0.68, y: 0.8, r: 0.22, color: "rgba(255,206,138,.85)", halo: "rgba(255,140,90,.28)" },
    skyline: [
      { color: "#120d22", tall: 0.52, seed: 16, count: 21 },
      { color: "#1d1633", tall: 0.34, seed: 27, count: 43 },
    ],
  },
  // 海边的清晨：从靛蓝一层层转成金色，海面上有一条反光
  coast: {
    sky: [[0, "#123a63"], [0.36, "#4f83ab"], [0.62, "#d8a682"], [0.82, "#f6c98a"], [1, "#ffe7bd"]],
    layers: ["stars", "sun", "seaband", "waves"],
    stars: 26,
    sun: { x: 0.32, y: 0.68, r: 0.16, color: "rgba(255,240,205,.9)", halo: "rgba(255,190,130,.3)" },
    seaband: "#2c5f86", waves: "#9fd0e4",
  },
  // 正午的荒野：亮蓝 + 薄云 + 两排远山
  noon: {
    sky: [[0, "#2f6fc4"], [0.6, "#7fb2e0"], [1, "#cfe2ee"]],
    layers: ["clouds", "ridge", "ridge"],
    clouds: { count: 7, color: "rgba(255,255,255,", alpha: 0.18 },
    ridge: [
      { color: "rgba(120,150,170,.75)", tall: 0.26, seed: 23, step: 18 },
      { color: "rgba(90,120,140,.8)", tall: 0.12, seed: 29, step: 26 },
    ],
  },
  // 沙漠：天白得发黄，一颗高挂的太阳，地平线是滚烫的沙丘
  desert: {
    sky: [[0, "#5f8fbe"], [0.42, "#c9d8dd"], [0.74, "#f0dcb0"], [1, "#f6e3bd"]],
    layers: ["sun", "heat", "dunes"],
    sun: { x: 0.5, y: 0.82, r: 0.13, color: "rgba(255,252,224,.95)", halo: "rgba(255,214,140,.34)" },
    dunes: [
      { color: "rgba(206,170,112,.9)", tall: 0.22, seed: 41 },
      { color: "rgba(180,144,90,.9)", tall: 0.12, seed: 47 },
    ],
  },
  // 红杉林：天几乎看不见，光从树缝里漏下来，贴地一层绿雾
  forest: {
    sky: [[0, "#0d1a0a"], [0.34, "#1e3212"], [0.62, "#40541c"], [0.84, "#8a8c3c"], [1, "#d6cb84"]],
    layers: ["shafts", "mist", "standing", "standing", "canopy"],
    shafts: { count: 9, color: "rgba(255,246,190,", alpha: 0.2 },
    standing: [
      { color: "#0c180a", count: 24, seed: 61, w: 0.05, branch: false },
      { color: "#15240d", count: 30, seed: 67, w: 0.036, branch: true, shade: "rgba(10,20,8,.5)" },
    ],
    canopy: { count: 17, seed: 71, color: "#0a1408", color2: "#132009" },
    mist: {
      depth: 0.34, none: "rgba(180,200,150,0)",
      mid: "rgba(186,204,152,.3)", bot: "rgba(206,216,168,.44)",
    },
  },
  // 雪原：阴天的白。山脊是白的、天是灰的，只有一条很淡的亮带说明太阳在哪
  snow: {
    sky: [[0, "#8e9aac"], [0.44, "#b9c4d2"], [0.74, "#dde6ef"], [1, "#f2f6fa"]],
    layers: ["sun", "peaks", "snowfall"],
    sun: { x: 0.62, y: 0.6, r: 0.2, color: "rgba(255,255,255,.45)", halo: "rgba(255,255,255,.2)" },
    peaks: [
      { color: "#c3ccd8", tall: 0.42, seed: 71, step: 34 },
      { color: "#e6edf5", tall: 0.22, seed: 73, step: 21 },
    ],
  },
  // 工业区：天是脏的，地平线上一排吊车加一支废气燃烧塔
  works: {
    sky: [[0, "#101623"], [0.44, "#232c3b"], [0.74, "#4a4033"], [1, "#7a5530"]],
    layers: ["stars", "glow", "cranes", "plume"],
    stars: 40,
    glow: { x: 0.72, y: 0.94, r: 0.4, color: "rgba(255,150,60,.36)" },
    cranes: { color: "#0b0f17", count: 12, seed: 83 },
    plume: { x: 0.72, color: "rgba(90,80,74,.5)" },
  },
  // 霓虹夜市：下过雨的夜，地平线被招牌染成紫色
  neon: {
    sky: [[0, "#0a0a1a"], [0.4, "#2a1240"], [0.68, "#5c1f52"], [0.88, "#a8465a"], [1, "#d9793f"]],
    layers: ["stars", "glow", "neon", "skyline"],
    stars: 54,
    glow: { x: 0.5, y: 0.96, r: 0.6, color: "rgba(150,60,190,.3)" },
    neon: [
      { x: 0.12, color: "rgba(255,80,150,.5)" }, { x: 0.3, color: "rgba(90,240,255,.5)" },
      { x: 0.52, color: "rgba(255,210,80,.5)" }, { x: 0.74, color: "rgba(140,110,255,.5)" },
      { x: 0.9, color: "rgba(90,255,180,.45)" },
    ],
    skyline: [{ color: "#120a1e", tall: 0.46, seed: 91, count: 19 }],
  },
};

/** 模式 id → 天色 id。赛道对象里已经带了 `sky`，这张表是给"只拿到模式"的调用方兜底。 */
export const BY_MODE = {
  city: "dusk", coast: "coast", wild: "noon", desert: "desert",
  forest: "forest", snow: "snow", works: "works", neon: "neon",
};
