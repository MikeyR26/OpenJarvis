// Iron Man suit-up sound effects — Web Audio API, no files needed

function ctx(): AudioContext | null {
  try { return new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return null; }
}

function makeDistortion(ac: AudioContext, amount = 80): WaveShaperNode {
  const ws = ac.createWaveShaper();
  const n = 256, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  ws.curve = curve;
  return ws;
}

function noiseBuffer(ac: AudioContext, dur: number): AudioBuffer {
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// Mechanical suit-piece locking click
function suitClick(ac: AudioContext, t: number, vol = 0.9) {
  // Sharp noise burst — the "clunk" of metal locking
  const noise = ac.createBufferSource();
  noise.buffer = noiseBuffer(ac, 0.08);
  const hpf = ac.createBiquadFilter();
  hpf.type = 'bandpass';
  hpf.frequency.value = 800;
  hpf.Q.value = 0.8;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  noise.connect(hpf); hpf.connect(g); g.connect(ac.destination);
  noise.start(t); noise.stop(t + 0.08);

  // Body thud
  const osc = ac.createOscillator();
  const og = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.07);
  og.gain.setValueAtTime(vol * 0.7, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  osc.connect(og); og.connect(ac.destination);
  osc.start(t); osc.stop(t + 0.1);
}

// Arc reactor power surge
function arcReactor(ac: AudioContext, t: number) {
  // Deep sub-bass hum rising
  const osc = ac.createOscillator();
  const dist = makeDistortion(ac, 120);
  const g = ac.createGain();
  const lpf = ac.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.setValueAtTime(400, t);
  lpf.frequency.exponentialRampToValueAtTime(1800, t + 0.5);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(38, t);
  osc.frequency.exponentialRampToValueAtTime(95, t + 0.25);
  osc.frequency.exponentialRampToValueAtTime(65, t + 0.55);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.4, t + 0.06);
  g.gain.setValueAtTime(0.4, t + 0.35);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
  osc.connect(dist); dist.connect(lpf); lpf.connect(g); g.connect(ac.destination);
  osc.start(t); osc.stop(t + 0.7);

  // Harmonic overtone
  const osc2 = ac.createOscillator();
  const g2 = ac.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(76, t + 0.05);
  osc2.frequency.exponentialRampToValueAtTime(190, t + 0.4);
  g2.gain.setValueAtTime(0, t + 0.05);
  g2.gain.linearRampToValueAtTime(0.2, t + 0.12);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  osc2.connect(g2); g2.connect(ac.destination);
  osc2.start(t + 0.05); osc2.stop(t + 0.65);
}

// HUD electronic activation sweep
function hudSweep(ac: AudioContext, t: number) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(320, t);
  osc.frequency.exponentialRampToValueAtTime(4800, t + 0.4);
  g.gain.setValueAtTime(0.18, t);
  g.gain.setValueAtTime(0.18, t + 0.28);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  osc.connect(g); g.connect(ac.destination);
  osc.start(t); osc.stop(t + 0.5);
}

// HUD target-lock ascending pings (arrive sound)
function targetLock(ac: AudioContext, t: number) {
  [660, 880, 1100, 1320, 1760].forEach((freq, i) => {
    const delay = i * 0.055;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t + delay);
    g.gain.setValueAtTime(0, t + delay);
    g.gain.linearRampToValueAtTime(0.13, t + delay + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.09);
    o.connect(g); g.connect(ac.destination);
    o.start(t + delay); o.stop(t + delay + 0.1);
  });

  // Final lock tone
  const lock = ac.createOscillator();
  const lg = ac.createGain();
  lock.type = 'sine';
  lock.frequency.setValueAtTime(2400, t + 0.32);
  lock.frequency.linearRampToValueAtTime(2200, t + 0.52);
  lg.gain.setValueAtTime(0, t + 0.32);
  lg.gain.linearRampToValueAtTime(0.15, t + 0.34);
  lg.gain.exponentialRampToValueAtTime(0.001, t + 0.56);
  lock.connect(lg); lg.connect(ac.destination);
  lock.start(t + 0.32); lock.stop(t + 0.6);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function playEngageSound() {
  const ac = ctx();
  if (!ac) return;
  const t = ac.currentTime;

  // 3 rapid suit-piece clicks, then arc reactor surge + HUD sweep
  suitClick(ac, t, 0.8);
  suitClick(ac, t + 0.07, 0.65);
  suitClick(ac, t + 0.13, 0.5);
  arcReactor(ac, t + 0.1);
  hudSweep(ac, t + 0.18);
}

export function playArriveSound() {
  const ac = ctx();
  if (!ac) return;
  targetLock(ac, ac.currentTime);
}

// Wake-word detected — brief positive ping
export function playWakeSound() {
  const ac = ctx();
  if (!ac) return;
  const t = ac.currentTime;
  [880, 1320].forEach((freq, i) => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t + i * 0.06);
    g.gain.linearRampToValueAtTime(0.15, t + i * 0.06 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.12);
    o.connect(g); g.connect(ac.destination);
    o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.15);
  });
}

// Timer alarm — urgent repeating beeps
export function playAlarmSound() {
  const ac = ctx();
  if (!ac) return;
  const t = ac.currentTime;
  // 4 rapid beep pairs
  for (let i = 0; i < 4; i++) {
    const base = t + i * 0.35;
    [0, 0.12].forEach((offset) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'square';
      o.frequency.value = 1200;
      g.gain.setValueAtTime(0, base + offset);
      g.gain.linearRampToValueAtTime(0.3, base + offset + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, base + offset + 0.1);
      o.connect(g); g.connect(ac.destination);
      o.start(base + offset); o.stop(base + offset + 0.12);
    });
  }
}
