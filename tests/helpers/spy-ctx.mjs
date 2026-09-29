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
  // ---- 变换矩阵 ----
  // 每一笔都连**当时的变换**一起记下来。理由：`tube()` 这类零件是"先 translate
  // 再 rotate"画出来的，它记下来的坐标是**局部**的——一根两米长的管子在第一段里
  // 就是一条 x 从 0 到 2 的路径。只有把变换一起带上，"这幅画占多宽"才量得准，
  // 不然就会把一个落在原点的局部坐标当成"画到两米外去了"。
  const I = [1, 0, 0, 1, 0, 0];
  let m = I.slice();
  const stack = [];
  const mmul = (a, b) => [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
  const CTM = {
    translate: (x, y) => { m = mmul(m, [1, 0, 0, 1, x, y]); },
    scale: (x, y) => { m = mmul(m, [x, 0, 0, y, 0, 0]); },
    rotate: a => { m = mmul(m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]); },
    transform: (a, b, c, d, e, f) => { m = mmul(m, [a, b, c, d, e, f]); },
    setTransform: (...a) => {
      m = a.length >= 6 ? a.slice(0, 6).map(Number) : I.slice();
    },
    resetTransform: () => { m = I.slice(); },
  };
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
    ops.push([name, args, m.slice()]);
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
  // 变换类指令除了记账，还要真的推进矩阵；save/restore 管矩阵栈。
  for (const name of Object.keys(CTM)) {
    raw[name] = (...a) => { check(name, a); CTM[name](...a); };
  }
  raw.save = () => { check("save", []); stack.push(m.slice()); };
  raw.restore = () => { check("restore", []); if (stack.length) m = stack.pop(); };

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

/**
 * 一幅画画到哪儿为止（米空间）。圆弧与椭圆要**带上半径**，否则一圈灯罩会被
 * 当成一个点，测试就白写了。
 *
 * 用途：一件道具的贴图是一块固定大小的画布，画到框外面的部分会被直接切掉。
 * 所以"有没有画出框"是一条硬契约，不是审美问题。
 */
export function bounds(ops) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  /** 一件东西的坐标要**先过它当时那一层变换**再拿来量（见 `spyCtx` 里的矩阵）。 */
  const at = (ctm, x, y) => (ctm
    ? [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]
    : [x, y]);
  /** 变换把单位长度拉长了多少（圆弧的半径要跟着缩） */
  const axis = (ctm, sx, sy) => {
    if (!ctm) return [sx, sy];
    return [sx * Math.hypot(ctm[0], ctm[1]), sy * Math.hypot(ctm[2], ctm[3])];
  };
  const put = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!Number.isFinite(x0)) { x0 = x1 = x; y0 = y1 = y; return; }
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  };
  for (const [name, args, ctm] of ops) {
    if (name === "moveTo" || name === "lineTo") {
      const [x, y] = at(ctm, args[0], args[1]);
      put(x, y);
    }
    else if (name === "rect" || name === "fillRect" || name === "strokeRect" || name === "clearRect") {
      for (const [x, y] of [[args[0], args[1]], [args[0] + args[2], args[1] + args[3]]]) {
        const [wx, wy] = at(ctm, x, y);
        put(wx, wy);
      }
    } else if (name === "arc") {
      const [rx, ry] = axis(ctm, args[2], args[2]);
      const [cx, cy] = at(ctm, args[0], args[1]);
      put(cx - rx, cy - ry); put(cx + rx, cy + ry);
    } else if (name === "ellipse") {
      const [rx, ry] = axis(ctm, args[2], args[3]);
      const [cx, cy] = at(ctm, args[0], args[1]);
      put(cx - rx, cy - ry); put(cx + rx, cy + ry);
    } else if (name === "quadraticCurveTo") {
      for (const [x, y] of [[args[0], args[1]], [args[2], args[3]]]) {
        const [wx, wy] = at(ctm, x, y);
        put(wx, wy);
      }
    } else if (name === "bezierCurveTo") {
      for (const [x, y] of [[args[0], args[1]], [args[2], args[3]], [args[4], args[5]]]) {
        const [wx, wy] = at(ctm, x, y);
        put(wx, wy);
      }
    }
  }
  return { x0, x1, y0, y1, ok: Number.isFinite(x0) };
}
