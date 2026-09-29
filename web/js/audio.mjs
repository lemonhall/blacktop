/**
 * 音效：全部靠 WebAudio 现场合成，不下载任何音频文件。
 *
 * 现场合成没有网络等待，也就不会出现"都撞完了才听见声音"。这一版比射击版多
 * 一层**持续声**：引擎。它不是一个音效，而是一条跟着转速走的振荡器——
 * 赛车游戏里"听得出自己跑多快"比任何一次爆炸都重要，而这件事只有在声音是
 * 连续的时候才成立。
 */

let audio = null;
let enabled = true;
let engine = null;

export function initAudio() {
  if (!enabled || audio) return;
  try {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    startEngine();
  } catch { /* 浏览器不给就算了 */ }
}

export const soundOn = () => enabled;
export function toggleSound() { enabled = !enabled; if (enabled) initAudio(); else stopEngine(); return enabled; }

/** 引擎：两个失谐锯齿波过一道低通。低通的开合就是"油门拧下去的厚度"。 */
function startEngine() {
  if (!audio || engine) return;
  try {
    const gain = audio.createGain();
    const filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    const a = audio.createOscillator(), b = audio.createOscillator();
    a.type = "sawtooth"; b.type = "square";
    a.frequency.value = 70; b.frequency.value = 53;
    gain.gain.value = 0;
    a.connect(filter); b.connect(filter);
    filter.connect(gain); gain.connect(audio.destination);
    a.start(); b.start();
    engine = { a, b, gain, filter };
  } catch { engine = null; }
}

function stopEngine() {
  if (!engine) return;
  try { engine.a.stop(); engine.b.stop(); } catch { /* 已经停了 */ }
  engine = null;
}

/** 每帧一次：把"我跑多快、油门拧多大"翻译成音高与音量。 */
export function engineSound(speed, throttle, nitro) {
  if (!audio || !engine || audio.state !== "running") return;
  const rpm = 52 + Math.min(240, speed * 3.1) + (nitro ? 26 : 0);
  const t = audio.currentTime;
  engine.a.frequency.setTargetAtTime(rpm, t, 0.06);
  engine.b.frequency.setTargetAtTime(rpm * 0.74, t, 0.06);
  engine.filter.frequency.setTargetAtTime(320 + speed * 12 + (throttle ? 280 : 0), t, 0.08);
  engine.gain.gain.setTargetAtTime(enabled ? 0.016 + Math.min(0.03, speed * 0.0007) : 0, t, 0.08);
}

export function resumeAudio() { if (audio && audio.state === "suspended") audio.resume().catch(() => {}); }

export function tone(freq, duration, type = "sine", volume = 0.045, slide = 0, delay = 0) {
  if (!enabled || !audio || audio.state !== "running") return;
  try {
    const osc = audio.createOscillator(), gain = audio.createGain(), t = audio.currentTime + delay;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(25, freq + slide), t + duration);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.007);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain); gain.connect(audio.destination);
    osc.start(t); osc.stop(t + duration + 0.01);
  } catch { /* 一次音效失败不该影响一局比赛 */ }
}

/** 噪声：刹车、侧滑、撞车都需要"没有音高"的那一层。 */
function noise(duration, volume, center, q = 1.2) {
  if (!enabled || !audio || audio.state !== "running") return;
  try {
    const len = Math.floor(audio.sampleRate * duration);
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.createBufferSource();
    const bp = audio.createBiquadFilter();
    const gain = audio.createGain();
    bp.type = "bandpass"; bp.frequency.value = center; bp.Q.value = q;
    gain.gain.value = volume;
    src.buffer = buf;
    src.connect(bp); bp.connect(gain); gain.connect(audio.destination);
    src.start();
  } catch { /* 同上 */ }
}

const RECIPES = {
  go: () => [440, 660, 880].forEach((f, i) => tone(f, 0.22, "square", 0.05, 0, i * 0.1)),
  nitro: () => { tone(180, 0.5, "sawtooth", 0.05, 620); noise(0.45, 0.05, 1600, 0.7); },
  punch: () => { noise(0.09, 0.09, 900, 0.9); tone(150, 0.08, "square", 0.04, -60); },
  hurt: () => { noise(0.14, 0.1, 500, 0.8); tone(90, 0.16, "sawtooth", 0.05, -30); },
  whiff: () => noise(0.08, 0.04, 2400, 2.4),
  // 捡起一件：一声短促上行的"叮"，和打中人的闷响完全分开——玩家必须能靠耳朵
  // 分辨"我捡到东西了"和"我打到人了"。
  pick: () => { tone(660, 0.09, "triangle", 0.045, 320); tone(990, 0.1, "triangle", 0.03, 140, 0.06); },
  // 抢到手：金属刮过金属。抢是这一套玩法里最爽的一下，值得一个有辨识度的声音。
  steal: () => { noise(0.16, 0.08, 1800, 1.4); tone(320, 0.14, "square", 0.04, 260); },
  // 充能家伙用光：一声空洞的"咔"。听到它就该知道手里那件已经没了。
  spent: () => { tone(150, 0.12, "square", 0.035, -70); noise(0.07, 0.03, 600, 1.2); },
  crash: () => { noise(0.4, 0.13, 320, 0.6); tone(70, 0.45, "sawtooth", 0.06, -40); },
  // 被踹飞的车摔在地上炸开：低频更沉、尾巴更长。它和 `crash` 必须能听出区别——
  // 一个是"我摔了"，一个是"我把一台半挂踹爆了"。
  boom: () => { noise(0.72, 0.15, 240, 0.7); tone(46, 0.9, "sawtooth", 0.07, -18); },
  // 一声牛叫。彩蛋有它自己的声音，才配得上"彩蛋"两个字。
  moo: () => { tone(196, 0.34, "sawtooth", 0.05, -70); tone(147, 0.3, "triangle", 0.035, 60, 0.06); },
  fling: () => { noise(0.5, 0.12, 700, 0.5); tone(220, 0.6, "sawtooth", 0.06, 900); },
  finish: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.26, "triangle", 0.05, 0, i * 0.1)),
  win: () => [523, 659, 784, 1047, 784, 1319].forEach((f, i) => tone(f, 0.32, "triangle", 0.05, 0, i * 0.14)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.34, "triangle", 0.05, 0, i * 0.17)),
  click: () => tone(760, 0.06, "sine", 0.03, 80),
};

export function play(kind, volume = 1) {
  const recipe = RECIPES[kind];
  if (recipe) recipe(volume);
}
