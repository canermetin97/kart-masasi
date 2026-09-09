/* ============================================================
   app.js — ekran yönlendirme ve masa kurulumu
   ============================================================ */
(() => {
const $ = id => document.getElementById(id);
let chosenGame = 'poker';
const cfg = { name: 'Sen', count: 4, stack: 1000, bb: 10, blindUp: 0 };

function show(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $('screen-' + name).classList.add('active');
  document.querySelectorAll('.logpanel').forEach(l => l.classList.remove('open'));
}

function leaveGames() { Poker.stop(); Blackjack.stop(); }

// menü kartları
document.querySelectorAll('.game-card').forEach(c => c.onclick = () => {
  chosenGame = c.dataset.game;
  $('setup-title').textContent = chosenGame === 'poker' ? "Texas Hold'em — Masayı Kur" : 'Blackjack — Masayı Kur';
  $('setup-blind-field').classList.toggle('hidden', chosenGame !== 'poker');
  $('setup-blindup-field').classList.toggle('hidden', chosenGame !== 'poker');
  show('setup');
});

// geri butonları
document.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => {
  leaveGames();
  show(b.dataset.goto);
});

// seçim grupları
function group(id, key) {
  const wrap = $(id);
  wrap.querySelectorAll('.chip-btn').forEach(b => b.onclick = () => {
    wrap.querySelectorAll('.chip-btn').forEach(x => x.classList.remove('selected'));
    b.classList.add('selected');
    cfg[key] = +b.dataset.v;
  });
}
group('setup-count', 'count');
group('setup-stack', 'stack');
group('setup-blinds', 'bb');
group('setup-blindup', 'blindUp');

$('setup-start').onclick = () => {
  cfg.name = ($('setup-name').value || 'Sen').trim().slice(0, 12);
  leaveGames();
  if (chosenGame === 'poker') { show('poker'); Poker.init(cfg); }
  else { show('blackjack'); Blackjack.init(cfg); }
};

SFX.bind();
Speed.bind();
Poker.bind();
Blackjack.bind();

// menü ve kurulum tıklamalarına hafif geri bildirim
document.querySelectorAll('.game-card, .chip-btn, #setup-start, [data-goto]').forEach(
  el => el.addEventListener('click', () => SFX.click()));

// Çevrimdışı çalışma (yalnızca http/https üzerinde; file:// açılışta atlanır)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
})();
