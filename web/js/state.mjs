/**
 * 客户端唯一的可变状态。所有模块读它、写它，不再各自维护副本。
 *
 * 和射击版（fray）最大的差别在坐标：那边是俯视的 `(x, y)`，这边是赛车的
 * **`(x, z)`**——`z` 是"沿路跑了多少米"，`x` 是"离路中心多少米"。相机永远跟在
 * 自己车后，所以画面上的远近完全由 `z` 的差值决定。
 *
 * 刻意不做成 class：这份状态里没有一条不变式需要靠封装来守，
 * 而"一个对象、打开 DevTools 就能看到全貌"对调渲染的价值远大于形式的整齐。
 */

export const S = {
  screen: "rooms",              // rooms | staging | play | over
  me: null,                     // 我自己（渲染用，已插值）
  mine: null,                   // 最新快照里我自己的原始（未插值）实体
  meId: "",
  bike: 0,                      // 我选的车型（街霸 400 / 暴走 750 / 铁马 1200）
  playerName: "车手",
  token: "",
  tenant: "",
  room: null,                   // 房间视图：名册 / 房主 / 阶段
  mode: "city",
  map: null,                    // 解码后的地图：种子 + 赛道参数 + 名册
  track: null,                  // createTrack(map) 的产物：曲率、坡度、路边道具
  seed: 0,
  snaps: [],                    // 快照环形缓冲，渲染与插值都从这里取
  serverTime: 0,
  wall: 0,                      // 最新快照的墙上时间（毫秒）；诊断用
  lastTm: 0,
  headTm: 0,                    // 渲染头此刻所在的世界时间（秒），逐帧匀速推进
  headAt: 0,
  countdown: 0,                 // 发车倒数（秒）；大于 0 时油门被锁死
  results: null,
  connected: false,
  solo: false,                  // 离线练习：世界跑在本机，没有 socket

  view: { w: 0, h: 0 },
  dpr: 1,
  cam: { x: 0, z: 0, y: 0 },    // 相机：横向跟着我，纵向贴着路面
  shake: 0,
  // 「撞击三件套」：**一拳**（视野被撞得往外张）、**一闪**（边缘染色），再加已有的
  // `shake`（随机位移）。三样都只动"看的人"，一根手指都不碰世界里的判定——服务端
  // 说了算的东西，客户端连表现都不该让它看见。
  punch: 0,                     // 0..1，只在 createCamera 里换算成视野变化
  flash: 0,                     // 0..1，`flashColor` 是 "r,g,b" 三段
  flashColor: "255,236,214",
  rtt: 0,
  hitUntil: 0,                  // 打中别人的高亮截止时刻（performance.now）

  keys: new Set(),
  touch: { steer: 0, throttle: 0, brake: 0, nitro: 0 },
  actions: 0,                   // 待发出的一次性动作位（位掩码）：1 前打、2 回身打、4 换家伙
  seq: 0,
  lastSentAt: 0,
  lastPingAt: 0,

  predictW: null,               // 本地预测用的迷你世界（只有赛道 + 我自己）
  predictMe: null,              // 本地预测出来的那台车
  cmd: null,                    // 正在累积的这一条输入命令
  cmds: [],                     // 已经发出去、还没被服务端 ack 的命令（重放用）
  cmdSeq: 0,
  swing: 0,                     // 本地出拳动画的剩余时间（秒），只影响画面
  swingBack: false,             // 上面这一拳是回身打（画面把手臂镜像到另一侧）
  pendingEvents: [],            // 还没被表现层消费掉的世界事件
};

/** 纯表现层状态：火花、跳字、烟尘、播报、胎痕。 */
export const FX = {
  // `rings` 是**地面上的冲击环**：一团火给你的是"亮"，一圈环给你的是"这一下有多重"。
  // 踹飞、落地、摔车、打中人都推一圈，半径和颜色由事件的份量决定。
  sparks: [], floaters: [], smoke: [], skid: [], rings: [],
  feed: [], announce: null, banner: null,
};
