// 修仙幸存者 · 过程化音效（WebAudio 实时合成，零素材）
// 设计：与 icons/models 一致——纯代码、无外部音频文件，避免包体膨胀。
// 健壮性：不支持/未授权/出错时静默降级（全部 try/catch + 守卫）。
// 微信小游戏环境无 WebAudio，届时可整体替换为 wx 音频，调用点不变。

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
const VOL = 0.42; // 主音量

try { muted = localStorage.getItem("xj_muted") === "1"; } catch { /* localStorage 不可用则忽略 */ }

// 首次用户手势（点击按钮/开始历练）时调用：创建或恢复音频上下文
export function initAudio() {
  try {
    if (!ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : VOL;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch { ctx = null; master = null; }
}

export function isMuted() { return muted; }
export function toggleMute() {
  muted = !muted;
  if (ctx && master) master.gain.setTargetAtTime(muted ? 0 : VOL, ctx.currentTime, 0.01);
  try { localStorage.setItem("xj_muted", muted ? "1" : "0"); } catch { /* 忽略 */ }
  return muted;
}

// 限流：同类音效最小间隔，避免群体命中/高频武器把声音叠成噪声、也省 CPU
const lastAt: Record<string, number> = {};
function gate(key: string, gapMs: number): boolean {
  const t = performance.now();
  if ((lastAt[key] ?? -1e9) + gapMs > t) return false;
  lastAt[key] = t;
  return true;
}

// ---- 合成基元 ----
type ToneOpts = { type?: OscillatorType; f0: number; f1?: number; dur: number; gain?: number; delay?: number };
function tone(o: ToneOpts) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + (o.delay ?? 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.f0, t0);
  if (o.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + o.dur);
  const peak = o.gain ?? 0.5;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.012, o.dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g); g.connect(master);
  osc.start(t0); osc.stop(t0 + o.dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
function getNoise(): AudioBuffer | null {
  if (!ctx) return null;
  if (!noiseBuf) {
    const n = Math.floor(ctx.sampleRate * 0.4);
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}
type NoiseOpts = { dur: number; f0: number; f1?: number; q?: number; type?: BiquadFilterType; gain?: number; delay?: number };
function noise(o: NoiseOpts) {
  if (!ctx || !master) return;
  const buf = getNoise(); if (!buf) return;
  const t0 = ctx.currentTime + (o.delay ?? 0);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? "bandpass";
  f.frequency.setValueAtTime(o.f0, t0);
  if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + o.dur);
  if (o.q) f.Q.value = o.q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(o.gain ?? 0.35, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0); src.stop(t0 + o.dur + 0.02);
}

// ---- 对外音效 ----
// 释放：按技能形态分组（aura 是持续光环，不出声以免每 0.6s 刷噪）
export function sfxCast(form: string) {
  if (!ctx || muted || form === "aura") return;
  if (!gate("cast", 55)) return;
  switch (form) {
    case "bolt": // 妖弹：电子“咻”
      tone({ type: "sawtooth", f0: 900, f1: 220, dur: 0.13, gain: 0.18 });
      break;
    case "strike": case "chain": case "rain": // 雷系：炸裂
      noise({ dur: 0.2, f0: 420, f1: 90, q: 0.6, type: "lowpass", gain: 0.32 });
      tone({ type: "triangle", f0: 170, f1: 60, dur: 0.16, gain: 0.16 });
      break;
    case "nova": case "meteor": case "whirl": // 范围/重击：低频轰
      tone({ type: "sine", f0: 180, f1: 48, dur: 0.32, gain: 0.42 });
      noise({ dur: 0.26, f0: 320, f1: 70, type: "lowpass", gain: 0.2 });
      break;
    case "sigil": case "vine": // 阵/藤：低沉短音
      tone({ type: "triangle", f0: 320, f1: 160, dur: 0.16, gain: 0.16 });
      break;
    default: // 剑/刀类挥砍：带扫频的“唰”
      noise({ dur: 0.15, f0: 1900, f1: 600, q: 0.8, type: "bandpass", gain: 0.26 });
  }
}

// 命中：普通=短促“嗒”，暴击=更亮的双音
export function sfxHit(crit: boolean) {
  if (!ctx || muted) return;
  if (crit) {
    if (!gate("crit", 70)) return;
    tone({ type: "square", f0: 540, f1: 230, dur: 0.12, gain: 0.24 });
    tone({ type: "sine", f0: 920, f1: 460, dur: 0.09, gain: 0.14, delay: 0.005 });
  } else {
    if (!gate("hit", 42)) return;
    noise({ dur: 0.05, f0: 2600, f1: 1100, q: 1.2, type: "bandpass", gain: 0.16 });
  }
}

// 击杀：轻“砰”
export function sfxKill() {
  if (!ctx || muted || !gate("kill", 60)) return;
  tone({ type: "triangle", f0: 300, f1: 110, dur: 0.14, gain: 0.2 });
}

// 受伤：低沉下扫
export function sfxHurt() {
  if (!ctx || muted || !gate("hurt", 120)) return;
  tone({ type: "sawtooth", f0: 230, f1: 70, dur: 0.22, gain: 0.28 });
  noise({ dur: 0.12, f0: 500, f1: 120, type: "lowpass", gain: 0.18 });
}

// 升级/突破：上行琶音
export function sfxLevelUp() {
  if (!ctx || muted) return;
  [523, 659, 784, 1047].forEach((f, i) => tone({ type: "triangle", f0: f, dur: 0.16, gain: 0.2, delay: i * 0.08 }));
}

// 按钮点击：短促“嘀”
export function sfxClick() {
  if (!ctx || muted || !gate("click", 40)) return;
  tone({ type: "sine", f0: 660, f1: 880, dur: 0.05, gain: 0.16 });
}
