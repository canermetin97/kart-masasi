/* ============================================================
   online.js — çevrimiçi blackjack masası (istemci tarafı)
   Sunucu otoriter: burası hiçbir kural işletmez, yalnızca hamle
   gönderir ve gelen durumu çizer.
   ============================================================ */
const Online = (() => {

/* Sunucu adresi. Yerelde geliştirirken wrangler dev'e, canlıda
   Cloudflare Worker'a bağlanır. */
const SERVER = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'ws://localhost:8787'
  : 'wss://kart-masasi.scanerm97.workers.dev';

const $ = id => document.getElementById(id);
const KEY_ID = 'kartmasasi.playerId';
const KEY_NAME = 'kartmasasi.playerName';

let ws = null, code = null, view = null, active = false;
let myId = null, myName = 'Sen', tickTimer = null, retry = 0;
let pendingBet = 0;

/* ---------------- kimlik ---------------- */
/* Kimlik sekme başına tutulur (sessionStorage): aynı tarayıcıda iki pencere
   açan iki kişi ayrı oyuncu olur, ama sayfa yenilenince koltuk korunur. */
function playerId() {
  if (myId) return myId;
  const fresh = () => 'p-' + Math.random().toString(36).slice(2, 10);
  try {
    myId = sessionStorage.getItem(KEY_ID);
    if (!myId) { myId = fresh(); sessionStorage.setItem(KEY_ID, myId); }
  } catch { myId = fresh(); }
  return myId;
}
const newCode = () => {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';           // karışabilen harfler yok
  return Array.from({ length: 5 }, () => A[Math.floor(Math.random() * A.length)]).join('');
};

/* ---------------- bağlantı ---------------- */
function connect(room, name) {
  code = room.toUpperCase();
  myName = (name || 'Sen').slice(0, 12);
  try { localStorage.setItem(KEY_NAME, myName); } catch {}
  active = true;
  view = null;
  openSocket();
}

function openSocket() {
  const url = `${SERVER}/room/${encodeURIComponent(code)}/ws?id=${encodeURIComponent(playerId())}&name=${encodeURIComponent(myName)}`;
  status('Bağlanıyor…');
  try { ws = new WebSocket(url); } catch (e) { status('Bağlanamadı: ' + e.message); return; }

  ws.onopen = () => { retry = 0; status(''); };
  ws.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === 'state') onState(m);
    else if (m.t === 'log') log(m.text);
    else if (m.t === 'error') { status(m.msg); alertBox(m.msg); }
  };
  ws.onclose = () => {
    if (!active) return;
    status('Bağlantı koptu, yeniden deneniyor…');
    retry = Math.min(retry + 1, 6);
    setTimeout(() => { if (active) openSocket(); }, 500 * retry);
  };
  ws.onerror = () => {};
}

function leave() {
  active = false;
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  if (ws) { try { ws.close(); } catch {} ws = null; }
  view = null;
}

const send = o => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };

/* ---------------- durum geldi ---------------- */
function onState(m) {
  m.clientAt = Date.now();          // saat farkını düzeltmek için
  const first = !view;
  view = m;
  if (first) {
    $('bj-log').innerHTML = '';
    pendingBet = Math.max(m.minBet, Math.min(m.minBet * 2, me()?.chips ?? m.minBet));
  }
  Blackjack.online.paint(m, playerId());
  paintLobby();
  paintControls();
  if (!tickTimer) tickTimer = setInterval(paintClock, 250);
}

const me = () => view && view.players.find(p => p.id === playerId());
const isHost = () => view && view.hostId === playerId();
const myTurn = () => view && view.phase === 'play' && view.players[view.turnP]?.id === playerId();

/* ---------------- lobi ---------------- */
function paintLobby() {
  const box = $('bj-lobby');
  const inLobby = view.phase === 'lobby';
  box.hidden = !inLobby;
  if (!inLobby) return;

  $('bj-code').textContent = code;
  const ul = $('bj-lobby-players');
  ul.innerHTML = '';
  view.players.forEach(p => {
    const li = document.createElement('li');
    li.textContent = p.name + (p.isBot ? ' · bot' : p.id === view.hostId ? ' · masayı kuran' : '') +
      (!p.isBot && !p.connected ? ' · bağlı değil' : '');
    if (p.id === playerId()) li.className = 'me';
    ul.appendChild(li);
  });
  $('bj-lobby-host').hidden = !isHost();
  $('bj-lobby-wait').hidden = isHost();
  document.querySelectorAll('#ol-seats .chip-btn').forEach(b =>
    b.classList.toggle('selected', +b.dataset.v === view.seats));
  document.querySelectorAll('#ol-stack .chip-btn').forEach(b =>
    b.classList.toggle('selected', +b.dataset.v === view.stack));
}

/* ---------------- alt bar ---------------- */
function paintControls() {
  const p = me();
  const bet = $('bj-bet-buttons'), play = $('bj-play-buttons'), next = $('bj-next');
  const betting = view.phase === 'bet' && p && !p.out && !p.ready;

  bet.classList.toggle('hidden', !betting);
  play.classList.toggle('hidden', !myTurn());
  next.classList.toggle('hidden', view.phase !== 'settle');
  next.textContent = p && p.ready ? 'Bekleniyor…' : 'Hazırım';
  next.disabled = !!(p && p.ready);

  if (p) {
    pendingBet = Math.max(view.minBet, Math.min(pendingBet, p.chips));
    $('bj-you-chips').textContent = 'Jeton: ' + fmt(p.chips);
    $('bj-you-bet').textContent = betting ? 'Bahis: ' + fmt(pendingBet)
      : view.phase === 'settle' && p.net ? (p.net > 0 ? `+${fmt(p.net)}` : fmt(p.net)) : '';
  }
  if (myTurn()) {
    const h = p.hands[view.turnH];
    $('bj-hit').disabled = false;
    $('bj-stand').disabled = false;
    $('bj-double').disabled = !Rules.canDouble(h, p.chips);
    $('bj-split').disabled = !Rules.canSplit(h, p.chips, p.hands.length);
  }
  $('bj-code-badge').textContent = code || '';
  $('bj-code-badge').hidden = !code;
}

function paintClock() {
  if (!view) return;
  const left = view.deadline ? Math.max(0, view.deadline - (Date.now() - (view.clientAt || 0) + view.serverNow)) : 0;
  const el = $('bj-clock');
  if (!view.deadline) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = Math.ceil(left / 1000) + ' sn';
  el.classList.toggle('urgent', left < 8000);
}

/* ---------------- yardımcılar ---------------- */
function status(t) { const e = $('ol-status'); if (e) e.textContent = t || ''; }
function alertBox(t) { $('bj-msg').textContent = t; }
function log(text) {
  const li = document.createElement('li');
  li.textContent = text;
  const ul = $('bj-log');
  ul.appendChild(li); ul.scrollTop = ul.scrollHeight;
}

/* ---------------- dışa açılan ---------------- */
return {
  isActive: () => active,
  connect, leave, code: () => code,
  act(move) { if (myTurn()) send({ t: 'act', move }); },
  bet() { send({ t: 'bet', amount: pendingBet }); },
  addBet(n) { const p = me(); if (p) { pendingBet = Math.min(p.chips, pendingBet + n); paintControls(); } },
  clearBet() { pendingBet = view ? view.minBet : 10; paintControls(); },
  again() { send({ t: 'again' }); },
  config(seats, stack) { send({ t: 'config', seats, stack }); },
  start() { send({ t: 'start' }); },
  newCode, playerId,
  savedName() { try { return localStorage.getItem(KEY_NAME) || ''; } catch { return ''; } },
  server: SERVER,
};
})();
