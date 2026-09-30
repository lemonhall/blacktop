/**
 * **事件 → 表现**：服务端把这一格发生的事发下来，这里决定它看起来、听起来多响。
 *
 * 单独一间是有理由的：这一层是整个前端唯一「允许夸张」的地方（火花、播报、镜头那一拳），
 * 而它读的每一个数字都来自权威快照——位置、速度、份量一个都不在这里算。
 * 把它和「粒子怎么画、怎么衰减」分开放，改表现的时候不会碰到粒子物理。
 */

import { WEAPONS } from "../../sim/weapons.mjs";
import { S } from "./state.mjs";
import { play } from "./audio.mjs";
import { announce, burst, feed, floater, impact, ring, smoke, star } from "./fx.mjs";

/**
 * 命中那一格的拟声词。街机与美漫表达"这一下很重"从来不用数字，用的是字本身——
 * 而"打中了却没有回音"这句线上反馈，一半的答案就在这几个字上。
 *
 * 轮着用、不随机：同一场里连着两下"砰!"会显得像贴图，四五个字轮一圈则像有人在打。
 */
const SFX = ["砰!", "咚!", "哐!", "嘭!", "啪!"];
let sfxAt = 0;
const sfx = () => SFX[sfxAt++ % SFX.length];

/**
 * 一次快照里的事件全部放出来——**权威判定 → 本地表现**的唯一通道。
 * 位置和速度都不在这里算：模拟那边已经算完了，这里只决定"看起来多响"。
 */
export function consumeEvents(events, view) {
  if (!events) return;
  const mine = view && view.mine ? view.mine.id : -1;
  for (const ev of events) {
    switch (ev.k) {
      case "go":
        play("go"); announce("出发!", "油门到底", "#7cf7a0");
        break;
      case "nitro":
        play("nitro");
        break;
      // 过一圈线。三圈的比赛里这是唯一的"里程碑"——所以自己过线要正儿八经报一次，
      // 别人过线只在播报条上留一行：十五台车一起跑，谁在第几圈是看得见的信息。
      case "lap":
        feed(`${nameOf(view, ev.a)} 跑进第 ${ev.l} 圈`, "#9fd0ff");
        if (ev.a === mine && ev.l < ev.n) {
          play("lap");
          announce(`第 ${ev.l} 圈`, `还剩 ${ev.n - ev.l} 圈`, "#9fd0ff");
          floater(ev.x, ev.z, 3.1, `第 ${ev.l} 圈`, "#bfe4ff", true);
        }
        break;
      case "hit":
        // 打击感的三层：火花说"有东西亮了"，地面环说"这一下有多重"，**星芒**
        // （`star`）才说"打实了"。线上原话是"就算踢到了，也没有视觉提醒"——
        // 判定早就成立了，屏幕没有回答，这一颗星就是那个回答。
        burst(ev.x, ev.z, 1.1, "#ffd23f", 12, 16, 0.16);
        burst(ev.x, ev.z, 1.1, "#ff6a5a", 6, 10, 0.12);
        ring(ev.x, ev.z, 1.2, 0.55, "rgba(255,226,170,");
        floater(ev.x, ev.z, 2.3, `-${ev.d}`, "#ffd7a8", true);
        if (ev.a === mine) {
          // 我打的人：星芒 + 拟声词 + 屏幕正中那个小小的准星回执（`overlays.mjs`）。
          // 这三样都是"给我看的"，所以别人打别人的那十四下一条都不发——十五台车
          // 每一下都炸一颗星，屏幕上就只剩星了。
          star(ev.x, ev.z, 1.55, 1.05, "#fff6c8");
          floater(ev.x, ev.z, 3.0, sfx(), "#ffe27a", true);
          S.hitUntil = performance.now() + 170;
          play("punch");
          impact(0.3);
          // 震屏**只给一点点**：打人是我主动的一下，晃太狠反而像挨了拳。
          S.shake = Math.min(12, S.shake + 4);
        }
        else if (ev.b === mine) {
          star(ev.x, ev.z, 1.55, 1.05, "#ffbfa0");
          play("hurt"); S.shake = Math.min(14, S.shake + 7);
          impact(0.34, "255,90,78", 0.48);
        }
        break;
      // 挥空。**只给我自己回音**：十五台车每次抡空都要飘一行字，画面就成弹幕了。
      //
      // 这一条是补上来的：以前挥空只有一声轻响，玩家分不清"我打空了"和"我压根没
      // 打出去"——线上实测的攻击手感差，一半差在这里。MISS 摆在拳头够到的那一截
      // 路上（前打摆身前、回身摆身后），于是"打得着但没打中"和"方向按反了"
      // 一眼就能分开。
      case "whiff":
        if (ev.a !== mine) break;
        play("whiff");
        // `3` 是最高那一档字号（68 像素封顶、进场还能到 99，见 `render.floaterSize`），
        // 只给 MISS 用：它是全场唯一一句"你刚才那一下什么都没碰到"的判决，以前挤在
        // 普通跳字那一档里，混战当中一眼就滑过去了。颜色也提到最亮的一档白蓝——
        // 它不必比"赏金 +400"更热闹，但它绝不能被漏掉：漏掉一次，玩家就会以为
        // "我按了，游戏没理我"。
        //
        // 挂 1.35 秒（默认 1 秒）：这条反馈的意义在于"我看到了"，而不是"它出现过"。
        //
        // 顺带一小撮**冷色的空气**：命中是暖色星芒 + 火花，挥空是几粒淡蓝的碎屑。
        // 两种结果的形状与颜色都不一样，扫一眼就能分开，不必等读完那四个字母。
        burst(ev.x, ev.z, 1.6, "#9fc4e8", 5, 7, 0.09);
        floater(ev.x, ev.z + (ev.dir > 0 ? 1.4 : -1.1), 1.85, "MISS", "#eaf4ff", 3, 1.35);
        break;
      // 捡起一件：只有"是我捡的"才值得报——别人捡东西的消息十五台车会刷屏。
      case "pick":
        if (ev.a === mine) {
          play("pick");
          floater(ev.x, ev.z, 1.6, `+${weaponName(ev.w)}`, "#7cf7a0", true);
        }
        break;
      // 抢：原版最经典的一下。抢到手的人一定要播报，被抢的人也得知道发生了什么。
      case "steal":
        feed(`${nameOf(view, ev.a)} 抢走了 ${nameOf(view, ev.b)} 的${weaponName(ev.w)}`, ev.a === mine ? "#7cf7a0" : "#ffb08a");
        floater(ev.x, ev.z, 2.4, "抢!", ev.a === mine ? "#7cf7a0" : "#ff9f6a", true);
        if (ev.a === mine) { play("steal"); announce("抢到手了", `${weaponName(ev.w)} · 按 Q 换`, "#7cf7a0"); }
        else if (ev.b === mine) { play("steal", 0.7); S.shake = Math.min(18, S.shake + 8); }
        break;
      // 充能用尽：手里那件当场没了。
      case "spent":
        if (ev.a !== mine) break;
        play("spent");
        feed(`${weaponName(ev.w)} 用完了`, "#ffd23f");
        floater(ev.x, ev.z, 2.2, "没了", "#ffd23f");
        break;
      case "wreck": {
        burst(ev.x, ev.z, 0.9, "#ff8f5f", 18, 20, 0.2);
        smoke(ev.x, ev.z, 0.5, "rgba(210,205,200,.45)", 8, 0.8);
        ring(ev.x, ev.z, 0.06, 1.4, "rgba(255,196,150,");
        const heavy = ev.s === "headon" || ev.s === "rear";
        // 「我把人打下车了」是这套打法唯一的目标，也是上一版最缺的一句回音——
        // 判定成立了，屏幕上只有一行小字，玩家根本不知道自己刚刚办成了什么。
        // 所以这一条单独给一颗大星、一句大字，还要闪一下屏幕。
        const byMe = ev.by > 0 && ev.by === mine;
        if (byMe) {
          star(ev.x, ev.z, 1.9, 1.9, "#fff2b8");
          burst(ev.x, ev.z, 1.3, "#ffffff", 14, 20, 0.14);
          S.hitUntil = performance.now() + 260;
          impact(0.52, "255,238,200", 0.3);
        }
        feed(`${nameOf(view, ev.a)} 摔车${heavy ? " · 撞得太狠" : ""}`, "#ffb08a");
        if (ev.a === mine) {
          play("crash"); S.shake = Math.min(24, S.shake + 15);
          impact(0.6, "255,126,96", 0.44);
          announce("摔车了", "扶起来接着骑", "#ff9f6a");
        } else if (byMe) {
          play("down");
          S.shake = Math.min(18, S.shake + 6);
          announce("击倒!", "这一下把他从车上打下来了", "#ffd23f");
        } else if (view && Math.abs(ev.z - (view.mine ? view.mine.z : 0)) < 90) {
          play("crash", 0.5);
        }
        break;
      }
      // 一脚把一台社会车辆踹上天。**十三种车都走这一条**——大运只是赏金最高的那一台，
      // 所以它才配一句播报，别的车就在头顶跳个钱数。
      case "fling": {
        const car = CAR_NAME[ev.kind] || "车";
        // 踹飞是社会车辆"完蛋"的那一下，所以它配的是最大的一颗星——踢中了要有回音，
        // 而"一脚把它踹上天"该有的回音不能比"打了人一拳"小。
        star(ev.x, ev.z, 1.6, ev.kind === "dayun" ? 2.2 : 1.5, "#ffe9a0");
        burst(ev.x, ev.z, 1.5, "#ffd23f", 26, 26, 0.24);
        burst(ev.x, ev.z, 0.9, "#ff9f5a", 12, 18, 0.18);
        ring(ev.x, ev.z, 0.06, ev.kind === "dayun" ? 2.1 : 1.25);
        feed(`${nameOf(view, ev.a)} 一脚踹飞了一台${car}`, "#ffd23f");
        floater(ev.x, ev.z, 2.7, `+${ev.pay || 0}`, "#ffd23f", ev.kind === "dayun");
        if (ev.kind === "dayun") announce("大运起飞!", `这一脚值 ${ev.pay || 0}`, "#ffd23f");
        play("fling");
        if (ev.a === mine) {
          const big = ev.kind === "dayun";
          S.shake = Math.min(26, S.shake + (big ? 15 : 9));
          // 踹飞是**主动**的爽，所以配暖白一闪：红闪留给"我挨了一下"，两者不能混。
          impact(big ? 0.85 : 0.5, "255,238,200", big ? 0.46 : 0.24);
        }
        break;
      }
      // 一脚把一头畜生踹上天。它是彩蛋，所以文案和音效都另给一套。
      case "beast": {
        burst(ev.x, ev.z, 1.2, "#f2e8d4", 18, 20, 0.2);
        smoke(ev.x, ev.z, 0.7, "rgba(200,190,170,.4)", 4, 0.6);
        feed(`${nameOf(view, ev.a)} 一脚踹飞一头${ev.n || "畜生"}`, "#ffe0a8");
        floater(ev.x, ev.z, 2.3, `+${ev.pay || 0}`, "#ffe0a8", true);
        if (ev.kind === "cow") announce("牛上天了", `这一脚值 ${ev.pay || 0}`, "#ffe0a8");
        play("fling", 0.7); play("moo");
        if (ev.a === mine) { S.shake = Math.min(24, S.shake + 12); impact(0.4, "255,236,190", 0.18); }
        break;
      }
      // 撞上一头走路的畜生：慢速只是晃一下（`soft`），上了速度就是一次摔车。
      case "moo": {
        const near = view && view.mine ? Math.abs(ev.z - view.mine.z) < 70 : false;
        smoke(ev.x, ev.z, 0.6, "rgba(210,200,180,.42)", 5, 0.55);
        if (ev.soft) {
          feed(`撞上一头${ev.n || "畜生"} · 只是晃了一下`, "#ffd7a8");
          if (ev.a === mine) {
            play("hurt"); S.shake = Math.min(12, S.shake + 6);
            impact(0.2, "255,206,176", 0.16);
          }
        } else {
          burst(ev.x, ev.z, 0.8, "#e8b48a", 14, 16, 0.18);
          feed(`${nameOf(view, ev.a)} 撞上了一头${ev.n || "畜生"}`, "#ffb08a");
          if (near) play("moo", 0.8);
          if (ev.a === mine) { S.shake = Math.min(20, S.shake + 10); impact(0.46, "255,132,108", 0.34); }
        }
        break;
      }
      // 被踹飞的那台车落地（或炸开）。这是"它真的完了"那一声。
      case "boom": {
        const b = ev.b || 1;
        burst(ev.x, ev.z, 1.0, "#ffb24a", Math.round(18 + b * 14), 22 + b * 8, 0.26);
        burst(ev.x, ev.z, 0.6, "#ff6a4a", Math.round(10 + b * 8), 16, 0.2);
        ring(ev.x, ev.z, 0.05, 1.4 + b * 0.5);
        // 落地这一下要**两段烟**：贴着地的一团亮灰（扬起来的土），
        // 和往上翻的一柱黑（烧起来的那台车）。只有一柱黑，看着像车消失了。
        smoke(ev.x, ev.z, 1.1, "rgba(48,44,42,.55)", Math.round(8 + b * 7), 0.9 + b * 0.4);
        smoke(ev.x, ev.z, 0.2, "rgba(196,186,172,.4)", Math.round(5 + b * 4), 0.7 + b * 0.3);
        if (view && view.mine && Math.abs(ev.z - view.mine.z) < 120) {
          play("boom"); S.shake = Math.min(34, S.shake + 10 + b * 7);
          // 落地是第二次心动：车被踹出去那一下已经砸过一拳了，这一下砸在**远**处，
          // 所以份量只跟车的大小走，不跟"是不是我踹的"走。
          impact(0.25 + b * 0.22, "255,168,112", 0.26);
        }
        break;
      }
      case "dayun":
        feed("前方有辆大运", "#ffd23f");
        break;
      case "finish":
        if (ev.h) feed(`${ev.n} 冲线 · 第 ${ev.r} 名`, "#7cf7a0");
        if (ev.a === mine) play("finish");
        break;
      default: break;
    }
  }
}

const nameOf = (view, id) => {
  if (!view) return "有人";
  if (view.mine && view.mine.id === id) return "你";
  const r = view.racers.find(x => x.id === id);
  return r ? r.name : "有人";
};

/** 车流的中文名。播报里说"踹飞一台重卡"比"踹飞一台 truck"强一百倍。 */
export const CAR_NAME = {
  car: "轿车", oncom: "来车", police: "警车", pickup: "皮卡", trike: "三轮车",
  tractor: "拖拉机", van: "厢货", truck: "重卡", bus: "公交", container: "半挂",
  tanker: "油罐车", mixer: "搅拌车", dayun: "大运",
};

/** 线协议里发的是家伙的名字（`"chain"`），这里翻成给玩家看的那两个字。 */
const weaponName = id => {
  const spec = WEAPONS.find(w => w.id === id);
  return spec ? spec.name : "家伙";
};
