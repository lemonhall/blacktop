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
  // 正午的荒野：亮蓝 + 平底积云 + 高处卷云 + 两排远山
  noon: {
    sky: [[0, "#2a67bd"], [0.46, "#5f9fd8"], [0.78, "#a9cbe6"], [1, "#dfeaf1"]],
    layers: ["cirrus", "clouds", "ridge", "ridge"],
    cirrus: { count: 9, seed: 13, color: "255,255,255", alpha: 0.1, y0: 0.04, span: 0.2 },
    // 云底压的那层蓝灰是**云自己的影子**：没有它，白云贴在蓝天上就是一张贴纸
    clouds: {
      count: 6, color: "253,253,255", alpha: 0.72, jitter: 0.16,
      y0: 0.1, y1: 0.34, w0: 0.1, w1: 0.13, flat: 0.3,
      shade: "146,176,214", shadeA: 0.62,
    },
    ridge: [
      { color: "rgba(126,156,178,.72)", tall: 0.3, seed: 23, step: 18 },
      { color: "rgba(84,116,138,.85)", tall: 0.14, seed: 29, step: 26 },
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
    // 顶上那一档**不能太黑**：树冠已经压在上面了，天空再黑，远景就成了一堵墙。
    // 留一点发绿的亮，人才能感觉到"前面的路是往林子深处去的"。
    sky: [[0, "#16270f"], [0.34, "#26401a"], [0.62, "#4a6420"], [0.84, "#8f9440"], [1, "#ded291"]],
    // 次序是有讲究的：**光柱画在最后**。上一版光柱垫在最底下，被二十几根树干盖得
    // 只剩一点影子——林子的"深"全靠这几道光，它们必须落在树干**前面**。
    layers: ["glow", "mist", "standing", "standing", "canopy", "shafts"],
    // 路尽头的亮：一条林道如果尽头也是黑的，看着就像撞墙
    glow: { x: 0.5, y: 0.96, r: 0.34, color: "rgba(226,238,166,.42)" },
    shafts: { count: 6, color: "rgba(255,246,190,", alpha: 0.3 },
    standing: [
      { color: "#0e1c0b", count: 20, seed: 61, w: 0.045, branch: false },
      { color: "#1d2f14", count: 26, seed: 67, w: 0.032, branch: true, shade: "rgba(10,20,8,.42)" },
    ],
    canopy: {
      count: 15, seed: 71, color: "#0c1809", color2: "#16240e",
      rim: "rgba(178,208,120,.22)",
    },
    mist: {
      depth: 0.34, none: "rgba(180,200,150,0)",
      mid: "rgba(186,204,152,.3)", bot: "rgba(206,216,168,.44)",
    },
  },
  // 雪原：阴天的白。山是**有明暗面**的白，天是冷的灰，一条很淡的亮带说明太阳在哪
  snow: {
    // 顶上那一档比上一版**深了三成**：原来天和雪地都是接近 #eef2f7，地平线整条糊没了。
    sky: [[0, "#75839a"], [0.34, "#93a1b4"], [0.66, "#c2cdda"], [0.88, "#e3ebf3"], [1, "#f4f8fc"]],
    layers: ["sun", "snowridge", "snowridge", "mist", "snowfall"],
    sun: { x: 0.6, y: 0.52, r: 0.26, color: "rgba(255,253,244,.5)", halo: "rgba(255,240,214,.22)" },
    snowridge: [
      // 远的那层：**更淡、更蓝**，不是更暗。
      // 这是大气透视——远处的山退进天光里，和天几乎同色；上一版把远山画暗，
      // 结果它看着比近山还近。齿距也必须**远大于**近层，否则两排锯齿叠在一起
      // 是一把折扇，不是两列山。
      // 齿距必须**远大于**近层——两条一样密的锯齿叠在一起是一排折扇，不是两列山。
      { color: "#c3cedd", shade: "rgba(152,166,188,.34)", cap: "#eaf1f9", capAt: 0.42,
        tall: 0.46, seed: 71, step: 104 },
      // 近的那层：亮面是雪、暗面是岩，雪线压得低，山尖才有分量
      { color: "#e9f0f8", shade: "rgba(126,144,170,.5)", cap: "#ffffff", capAt: 0.4,
        tall: 0.3, seed: 79, step: 58 },
    ],
    mist: {
      depth: 0.3, bands: 0, none: "rgba(228,238,247,0)",
      mid: "rgba(228,238,247,.42)", bot: "rgba(234,242,250,.66)",
    },
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
