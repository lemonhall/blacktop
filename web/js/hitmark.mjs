/**
 * **命中标记**：打中的那一点炸开的一颗美漫星。
 *
 * 为什么要单独一间：它和 `particles.mjs` 里那些东西不是一类。火花是**物理的**——
 * 有速度、有重力、会往地上掉；这一颗星是**符号的**——钉在打中的那一格上，两百
 * 毫秒里胀出来再缩回去，不掉不飘。把符号混进物理里，就一定会出现"星芒跟着火花
 * 一起被风吹歪"这种事。
 *
 * 线上原话：「就算踢到了，也没有视觉提醒」。判定早就成立了，屏幕没有回答。当年的
 * 街机、当年的美漫，回答这一句话的办法只有一个：**把命中那一格的字画出来**。
 * 所以这里是三层星星同心叠出一个爆开的样子（四道长角的十字爆 + 六角星体 + 白芯），
 * 外面再套一圈很重的黑描边——沙漠正午的底色上，一颗没有边的白星会当场化掉。
 *
 * `k` 是份量：打人 1.0、踹社会车辆 1.5、大运 2.2。半径跟着 `k` 走，但不跟着
 * `ppm` 无限长——`ppm` 只在近处有用，两百米外的一颗星不该还占着半个屏幕。
 */

/**
 * 星芒半径（像素）。**`ppm` 要封顶**：贴脸那一拳的 `ppm` 能到三百多，照它算出来的
 * 星有半屏大，把正在打的那个人整个盖住——比没有这一笔更糟。封到 120 像素/米，
 * 于是打人那一颗最大约 110 像素、踹大运那一颗约 182 像素。
 */
const radiusOf = (ppm, k) => (0.42 + 0.5 * k) * Math.min(ppm, 120);

/**
 * 画一颗星。`alpha` 由调用方按剩余寿命给（星是"顿挫"，不是"持续效果"）。
 */
export function drawHitStar(ctx, sx, sy, ppm, k, color, alpha) {
  const R = radiusOf(ppm, k);
  if (!(R > 3) || !(alpha > 0.01)) return;
  // 竖着压扁一点：这条路是伪 3D 的，一颗正圆的星看着像贴在镜头上，压扁 0.78 之后
  // 它才像是**站在路面上**炸开的。
  const squash = 0.78;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.translate(sx, sy);
  // 三层同心星，从外到里：
  //   1. 四道**长角**的十字爆（外面那一圈放射感就靠它）；
  //   2. 六角星体（12 个顶点，"这一下打实了"的那个形状）；
  //   3. 一点白的内芯。
  //
  // 三层都是**连在一起**的同一根形状，不是"画一颗星、再往外撒几块碎片"。前后试过
  // 两版撒碎片的：圆头射线那一版读成了太阳，锥形短箭头那一版读成了纸屑——问题
  // 都出在"断"上。爆炸的力是从中心连着往外推的，形状断成几截，力也就断了。
  //
  // 描边压得很重（0.2R）：这颗星要能压在正午的沙漠公路、雪地、夜里的大灯上，
  // 一条细黑边在那些底子上会化掉。
  const spike = (n, phase, rOut, rIn) => {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = phase + i * Math.PI / n;
      const r = i % 2 ? rIn : rOut;
      const px = Math.cos(a) * r, py = Math.sin(a) * r * squash;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  };
  const layers = [
    [4, Math.PI / 8, R, R * 0.3],
    [6, 0.19, R * 0.66, R * 0.3],
    [4, -Math.PI / 4, R * 0.42, R * 0.16],
  ];
  // 轮廓是**并集**的轮廓，不是每一层各描一圈。第一版给每层都描边、再各填一次，
  // 三道黑边压在同一块颜色上，画出来像一颗洋葱。办法是经典的"先粗描底、再填回
  // 同色"：把三层的粗描边先叠着打一遍，再用同色把它们的内部填掉——留下来的黑
  // 恰好只在外缘那一圈。
  ctx.lineWidth = Math.max(2.6, R * 0.2);
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(20,8,3,.72)";
  for (const L of layers) { spike(...L); ctx.stroke(); }
  ctx.fillStyle = color;
  for (const L of layers) { spike(...L); ctx.fill(); }
  // 内芯单独填白：美漫那一套里"这一下有多硬"是靠**中心过曝的白**说出来的。
  // 纯色的大星看着像贴纸，中心一点白才像"亮到有声音"。
  ctx.globalAlpha = Math.min(1, alpha) * 0.9;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + i * Math.PI / 4;
    const r = (i % 2 ? 0.1 : 0.3) * R;
    const px = Math.cos(a) * r, py = Math.sin(a) * r * squash;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = "#fffdf4";
  ctx.fill();
  ctx.restore();
}

/** 测试与排错用：某个份量在某个缩放下的半径。 */
export const starRadius = radiusOf;
