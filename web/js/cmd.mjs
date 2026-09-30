/**
 * 客户端那一半输入时间线：把"我这几帧按着哪些键、走了几格"打成一条命令。
 *
 * 一条命令里只有一组入力——这是服务端能逐格重放的前提。所以油门/刹车/压车
 * 任何一项变了，就顺手把上一条收尾发走；**出拳额外强制切一条新命令**，否则
 * "这一拳"会被挂到一条几十毫秒前就已经在走的命令头上，落在服务端就成了
 * "我抬手之前就已经打出去"。
 *
 * 格数（`n`）是这条命令的全部意义：25Hz 上行时它通常是 2~3；浏览器卡一下会是 6~8；
 * 发车倒数里它是 0（那时油门锁死，声明几格都是骗人，但消息本身还要发——
 * 世界的推进是被消息驱动的，一条都不来，倒数就永远走不完）。
 */

import { S } from "./state.mjs";

export const SEND_MS = 40;

/** 待确认列表的兜底上限：服务端彻底不回 ack 时，别让内存无限涨。 */
const MAX_PENDING = 400;

/** 压车量化到 1/16：键盘是 ±1 无所谓，摇杆的细微抖动不该把命令切得粉碎。 */
const QUANT = 16;
const quant = v => Math.round(v * QUANT) / QUANT;

let post = () => {};

/** 注入发送函数，避免这一层去 import 网络层（那会绕出一个循环依赖）。 */
export function initCmds(fn) { post = fn; }

export function resetCmds() {
  S.cmds = [];
  S.cmd = null;
  S.cmdSeq = 0;
  S.lastSentAt = 0;
}

const keyOf = c => `${c.th}|${c.br}|${quant(c.st)}|${c.nos ? 1 : 0}`;

/**
 * 本帧要预测的操作（也就是要写进命令的那一组）。返回的命令对象由调用方
 * 逐格 `noteTick`，再定期 `flushCmd` 出去。
 */
export function frameInput(now, controls) {
  const key = keyOf(controls);
  const punch = (S.actions | 0) !== 0;
  const cur = S.cmd;
  if (cur && cur.n > 0 && (cur.key !== key || punch)) { flush(); S.lastSentAt = now; }
  if (!S.cmd) S.cmd = { sq: ++S.cmdSeq, ...controls, st: quant(controls.st), key, n: 0 };
  else if (S.cmd.n === 0) Object.assign(S.cmd, controls, { st: quant(controls.st), key });
  return S.cmd;
}

/**
 * 走了一格。**第一格就把这条命令挂进待确认列表**——这一步不能等到 flush：
 * 快照随时可能在两条命令之间落地，对账时是"权威确认点 + 待确认命令重放"，
 * 如果正在走的那条还没进列表，它对账时就会凭空少走几格，画面上就是一次小回退。
 */
export function noteTick(cmd) {
  if (!cmd.tracked) { cmd.tracked = true; S.cmds.push(cmd); }
  cmd.n++;
}

/** 到点就把当前命令收尾发出去。返回是否真的发了。 */
export function flushCmd(now, force = false) {
  if (!S.cmd) return false;
  if (!force && now - S.lastSentAt < SEND_MS) return false;
  if (!flush()) return false;
  S.lastSentAt = now;
  return true;
}

/**
 * 收尾：把命令打成一条上行报文。
 *
 * `act`（出拳那一票）在这里被消费掉——它由**最先发生的那次 flush**带走。
 */
function flush() {
  const cmd = S.cmd;
  if (!cmd) return false;
  S.cmd = null;
  const act = S.actions | 0;
  S.actions = 0;
  post({
    t: "in", sq: cmd.sq, th: cmd.th, br: cmd.br, st: cmd.st,
    nos: cmd.nos ? 1 : 0, act, n: cmd.n,
    // `vt` / `cvt`：**我此刻屏幕上那幅画是哪一刻**。画面里所有东西——我自己、
    // 其他车手、车流、畜生——现在都画在同一个时刻上（见 `view.mjs` 的 `leadTime`），
    // 所以这两个字段是同一个值，服务端拿它做攻击回看（`sim/history.mjs`）。
    // 不带上它，我的拳头就只能按"服务端此刻"算，而两边的世界差着十几米。
    // 还没进赛道（没有画面）时不发：让服务端退回"用当下"。
    vt: S.carTm > 0 ? Math.round(S.carTm * 1000) / 1000 : undefined,
    cvt: S.carTm > 0 ? Math.round(S.carTm * 1000) / 1000 : undefined,
  });
  if (S.cmds.length > MAX_PENDING) S.cmds.splice(0, S.cmds.length - MAX_PENDING);
  return true;
}
