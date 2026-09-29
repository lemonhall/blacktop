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

import { TAU } from "../../sim/constants.mjs";
import { cosmeticRng } from "../../sim/rng.mjs";
import { WEAPONS } from "../../sim/weapons.mjs";
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

/**
 * 越野扬尘：**贴地往后甩**的一小团土。
 *
 * 上一版这里的调用直接复用了 `smoke()`（撞车那种烟），于是尘土从后轮一路升到
 * 骑手的后背上——车手被自己扬起的土糊成一团淡影子，截图里最扎眼的一处。
 * 真正的扬尘是贴着地面往后飞的：**高度低、上浮几乎为零、活得短**。
 * 三样都要，少一样就会重新盖住车手。
 */
export function dust(x, z, color = "rgba(198,178,138,.34)") {
  FX.smoke.push({
    x: x + between(-0.45, 0.45), z: z + between(-0.5, 0.3), y: between(0.03, 0.15),
    vx: between(-2.6, 2.6), vz: between(-3.6, -0.6), vy: between(0.05, 0.35),
    life: between(0.34, 0.68), max: 0.68, size: between(0.12, 0.3), color,
  });
}

/**
 * 一台**烧着的车**：一小簇火 + 一缕黑烟。
 *
 * 踹飞一台大运只有一秒半是在天上的，而"它真的完了"要靠**落地之后那一柱黑烟**。
 * 上一版只有落地那一下爆一次粒子，然后一台瘪掉的车干干净静地滑走——爽感全丢在
 * 那半秒之后。现在只要它还在烧（`state === "flung"`），每帧就补一把火和一把烟，
 * 于是天上是一条火尾、地上是一柱黑烟。
 */
function burnAt(x, y, z, k, ash) {
  FX.sparks.push({
    x: x + between(-0.2, 0.2), z: z + between(-0.3, 0.3), y: y + between(0, 0.35),
    vx: between(-2.2, 2.2), vz: between(-2.2, 2.2), vy: between(0.5, 2.8),
    life: between(0.2, 0.5), max: 0.5, size: between(0.05, 0.13) * k,
    color: rnd() < 0.55 ? "#ffd24a" : "#ff6a2a",
  });
  smoke(x, z, y + 0.35,
    ash ? "rgba(46,42,40,.5)" : "rgba(70,62,58,.44)", 1, (ash ? 0.7 : 0.45) * k);
}

export function skid(x, z) {
  FX.skid.push({ x, z, life: 7, max: 7 });
  if (FX.skid.length > 160) FX.skid.shift();
}

/**
 * 往镜头上砸一拳。`p` 是份量，`rgb` 配 `f` 就是顺带的那一闪（红=我被打，暖白=我踹飞）。
 *
 * 这一拳**不碰任何判定**：它进的是 `createCamera` 的视野，只让画面往外张一下。
 * 打架的爽快有一半来自这里——同样是打中，镜头纹丝不动的那个版本，玩家会说
 * "感觉像没打上"。
 */
export function impact(p, rgb = null, f = 0) {
  S.punch = Math.min(1, S.punch + p);
  if (rgb && f > S.flash) { S.flash = f; S.flashColor = rgb; }
}

/**
 * 地面上的**冲击环**：一圈从落点往外推的椭圆，越推越大、越推越淡。
 *
 * 火花和烟解决的是"亮不亮"，这一圈解决的是"这一下有多重"。放在地面平面上
 * （`y` 是离地高度），所以它会被投影压扁成椭圆——俯视游戏里画不出这种透视。
 * `k` 是份量：打中人 0.5、踹飞车 1.2、大运落地 2.0。
 */
export function ring(x, z, y = 0.08, k = 1, color = "rgba(255,236,190,") {
  FX.rings.push({ x, z, y, k, color, t: 0, max: 0.42 + k * 0.14 });
  if (FX.rings.length > 24) FX.rings.shift();
}

export function feed(text, color = "#dfe8ff") {
  FX.feed.unshift({ text, color, at: performance.now() });
  FX.feed = FX.feed.slice(0, 5);
}

export function announce(title, sub = "", color = "#ffd23f") {
  FX.announce = { title, sub, color, at: performance.now() };
}


/** 每帧推进粒子，顺带产出"车自己发出"的效果：侧滑、越野扬尘、氮气尾焰。 */
export function stepFx(dt, view) {
  const me = view && view.mine;
  if (me && me.state === "ride") {
    const off = me.wobble > 0.25;
    if (off && me.v > 6 && rnd() < 0.8) dust(me.x - me.lean * 0.25, me.z - 1.5);
    if (Math.abs(me.lean) > 0.75 && me.v > 22 && rnd() < 0.3) skid(me.x - Math.sign(me.lean) * 0.3, me.z - 1.4);
  }
  burnWrecks(view, me);
  for (const r of FX.rings) r.t += dt;
  FX.rings = FX.rings.filter(r => r.t < r.max);
  integrate(FX.sparks, dt, 26);
  integrate(FX.smoke, dt, 2.2);
  FX.sparks = FX.sparks.filter(p => p.life > 0);
  FX.smoke = FX.smoke.filter(p => p.life > 0);
  if (FX.sparks.length > 420) FX.sparks.splice(0, FX.sparks.length - 420);
  if (FX.smoke.length > 300) FX.smoke.splice(0, FX.smoke.length - 300);
  for (const f of FX.floaters) { f.life -= dt; f.y += dt * 1.6; }
  FX.floaters = FX.floaters.filter(f => f.life > 0);
  for (const k of FX.skid) k.life -= dt;
  FX.skid = FX.skid.filter(k => k.life > 0);
  S.shake = Math.max(0, S.shake - dt * 30);
  // 镜头那一拳回得**比震动慢**：砸下去要"顿"得住；抖完立刻归位，听起来只是噪音。
  // 闪比拳再慢一点点，因为"红闪"是给人看清"我被谁打了"的那零点几秒。
  S.punch = Math.max(0, S.punch - dt * 3.4);
  S.flash = Math.max(0, S.flash - dt * 2.8);
}

/**
 * 还在烧的车：被踹飞之后**一路冒火**，落地之后**原地冒烟**。
 *
 * 只处理看得见的那些（自己和它差 240 米以上就别撒粒子了）：被踹出两百米的车
 * 一粒火星都落不到屏幕上，白白占着粒子上限。
 */
function burnWrecks(view, me) {
  if (!view || !view.traffic) return;
  const near = me ? me.z : 0;
  for (const v of view.traffic) {
    if (v.state !== "flung") continue;
    if (me && Math.abs(v.z - near) > 240) continue;
    const air = v.y || 0;
    const k = v.kind === "dayun" ? 1.9 : v.kind === "trike" ? 0.7 : 1.15;
    // 天上：一条火尾；地上：一柱黑烟。落地那一刻两样都拉满，因为"它真的完了"
    // 就是这一下。
    if (air > 0.05) burnAt(v.x, air, v.z, k, false);
    else if ((v.dmg || 0) > 0.85) burnAt(v.x, 0.1, v.z, k * 0.8, true);
  }
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
