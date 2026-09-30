/**
 * 距离灯：**告诉玩家"现在按 J 够不够得着"**。
 *
 * 为什么要专门做这么一个东西：玩法和判定都写好了，玩家却用不起来。线上实测的
 * 数字很直白——人按 51 次 J，命中 4 次；同一个房间里机器人 91%。差别不在手快，
 * 在**人不知道自己站在哪、该往哪边蹭**：并排跑在邻道上（两条车道中心差 3.6 米）
 * 画面上明明贴着，判定却还差一截。所以这里要说的不是"你打不着"，而是
 * "往左一点就够着了"。
 *
 * 一条铁律：**灯和判定必须是同一段代码**（`sim/combat.mjs` 的 `aimAt`）。两处
 * 各写一份窗口，迟早会漂成"灯亮着却打空"——那比没有灯更伤，因为它教会玩家
 * 不信任界面。这里唯一多出来的是 `nudgeTarget`：同一个 z 窗口、横向放宽一档，
 * 只用来点亮"靠过去"那三个字。
 */

import { aimAt, nudgeTarget } from "../../sim/combat.mjs";
import { WEAPONS, heldWeapon } from "../../sim/weapons.mjs";

/** 世界替身：每帧复用同一个对象，免得 60Hz 掉出一地短命垃圾。 */
const world = { racers: null, traffic: null, critters: null, time: 0 };

/** 两块牌子：前打一块、回身一块。`off` 是不亮时写在牌子上的那几个字。 */
const LAMPS = [
  { id: "hudRangeFwd", dir: 1, off: "前 ▶" },
  { id: "hudRangeBack", dir: -1, off: "◀ 后" },
];

/** 亮起来之后跟在后头的那个字。`left`/`right` 是"够不着，但靠过去就够得着"。 */
const WORD = { car: "车", beast: "牛", man: "人", left: "靠左", right: "靠右" };

/**
 * 每帧一次。`view` 就是画面上的那一刻（`view.mjs` 插值 + 补帧之后的产物），
 * 也就是说：灯说的是**玩家此刻眼睛里那个世界**里够不够得着。
 */
export function rangeLamps(view, doc = globalThis.document) {
  const me = view && view.mine;
  // 摔车的时候打不了人，灯就该灭着。亮着而按下去没反应，是最坏的一种界面。
  const live = !!(me && me.state === "ride");
  if (live) {
    world.racers = view.racers;
    world.traffic = view.traffic;
    world.critters = view.critters;
    // 用**画面那一刻**而不是插值头那一刻：服务端判"刚被打过的人"用的是它自己的
    // "此刻"，而画面那一刻已经是离它最近的那个数了。
    world.time = Number.isFinite(view.carTime) ? view.carTime : view.time;
  }
  const reach = live ? reachOf(me) : 0;
  for (const lamp of LAMPS) {
    const node = doc.getElementById(lamp.id);
    if (!node) continue;
    paint(node, live ? look(me, lamp.dir, reach) : "off", lamp.off);
  }
}

/** 这一下会打在什么上——`aimAt` 的答案，外加"旁边的那个"。 */
function look(me, dir, reach) {
  const aim = aimAt(world, me, dir, null, reach);
  if (aim.kind === "car") return "car";
  if (aim.kind === "beast") return "beast";
  if (aim.target) return "man";
  const near = nudgeTarget(world, me, dir, reach, null);
  if (!near) return "off";
  return near.x > me.x ? "right" : "left";
}

/** 手里那一件往前多伸出去几米——和 `combat.attack` 用的是同一张表、同一个下标。 */
function reachOf(me) {
  const held = heldWeapon(me);
  const spec = held ? WEAPONS[held.i] : null;
  return (spec && spec.reach) || 0;
}

/** 只在真的变了的时候写 DOM：60Hz 换 className 会让手机上的布局白烧一遍。 */
function paint(node, state, off) {
  const text = state === "off" ? off : `${off} ${WORD[state] || ""}`.trim();
  const cls = `range-chip${state === "off" ? "" : ` on ${state}`}`;
  if (node.textContent !== text) node.textContent = text;
  if (node.className !== cls) node.className = cls;
}
