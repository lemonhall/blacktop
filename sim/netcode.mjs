/**
 * 输入命令队列：**服务端那一半**输入时间线。
 *
 * 为什么需要"命令"这个概念：只发"我现在按着油门"的话，服务端只能按墙上时间一帧
 * 一帧地套用最新意图，于是"客户端开了多久"和"服务端开了多久"没有对应关系——
 * 一旦消息断流、世界补算超预算，服务端会**丢掉一段时间**，而本机预测走的是真实
 * 时间，两边差出几十米，客户端只能把车硬拽回来（就是那句"人往前走了一段，又跳回
 * 一小段"）。
 *
 * 现在的协议把时间还给客户端：每 40ms 发一条命令 = "这段时间我按着这些键，走了
 * n 格（一格 = 1/60 秒）"。服务端每 tick 从队头消耗一格，走完一条就把它的序号记为
 * ack，连同**走完那一刻的位置**回给客户端。客户端从那个位置出发，把还没被确认的
 * 命令重放一遍，就得到"我自己此刻应该在哪"。
 *
 * 三条不变式（改动这里之前先读一遍）：
 *   1. 一条命令只有一组入力——操作变了就必须换新命令，否则重放会走形；
 *   2. ack 单调递增，且 ack 位置是"命令走完那一刻"的坐标，不是"现在的坐标"；
 *   3. 服务端每 tick 最多消耗一格，永远不因为消息来得快就多走——速度上限靠这个守。
 */

/** 单条命令最多声明几格。250ms 的浏览器卡顿也吃得下，再多就是客户端在吹牛。 */
export const MAX_CMD_TICKS = 20;

/** 队列总预算（格）。超了就丢**队头**（最老的入力），等于给"真实时间"封顶。 */
export const MAX_QUEUED_TICKS = 150;

/**
 * 一 tick 里最多走几格（含那"正常的一格"）。
 *
 * 为什么需要"多走"：客户端是按**真实时间**产格的（浏览器一帧补几格），而消息到达
 * 服务端却是**一坨一坨**的——开局那一拍、页面卡一下、手机切回来，都会一次送来
 * 几十格。旧规矩是"每 tick 只消耗一格"，于是那一坨会变成一条**永久存在的延迟线**：
 * 客户端按真实时间产 60 格/秒，服务端按 60 格/秒消耗，两边速率一样，积压永远不
 * 会自己消退。实测（线上房间里 14 台车、headless 浏览器）积压稳定在 73~95 格，
 * 也就是**服务端要 1.3 秒之后才用到我现在的入力**——而我画面上的车是本地预测
 * （已经走完这些入力）的，两边差出一个 v×1.3 秒 ≈ 60 米。攻击判定怎么调都不可能准。
 */
export const BURST_TICKS = 4;

/**
 * 允许"预支"的格数。它是一个**漏桶**：每 tick 只补 1 格，上限就是这个数。
 *
 * 这条上限同时是防作弊线：长期来看，一个车手最多只能按 1 格/tick（=60 格/秒）
 * 被推进，比真实时间快不了；但允许它一次性把攒下的额度花掉，用来吃掉"卡一下"
 * 送来的那一坨。没有它，一个改过的客户端只要每次宣称 20 格，就能跑到 20 倍速。
 */
export const CREDIT_MAX = 30;

/** 建号 / 摔车复位 / 重连 / 掉线：输入时间线都从零开始，ack 位置就是当前位置。 */
export function resetQueue(a) {
  a.cmds = [];
  a.queued = 0;
  a.credit = 0;
  a.ack = 0;
  a.ackZ = a.z;
  a.ackX = a.x;
  // 速度与侧滑也要一起记：赛车的位置对账只回一个坐标是不够的——从"那个坐标"
  // 出发重放，如果不知道当时跑多快、被离心力推了多少，重放出来的路径是一条直线。
  a.ackV = a.v || 0;
  a.ackLat = a.lat || 0;
  a.pendingAck = 0;
  a.lastCmdAt = 0;
}

/**
 * 收到一条上行命令。`n` 已经由调用方夹到 [0, MAX_CMD_TICKS]；`n === 0` 的命令
 * 不入队（它只是"世界别停"的心跳，客户端也没把它计入待确认列表）。
 */
export function pushCmd(a, cmd, now) {
  a.lastCmdAt = now;
  if (cmd.n <= 0) return;
  a.cmds.push(cmd);
  a.queued += cmd.n;
  while (a.queued > MAX_QUEUED_TICKS && a.cmds.length > 1) {
    const dropped = a.cmds.shift();
    a.queued -= dropped.n;
    // 丢掉的这一段不会再被走：ack 直接跳到它，位置就取"现在"。
    a.ack = dropped.sq;
    a.ackZ = a.z;
    a.ackX = a.x;
    a.ackV = a.v;
    a.ackLat = a.lat;
  }
}

/**
 * 本 tick 该用哪条命令——从队头拿一格。攻击位只在命令的第一格触发一次，
 * 否则按住的那几格会连出好几拳。
 */
export function takeCmd(a) {
  const head = a.cmds[0];
  if (!head) return null;
  const act = head.act | 0;
  // `vt`/`cvt` 和 `act` 是**同一张纸条上的几行字**：一个说"我出手了"，另外两个说
  // "我出手时屏幕上的人和车分别显示的是哪一刻"。它们一起出队、一起失效——第二格
  // 再带一次没有任何意义（拳头只在第一格挥出去），反而会让"这条命令到底描述的是
  // 哪一刻"变成一个随时会读错的问题。
  const vt = head.vt;
  const cvt = head.cvt;
  head.act = 0;
  head.vt = undefined;
  head.cvt = undefined;
  head.n--;
  a.queued--;
  if (head.n <= 0) {
    a.cmds.shift();
    // 位置要等这一格真的走完才记，所以先挂起，由 settleAck 收尾。
    a.pendingAck = head.sq;
  }
  return { th: head.th, br: head.br, st: head.st, act, nos: head.nos, vt, cvt };
}

/** 一格走完之后收尾：把"命令完成时的位置"记成权威确认点。 */
export function settleAck(a) {
  if (!a.pendingAck) return;
  a.ack = a.pendingAck;
  a.ackZ = a.z;
  a.ackX = a.x;
  a.ackV = a.v;
  a.ackLat = a.lat;
  a.pendingAck = 0;
}

/** 队列里还剩几格——诊断用（延迟越高，队列越深，代表"预测领先了多少"）。 */
export const queuedTicks = a => a.queued | 0;

/** 每 tick 给这位车手续 1 格额度（上限 `CREDIT_MAX`）。他就是靠这点额度消化积压。 */
export function grantCredit(a) {
  const c = (a.credit || 0) + 1;
  a.credit = c > CREDIT_MAX ? CREDIT_MAX : c;
}

/** 花掉一格额度。返回 `false` 表示这位车手这一 tick 已经"多走"不动了。 */
export function spendCredit(a) {
  if (!(a.credit > 0)) return false;
  a.credit--;
  return true;
}
