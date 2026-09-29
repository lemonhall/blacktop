/**
 * 表现层：火花、尘土、跳字、播报、胎痕。
 *
 * 全部由**事件**驱动——权威端说"这里发生了一次摔车"，客户端自己决定摔成什么样。
 * 用的是独立的 cosmetic 随机流，所以表现层的随机永远不会影响判定：
 * 一台机器少画两粒火星，不会让整条路上的车流错位。
 *
 * 粒子活**世界坐标**里（x 是横向、z 是沿路、y 是离地），所以它们和车一样会被
 * 投影、会被地形挡住、会随着跑远变小。铺在屏幕坐标上的粒子看起来永远"贴着镜头"，
 * 那是俯视游戏的做法，放在这里一眼就假。
 */

import { TAU } from "/sim/constants.mjs";
import { cosmeticRng } from "/sim/rng.mjs";
import { WEAPONS } from "/sim/weapons.mjs";
import { FX, S } from "./state.mjs";
import { play } from "./audio.mjs";

let rnd = cosmeticRng(1);
export function seedFx(seed) { rnd = cosmeticRng((seed ^ 0x9e3779b9) >>> 0); }
const between = (a, b) => a + rnd() * (b - a);

export function burst(x, z, y, color, count = 10, speed = 12, size = 0.14) {
  for (let i = 0; i < count; i++) {
    const ang = between(0, TAU), up = between(0.3, 1);
    FX.sparks.push({
      x, z, y,
      vx: Math.cos(ang) * speed * between(0.4, 1),
      vz: Math.sin(ang) * speed * between(0.2, 0.8),
      vy: up * speed * 0.5,
      life: between(0.22, 0.6), max: 0.6, size: between(size * 0.6, size), color,
    });
  }
}

export function smoke(x, z, y, color = "rgba(180,180,190,.5)", count = 3, size = 0.5) {
  for (let i = 0; i < count; i++) {
    FX.smoke.push({
      x: x + between(-0.3, 0.3), z, y: y + between(-0.1, 0.3),
      vx: between(-1.4, 1.4), vz: between(-2, 2), vy: between(0.6, 2.2),
      life: between(0.5, 1.3), max: 1.3, size: between(size * 0.5, size), color,
    });
  }
}

export function floater(x, z, y, text, color = "#ffe9a8", big = false) {
  FX.floaters.push({ x, z, y, text, color, big, life: 1, max: 1 });
}

export function skid(x, z) {
  FX.skid.push({ x, z, life: 7, max: 7 });
  if (FX.skid.length > 160) FX.skid.shift();
}

export function feed(text, color = "#dfe8ff") {
  FX.feed.unshift({ text, color, at: performance.now() });
  FX.feed = FX.feed.slice(0, 5);
}

export function announce(title, sub = "", color = "#ffd23f") {
  FX.announce = { title, sub, color, at: performance.now() };
}

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
      case "hit":
        burst(ev.x, ev.z, 1.1, "#ffd23f", 12, 16, 0.16);
        burst(ev.x, ev.z, 1.1, "#ff6a5a", 6, 10, 0.12);
        floater(ev.x, ev.z, 2.3, `-${ev.d}`, "#ffd7a8", true);
        if (ev.a === mine) { play("punch"); S.hitUntil = performance.now() + 140; }
        else if (ev.b === mine) { play("hurt"); S.shake = Math.min(14, S.shake + 7); }
        break;
      case "whiff":
        if (ev.a === mine) play("whiff");
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
        const heavy = ev.s === "headon" || ev.s === "rear";
        feed(`${nameOf(view, ev.a)} 摔车${heavy ? " · 撞得太狠" : ""}`, "#ffb08a");
        if (ev.a === mine) {
          play("crash"); S.shake = Math.min(26, S.shake + 20);
          announce("摔车了", "扶起来接着骑", "#ff9f6a");
        } else if (view && Math.abs(ev.z - (view.mine ? view.mine.z : 0)) < 90) {
          play("crash", 0.5);
        }
        break;
      }
      // 一脚把一台社会车辆踹上天。**十三种车都走这一条**——大运只是赏金最高的那一台，
      // 所以它才配一句播报，别的车就在头顶跳个钱数。
      case "fling": {
        const car = CAR_NAME[ev.kind] || "车";
        burst(ev.x, ev.z, 1.5, "#ffd23f", 26, 26, 0.24);
        burst(ev.x, ev.z, 0.9, "#ff9f5a", 12, 18, 0.18);
        feed(`${nameOf(view, ev.a)} 一脚踹飞了一台${car}`, "#ffd23f");
        floater(ev.x, ev.z, 2.7, `+${ev.pay || 0}`, "#ffd23f", ev.kind === "dayun");
        if (ev.kind === "dayun") announce("大运起飞!", `这一脚值 ${ev.pay || 0}`, "#ffd23f");
        play("fling");
        if (ev.a === mine) S.shake = Math.min(30, S.shake + (ev.kind === "dayun" ? 22 : 14));
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
        if (ev.a === mine) S.shake = Math.min(24, S.shake + 12);
        break;
      }
      // 撞上一头走路的畜生：慢速只是晃一下（`soft`），上了速度就是一次摔车。
      case "moo": {
        const near = view && view.mine ? Math.abs(ev.z - view.mine.z) < 70 : false;
        smoke(ev.x, ev.z, 0.6, "rgba(210,200,180,.42)", 5, 0.55);
        if (ev.soft) {
          feed(`撞上一头${ev.n || "畜生"} · 只是晃了一下`, "#ffd7a8");
          if (ev.a === mine) { play("hurt"); S.shake = Math.min(12, S.shake + 6); }
        } else {
          burst(ev.x, ev.z, 0.8, "#e8b48a", 14, 16, 0.18);
          feed(`${nameOf(view, ev.a)} 撞上了一头${ev.n || "畜生"}`, "#ffb08a");
          if (near) play("moo", 0.8);
        }
        break;
      }
      // 被踹飞的那台车落地（或炸开）。这是"它真的完了"那一声。
      case "boom": {
        const b = ev.b || 1;
        burst(ev.x, ev.z, 1.0, "#ffb24a", Math.round(18 + b * 14), 22 + b * 8, 0.26);
        burst(ev.x, ev.z, 0.6, "#ff6a4a", Math.round(10 + b * 8), 16, 0.2);
        smoke(ev.x, ev.z, 0.5, "rgba(48,44,42,.55)", Math.round(6 + b * 6), 0.9 + b * 0.4);
        if (view && view.mine && Math.abs(ev.z - view.mine.z) < 120) {
          play("boom"); S.shake = Math.min(28, S.shake + 8 + b * 5);
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

/** 每帧推进粒子，顺带产出"车自己发出"的效果：侧滑、越野扬尘、氮气尾焰。 */
export function stepFx(dt, view) {
  const me = view && view.mine;
  if (me && me.state === "ride") {
    const off = me.wobble > 0.25;
    if (off && me.v > 6 && rnd() < 0.55) smoke(me.x, me.z - 0.8, 0.3, "rgba(190,170,130,.5)", 1, 0.7);
    if (Math.abs(me.lean) > 0.75 && me.v > 22 && rnd() < 0.3) skid(me.x - Math.sign(me.lean) * 0.3, me.z - 1.4);
  }
  integrate(FX.sparks, dt, 26);
  integrate(FX.smoke, dt, 3);
  FX.sparks = FX.sparks.filter(p => p.life > 0);
  FX.smoke = FX.smoke.filter(p => p.life > 0);
  if (FX.sparks.length > 420) FX.sparks.splice(0, FX.sparks.length - 420);
  if (FX.smoke.length > 220) FX.smoke.splice(0, FX.smoke.length - 220);
  for (const f of FX.floaters) { f.life -= dt; f.y += dt * 1.6; }
  FX.floaters = FX.floaters.filter(f => f.life > 0);
  for (const k of FX.skid) k.life -= dt;
  FX.skid = FX.skid.filter(k => k.life > 0);
  S.shake = Math.max(0, S.shake - dt * 30);
}

function integrate(list, dt, gravity) {
  for (const p of list) {
    p.life -= dt;
    p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
    p.vy -= gravity * dt;
    if (p.y < 0) { p.y = 0; p.vy *= -0.35; p.vx *= 0.6; }
    p.vx *= 1 - dt * 1.6; p.vz *= 1 - dt * 0.8;
  }
}
