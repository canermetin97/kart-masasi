/* ============================================================
   sfx.js — Web Audio ile üretilen ses efektleri (ses dosyası yok)
   Ayar butonundan kapatılabilir, tercih tarayıcıda saklanır.
   ============================================================ */
const SFX = (() => {

let ctx = null;
let enabled = true;
const KEY = 'kartmasasi.sfx';

try { const v = localStorage.getItem(KEY); if (v !== null) enabled = v === '1'; } catch (e) {}

/* AudioContext ancak bir kullanıcı hareketinden sonra açılabilir */
function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function env(node, t0, attack, hold, release, peak) {
  const g = node.gain;
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(peak, t0 + attack);
  g.setValueAtTime(peak, t0 + attack + hold);
  g.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
}

function tone(freq, t0, dur, type = 'sine', peak = 0.14) {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  o.connect(g); g.connect(c.destination);
  env(g, t0, 0.008, Math.max(0, dur - 0.05), 0.05, peak);
  o.start(t0); o.stop(t0 + dur + 0.08);
}

function noise(t0, dur, freq, q, peak) {
  const c = ac(); if (!c) return;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass';
  f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
  const g = c.createGain();
  src.connect(f); f.connect(g); g.connect(c.destination);
  env(g, t0, 0.004, dur * 0.3, dur * 0.6, peak);
  src.start(t0); src.stop(t0 + dur + 0.05);
}

const now = () => (ac() ? ctx.currentTime : 0);

const API = {
  get enabled() { return enabled; },

  set(on) {
    enabled = !!on;
    try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch (e) {}
    API.paintButtons();
    if (enabled) API.click();
  },

  toggle() { API.set(!enabled); },

  /* --- efektler --- */
  /* Kart masaya kayıyor: parlaktan boğuğa süzülen bir gürültü (kağıdın
     çuha üzerinde kayması) + masaya değerken hafif bir tık. */
  deal(i = 0) {
    if (!enabled) return;
    const c = ac(); if (!c) return;
    const t = now() + i * 0.075;
    const dur = 0.15 + Math.random() * 0.03;

    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let k = 0; k < len; k++) {
      const p = k / len;
      d[k] = (Math.random() * 2 - 1) * Math.pow(1 - p, 1.6) * (0.35 + 0.65 * Math.min(1, p * 8));
    }
    const src = c.createBufferSource(); src.buffer = buf;

    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(5200 + Math.random() * 900, t);
    bp.frequency.exponentialRampToValueAtTime(850, t + dur);

    const hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 320;

    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(c.destination);
    src.start(t); src.stop(t + dur + 0.05);

    tone(140 + Math.random() * 30, t + dur * 0.66, 0.05, 'sine', 0.045);   // masaya değme
  },
  dealMany(n) { for (let i = 0; i < n; i++) API.deal(i); },

  flip() {                            // kart açılıyor: kısa, kuru bir şak
    if (!enabled) return;
    const t = now();
    noise(t, 0.05, 2600, 0.9, 0.12);
    noise(t + 0.03, 0.06, 1200, 1.2, 0.07);
    tone(210, t + 0.02, 0.05, 'sine', 0.05);
  },

  chip() {                            // jeton / bahis
    if (!enabled) return;
    const t = now();
    noise(t, 0.045, 2600 + Math.random() * 900, 3, 0.14);
    noise(t + 0.05, 0.045, 3100 + Math.random() * 900, 3, 0.10);
  },

  chips() {                           // pot toplanıyor
    if (!enabled) return;
    for (let i = 0; i < 5; i++) {
      const t = now() + i * 0.045;
      noise(t, 0.05, 2400 + Math.random() * 1400, 3, 0.11);
    }
  },

  click() {
    if (!enabled) return;
    tone(520, now(), 0.05, 'square', 0.045);
  },

  win() {
    if (!enabled) return;
    const t = now();
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(f, t + i * 0.09, 0.22, 'triangle', 0.10));
  },

  lose() {
    if (!enabled) return;
    const t = now();
    tone(300, t, 0.18, 'sine', 0.10);
    tone(220, t + 0.13, 0.28, 'sine', 0.09);
  },

  push() {
    if (!enabled) return;
    tone(440, now(), 0.16, 'sine', 0.07);
  },

  shuffle() {
    if (!enabled) return;
    for (let i = 0; i < 9; i++) noise(now() + i * 0.035, 0.06, 1400 + Math.random() * 1600, 1, 0.07);
  },

  /* --- ayar butonları --- */
  paintButtons() {
    document.querySelectorAll('[data-sfx-btn]').forEach(b => {
      b.textContent = enabled ? '🔊 Ses' : '🔇 Ses';
      b.classList.toggle('muted', !enabled);
      b.setAttribute('aria-pressed', String(enabled));
    });
  },

  bind() {
    document.querySelectorAll('[data-sfx-btn]').forEach(b => b.onclick = () => API.toggle());
    API.paintButtons();
    // ilk dokunuşta ses motorunu uyandır
    const wake = () => { ac(); window.removeEventListener('pointerdown', wake); };
    window.addEventListener('pointerdown', wake);
  },
};

return API;
})();
