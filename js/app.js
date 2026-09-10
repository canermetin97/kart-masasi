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

function leaveGames() { Poker.stop(); Blackjack.stop(); Online.leave(); document.getElementById('bj-lobby').hidden = true; }

// menü kartları
document.querySelectorAll('.game-card').forEach(c => c.onclick = () => {
  chosenGame = c.dataset.game;
  if (chosenGame === 'online') {
    $('ol-name').value = Online.savedName() || $('ol-name').value;
    $('ol-status').textContent = '';
    show('online');
    return;
  }
  $('setup-title').textContent = chosenGame === 'poker' ? "Texas Hold'em — Masayı Kur" : 'Blackjack — Masayı Kur';
  $('setup-blind-field').classList.toggle('hidden', chosenGame !== 'poker');
  $('setup-blindup-field').classList.toggle('hidden', chosenGame !== 'poker');
  show('setup');
});

/* ---------------- çevrimiçi masa ---------------- */
function goOnline(code) {
  const name = ($('ol-name').value || 'Sen').trim().slice(0, 12);
  leaveGames();
  document.getElementById('bj-log').innerHTML = '';
  show('blackjack');
  Online.connect(code, name);
}
$('ol-create').onclick = () => goOnline(Online.newCode());
$('ol-join').onclick = () => {
  const code = ($('ol-code').value || '').trim().toUpperCase();
  if (code.length < 3) { $('ol-status').textContent = 'Geçerli bir oda kodu gir.'; return; }
  goOnline(code);
};
$('ol-code').addEventListener('input', e => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});
$('bj-copy').onclick = async () => {
  try { await navigator.clipboard.writeText(Online.code()); $('bj-copy').textContent = 'Kopyalandı ✓'; }
  catch { $('bj-copy').textContent = Online.code(); }
  setTimeout(() => ($('bj-copy').textContent = 'Kodu kopyala'), 1800);
};
$('bj-start-online').onclick = () => Online.start();
['ol-seats', 'ol-stack'].forEach(id => {
  document.getElementById(id).querySelectorAll('.chip-btn').forEach(b => b.onclick = () => {
    const seats = +document.querySelector('#ol-seats .chip-btn.selected')?.dataset.v || 4;
    const stack = +document.querySelector('#ol-stack .chip-btn.selected')?.dataset.v || 1000;
    Online.config(id === 'ol-seats' ? +b.dataset.v : seats, id === 'ol-stack' ? +b.dataset.v : stack);
  });
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
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  // Yeni servis çalışanı devraldığında sayfayı bir kez tazele ki
  // kullanıcı eski sürümde takılı kalmasın.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => reg.update().catch(() => {}))
      .catch(() => {});
  });
}
})();
