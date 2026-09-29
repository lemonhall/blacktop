/**
 * 一个"记账用"的 Canvas 2D 上下文，用来在 Node 里跑绘制代码并检查它干了什么。
 *
 * 美术没法自动断言"好不好看"，但它的**契约**可以自动断言，而这些契约恰恰是画崩了
 * 的主要原因：
 *   1. `save()` 必须和 `restore()` 配平——少一次 restore，这一帧之后整条渲染管线都
 *      带着那个变换跑，画面上是"所有东西突然全歪了"，查起来极其费劲。
 *   2. 任何一次 `fillStyle` / `strokeStyle` 赋值都不能是 `undefined`。踩过的坑：
 *      相机在自己车后 8.6 米，开局的 z 是负数，`-1 % 2` 取下标的颜色表取到了
 *      undefined；赋给 fillStyle 时浏览器**默默忽略**，而一旦有人拿这个颜色去做
 *      `shade()` 就直接把整个渲染循环炸掉。
 *   3. 坐标里不能出现 NaN。NaN 不会报错，只会让那一笔凭空消失。
 */

import assert from "node:assert/strict";

const METHODS = [
  "save", "restore", "translate", "rotate", "scale", "setTransform", "resetTransform",
  "beginPath", "closePath", "moveTo", "lineTo", "arc", "arcTo", "ellipse", "rect",
  "quadraticCurveTo", "bezierCurveTo", "fill", "stroke", "clip", "fillRect", "strokeRect",
  "clearRect", "fillText", "strokeText", "setLineDash", "drawImage", "putImageData",
];

export function spyCtx() {
  const ops = [];
  const invalid = [];
  const fills = [];
  const strokes = [];
  // 渐变要连**颜色停靠点**一起记账：楼房的大气透视（越远越化进天色）没有几何上
  // 的可断言处，能验的只有"这一档雾量下，墙面用的是哪个颜色"。
  const makeGradient = () => {
    const g = {
      stops: [],
      addColorStop(at, color) {
        if (color === undefined || color === null) invalid.push(`addColorStop(${at}, ${color})`);
        if (Number.isNaN(at)) invalid.push("addColorStop(NaN)");
        g.stops.push({ at, color });
      },
    };
    return g;
  };
  const check = (name, args) => {
    for (const a of args) {
      if (typeof a === "number" && !Number.isFinite(a)) invalid.push(`${name}(${args.join(",")})`);
    }
    ops.push([name, args]);
    // 顺手记下"这一笔用的是哪个颜色"。颜色本身也是画法契约的一部分，而且是最容易
    // 悄无声息退化的一项（比如迎面来的车必须有大灯、路面必须用过路肩色）。
    if (name === "fill" || name === "fillRect" || name === "fillText") fills.push(raw.fillStyle);
    else if (name === "stroke" || name === "strokeRect" || name === "strokeText") strokes.push(raw.strokeStyle);
  };
  const raw = {
    fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, lineCap: "butt", lineJoin: "miter",
    globalAlpha: 1, font: "", textAlign: "left", textBaseline: "alphabetic",
    globalCompositeOperation: "source-over", filter: "none", miterLimit: 10,
    createLinearGradient: (...a) => {
      const g = makeGradient(); check("createLinearGradient", [...a, g]); return g;
    },
    createRadialGradient: (...a) => {
      const g = makeGradient(); check("createRadialGradient", [...a, g]); return g;
    },
    createPattern: (...a) => { check("createPattern", a); return null; },
  };
  for (const name of METHODS) raw[name] = (...a) => check(name, a);

  const ctx = new Proxy(raw, {
    set(target, key, value) {
      if ((key === "fillStyle" || key === "strokeStyle") && value === undefined) {
        invalid.push(`${key} = undefined`);
      }
      if (key === "fillStyle" && typeof value === "object" && value !== null) {
        // 渐变对象是合法的，别的对象说明有人把颜色写错了
        if (typeof value.addColorStop !== "function") invalid.push("fillStyle = 非颜色对象");
      }
      target[key] = value;
      return true;
    },
  });
  return { ctx, ops, invalid, fills, strokes };
}

/** 某类指令出现了多少次。 */
export const countOps = (ops, name) => ops.filter(o => o[0] === name).length;

/** save / restore 必须配平——这是整个绘制层最危险的一条。 */
export function assertBalanced(ops, what = "这一笔") {
  const depth = countOps(ops, "save") - countOps(ops, "restore");
  assert.equal(depth, 0, `${what}的 save/restore 不配平（差 ${depth} 次）`);
}

/** 整幅画有没有把 undefined 当颜色、有没有画出 NaN 的坐标。 */
export function assertSane(ops, invalid, what = "这一笔") {
  assert.deepEqual(invalid, [], `${what}画出了无效的东西：${invalid.slice(0, 4).join(" / ")}`);
  // 注意 `fillRect` 也要算数：楼房整栋都是 `fillRect` 堆出来的，
  // 只数 `fill/stroke` 会把它误判成"一笔都没画"。
  const painted = ["fill", "fillRect", "fillText", "stroke", "strokeRect", "drawImage"]
    .reduce((n, name) => n + countOps(ops, name), 0);
  assert.ok(painted > 0, `${what}一笔都没画`);
}

/** 这一笔里每一个渐变（按创建顺序）各自用了哪些颜色，最外层的那个是第一个。 */
export const gradientStops = ops => ops
  .filter(([name]) => name === "createLinearGradient" || name === "createRadialGradient")
  .map(([, args]) => args[args.length - 1].stops.map(s => s.color));

/** 所有描边/填充路径里最靠外的那一处横向坐标——用来验"画出来多宽"。 */
export function widestX(ops) {
  let widest = 0;
  for (const [name, args] of ops) {
    if (name !== "moveTo" && name !== "lineTo" && name !== "rect" && name !== "fillRect") continue;
    for (const a of args) if (typeof a === "number") widest = Math.max(widest, Math.abs(a));
  }
  return widest;
}

/** 一幅画的"指纹"：所有指令连坐标。用来验"换个姿势真的变样了"。 */
export const fingerprint = ops => ops
  .map(([name, args]) => `${name}(${args.map(a => (typeof a === "number" ? Math.round(a * 1000) / 1000 : String(a))).join(",")})`)
  .join(" ");
