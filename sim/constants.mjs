/**
 * 共享内核的常量层：纯数据 + 纯函数，不碰 DOM、不碰 Node、不碰 Cloudflare API。
 *
 * 这一层被两个宿主同时 import：Durable Object（权威端）与浏览器（预测与渲染）。
 * 只要这里出现任何宿主专属的东西，两边就会开始漂移，所以这里是硬边界。
 */

export const TAU = Math.PI * 2;

/** 固定步长：60Hz。客户端与服务端必须用同一个 dt 推进，否则模拟会漂。 */
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

/** 服务端每 3 个 tick（50ms / 20Hz）广播一次快照。 */
export const SNAPSHOT_EVERY_TICKS = 3;

/**
 * 单次补算最多多少步（60Hz 下的 4 秒），防止长时间挂起后把 DO 的 CPU 拖爆。
 * 上限不能太小：跨境链路上一次 500ms 的断流就会让世界"丢掉"那段墙上时间，
 * 而客户端的本地预测走的是真实时间，两边于是差出几十米——表现就是"车自己往
 * 前蹿了一段，又被拽回来"。世界的时间不该随便丢。
 */
export const MAX_CATCHUP_TICKS = 240;

/** 米/秒 → 公里/小时。仪表盘上写的是后者。 */
export const KMH = 3.6;

/** 车道宽与路肩宽（米）。四车道 = 14.4 米，两侧各 2.8 米路肩。 */
export const LANE_W = 3.6;
export const SHOULDER_W = 2.8;

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const round = n => Math.round(n);

/** 秒 → `mm:ss`。仪表盘和结算页共用。 */
export const clock = n =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(Math.floor(n % 60)).padStart(2, "0")}`;

/** 秒 → `mm:ss.d`：比赛中用来显示"和第一名的差距"。 */
export const clock1 = n =>
  `${clock(n)}.${Math.floor((n % 1) * 10)}`;
