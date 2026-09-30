/**
 * 圈线与终点横幅：路上唯一两处"告诉你还剩多少"的标记。
 *
 * 一局跑三圈，所以这里有两件事要分清：
 *
 *   1. **圈线**——每一圈的尽头都有一条格子线。它就是起跑线：赛道是整圈周期的
 *      （见 `sim/track.mjs`），跨过去路正好卷回起点，所以"再一次看到那条格子线"
 *      才是玩家判断圈数的依据。少了它，三圈和一圈在画面上完全一样。
 *   2. **终点横幅**——只有**最后一圈**的尽头才挂。上一版把横幅画在"一圈的尽头"
 *      （那时一局就是一圈，等价），圈数改成三之后，那面旗子会在第一圈就朝你招手，
 *      然后你还得再骑两圈——这是那种"改了一个数字，别处悄悄说谎"的典型。
 *
 * 投影（`bendAt` / `hillAt`）由调用方传进来：这一层只管"该画哪几条线、每条长什么样"，
 * 于是它可以不依赖 `road.mjs` 被单独测——`road.mjs` 反过来要 import 它。
 */

/** 能看到多远的一条圈线。再远就只剩一条亚像素的线，白画。 */
const SIGHT = 420;
/** 贴到眼前就跳过：那已经是脚下，画出来是一整片糊住画面的格子。 */
const MIN_REL = 4;

/**
 * 视野里该画的所有圈线。返回 `{ z, lap, finish }`，按 z 从小到大。
 *
 * `finish` 只在**最后一圈的尽头**为真——横幅跟着它挂。
 */
export function lapLines(track, camZ, { sight = SIGHT, minRel = MIN_REL } = {}) {
  const lapLen = track.length;
  if (!(lapLen > 0)) return [];
  const laps = Math.max(1, track.laps || 1);
  const out = [];
  // 从"最近一条还没被甩到身后的圈线"开始，一条一条数到视野尽头。
  // 地图再短也不可能一屏两条（一圈三公里往上，视野四百米），但这里不假设这件事：
  // 以后真出现两圈同屏的短赛道，画面自己是对的。
  for (let k = Math.max(1, Math.ceil((camZ + minRel) / lapLen)); k * lapLen <= camZ + sight; k++) {
    const z = k * lapLen;
    out.push({ z, lap: k, finish: k >= laps });
  }
  return out;
}

/**
 * 把圈线画到画面上。**这一个是"画"，上面那一个是"该画什么"**——分开是为了让
 * "第几圈该挂横幅"这件事能被断言，而不只是一堆像素。
 */
export function drawLapLines(ctx, cam, tbl, S, { bendAt, hillAt }) {
  const track = S.track;
  for (const line of lapLines(track, cam.camZ)) {
    const relZ = line.z - cam.camZ;
    const ppm = cam.F / relZ;
    const x = cam.W / 2 - ppm * (cam.camX + bendAt(tbl, line.z));
    const y = cam.horizon - ppm * (hillAt(tbl, line.z) - cam.camY);
    const hw = track.halfWidth * ppm;
    // 十六格黑白，路宽定格宽：这也是"这条路有多宽"在远处最直观的一把尺子。
    const cell = Math.max(3, (hw * 2) / 16);
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i % 2 ? "#f4f7ff" : "#151922";
      ctx.fillRect(x - hw + i * cell, y - 0.5 * ppm, cell, 0.9 * ppm);
    }
    if (!line.finish) continue;
    // 终点那条额外挂两道横梁——"这一条不是普通的圈线"，得一眼看得出来。
    ctx.fillStyle = "#f4f7ff";
    ctx.fillRect(x - hw, y - 2.6 * ppm, hw * 2, 0.16 * ppm);
    ctx.fillRect(x - hw, y - 0.9 * ppm, hw * 2, 0.16 * ppm);
  }
}
