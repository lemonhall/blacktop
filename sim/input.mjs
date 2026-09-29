/**
 * 上行输入的两种写法。
 *
 * 新协议发的是**量化的连续量**（`th` 油门、`br` 刹车、`st` 压车 -1..1），
 * 老协议发的是位掩码 `k`。两条都认，是因为"前端更新、后端还没发版"的那个窗口
 * 里，玩家不该suddenly 拧不动油门。位掩码永远只是兼容层，不是主路径。
 */

export const KEY_BITS = { throttle: 1, brake: 2, left: 4, right: 8, nitro: 16 };

export function decodeKeys(k) {
  const bits = Number(k) | 0;
  return {
    th: bits & KEY_BITS.throttle ? 1 : 0,
    br: bits & KEY_BITS.brake ? 1 : 0,
    st: (bits & KEY_BITS.right ? 1 : 0) - (bits & KEY_BITS.left ? 1 : 0),
    nos: !!(bits & KEY_BITS.nitro),
  };
}

/** 把一条上行报文补齐成一次完整的入力。缺字段一律按"没按"处理。 */
export function readInput(msg) {
  const legacy = decodeKeys(msg.k);
  const st = Number.isFinite(msg.st) ? clampAxis(msg.st) : legacy.st;
  return {
    th: msg.th === undefined ? legacy.th : (msg.th ? 1 : 0),
    br: msg.br === undefined ? legacy.br : (msg.br ? 1 : 0),
    st,
    nos: msg.nos === undefined ? legacy.nos : !!msg.nos,
  };
}

const clampAxis = v => Math.max(-1, Math.min(1, Number(v) || 0));
