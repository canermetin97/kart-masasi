/* ============================================================
   speed.js — oyun akış hızı ayarı (tüm gecikmeler bu çarpanla ölçeklenir)
   ============================================================ */
const Speed = (() => {
const KEY = 'kartmasasi.speed';
const LEVELS = [
  { k: 'yavas',  label: '🐢 Yavaş',  m: 2.8 },
  { k: 'normal', label: '⏱ Normal', m: 1.9 },
  { k: 'hizli',  label: '⚡ Hızlı',  m: 1.1 },
];
let i = 1;
try { const v = localStorage.getItem(KEY); const j = LEVELS.findIndex(l => l.k === v); if (j >= 0) i = j; } catch (e) {}

const API = {
  get m() { return LEVELS[i].m; },
  /** ms cinsinden temel gecikmeyi seçili hıza göre ölçekler */
  ms(base) { return Math.round(base * LEVELS[i].m); },
  cycle() {
    i = (i + 1) % LEVELS.length;
    try { localStorage.setItem(KEY, LEVELS[i].k); } catch (e) {}
    API.paintButtons();
    if (typeof SFX !== 'undefined') SFX.click();
  },
  paintButtons() {
    document.querySelectorAll('[data-speed-btn]').forEach(b => { b.textContent = LEVELS[i].label; });
  },
  bind() {
    document.querySelectorAll('[data-speed-btn]').forEach(b => b.onclick = () => API.cycle());
    API.paintButtons();
  },
};
return API;
})();
