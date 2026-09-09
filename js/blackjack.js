/* ============================================================
   blackjack.js — 3-6 kişilik masa, 6 desteli shoe
   Kurallar: krupiye soft 17'de durur, BJ 3:2, double her 2 kartta,
             split (en fazla 4 el), split A'lara tek kart.
   ============================================================ */
const Blackjack = (() => {

const BOT_NAMES = ['Cem', 'Zeynep', 'Murat', 'Elif', 'Kaan', 'Deniz', 'Selin', 'Emre', 'Burak'];
/* Kurallar js/rules.js'ten gelir — çevrimiçi masayı çalıştıran sunucu da
   aynı dosyayı kullanır, böylece iki mod birebir aynı oynar. */
const DECKS = 6, MIN_BET = 10;

let S = null, token = 0;
const $ = id => document.getElementById(id);
const later = (fn, ms) => { const t = token; setTimeout(() => { if (t === token && S) fn(); }, Speed.ms(ms)); };

/* ---------------- yardımcılar ---------------- */
const handValue   = cards => Rules.handValue(cards);
const bjValue     = c => Rules.bjValue(c);
const isBJ        = h => Rules.isBJ(h);
const basicStrategy = (h, up, dbl, spl) => Rules.basicStrategy(h, up, dbl, spl);
const settleHand  = (h, dealer) => Rules.settleHand(h, dealer);

function log(text, hl) {
  const li = document.createElement('li');
  li.textContent = text;
  if (hl) li.className = 'hl';
  const ul = $('bj-log');
  ul.appendChild(li); ul.scrollTop = ul.scrollHeight;
}

function draw() {
  if (S.shoe.length < S.reshuffleAt) {
    S.shoe = shuffle(makeDeck(DECKS));
    log('Shoe karıştırıldı');
  }
  return S.shoe.pop();
}

/* ---------------- kurulum ---------------- */
function init(cfg) {
  token++;
  const names = shuffle(BOT_NAMES.slice()).slice(0, cfg.count - 1);
  const bots = names.map((n, i) => ({ id: i, name: n, chips: cfg.stack, isHuman: false }));
  const me = { id: 99, name: cfg.name || 'Sen', chips: cfg.stack, isHuman: true };
  S = {
    players: bots.concat([me]),      // insan en sağda (third base)
    me, handNo: 0, phase: 'bet', dealer: { cards: [] },
    shoe: shuffle(makeDeck(DECKS)),
    reshuffleAt: Math.floor(DECKS * 52 * 0.25),
    pendingBet: Math.min(MIN_BET * 2, cfg.stack),
  };
  S.players.forEach(p => Object.assign(p, { hands: [], bet: 0, out: false }));
  $('bj-shoe').textContent = DECKS;
  $('bj-log').innerHTML = '';
  buildSeats();
  startBetting();
}

function stop() { token++; S = null; }

/* Her oyuncunun masada sabit bir noktası var: alt yarıda, hafif yay şeklinde.
   Konumlar el boyunca hiç değişmez. */
function buildSeats() {
  const wrap = $('bj-seats');
  wrap.innerHTML = '';
  const n = S.players.length;
  const cols = n <= 4 ? 2 : 3;
  wrap.style.setProperty('--cols', cols);
  S.players.forEach((p, i) => {
    const t = ((i + 0.5) / n) * 2 - 1;                     // -1 sol .. +1 sağ
    const el = document.createElement('div');
    el.className = 'bj-seat' + (p.isHuman ? ' you' : '');
    el.style.left = (50 + t * 37) + '%';
    el.style.bottom = (5 + Math.pow(Math.abs(t), 1.7) * 9) + '%';
    el.innerHTML =
      `<div class="hands"></div>
       <div class="seat-plate">
         <div class="seat-name">${p.name}</div>
         <div class="seat-chips"></div>
       </div>
       <div class="seat-bet empty">0</div>`;
    wrap.appendChild(el);
    p.el = el;
  });
}

/* ---------------- bahis aşaması ---------------- */
function startBetting() {
  S.handNo++;
  S.phase = 'bet';
  S.dealer = { cards: [], hole: true };
  S.players.forEach(p => {
    p.hands = []; p.bet = 0; p.winner = false;
    p.out = p.chips < MIN_BET;
  });
  if (S.me.out) { gameOver(); return; }

  S.pendingBet = Math.max(MIN_BET, Math.min(S.pendingBet, S.me.chips));
  $('bj-hand').textContent = S.handNo;
  $('bj-stage').textContent = 'Bahis';
  $('bj-msg').textContent = 'Bahsini koy ve “Dağıt”a bas.';
  $('bj-next').classList.add('hidden');
  $('bj-play-buttons').classList.add('hidden');
  $('bj-bet-buttons').classList.remove('hidden');
  render();
}

function botBet(p) {
  const base = Math.max(MIN_BET, Math.round(p.chips * (0.02 + Math.random() * 0.05) / MIN_BET) * MIN_BET);
  return Math.min(base, p.chips);
}

/* ---------------- dağıtım ---------------- */
function deal() {
  if (S.phase !== 'bet') return;
  if (S.pendingBet < MIN_BET || S.pendingBet > S.me.chips) return;

  S.phase = 'deal';
  $('bj-bet-buttons').classList.add('hidden');
  $('bj-stage').textContent = 'Dağıtım';
  $('bj-msg').textContent = '';

  S.players.forEach(p => {
    if (p.out) return;
    p.bet = p.isHuman ? S.pendingBet : botBet(p);
    p.chips -= p.bet;
    p.hands = [{ cards: [], bet: p.bet, done: false, doubled: false, fromSplit: false, result: '' }];
  });
  S.dealer = { cards: [], hole: true };
  log(`— El ${S.handNo} —`, true);

  const seq = [];
  for (let round = 0; round < 2; round++) {
    S.players.forEach(p => { if (!p.out) seq.push(() => p.hands[0].cards.push(draw())); });
    seq.push(() => S.dealer.cards.push(draw()));
  }
  SFX.chip();
  let i = 0;
  const tick = () => {
    if (i >= seq.length) { afterDeal(); return; }
    seq[i++](); SFX.deal(); render(); later(tick, 520);
  };
  tick();
}

function afterDeal() {
  const up = S.dealer.cards[0];
  const dealerBJ = handValue(S.dealer.cards).total === 21;
  if ((bjValue(up) === 11 || bjValue(up) === 10) && dealerBJ) {
    S.dealer.hole = false;
    SFX.flip();
    $('bj-msg').textContent = 'Krupiyede Blackjack!';
    log('Krupiye Blackjack yaptı', true);
    render();
    later(settle, 1300);
    return;
  }
  // doğal blackjack yapanları işaretle
  S.players.forEach(p => { if (!p.out && isBJ(p.hands[0])) p.hands[0].done = true; });
  S.phase = 'play';
  $('bj-stage').textContent = 'Oyun';
  S.turnP = -1; S.turnH = 0;
  nextTurn();
}

/* ---------------- oyuncu sıraları ---------------- */
function nextTurn() {
  // aynı oyuncunun sonraki eli var mı?
  if (S.turnP >= 0) {
    const p = S.players[S.turnP];
    const nh = p.hands.findIndex(h => !h.done);
    if (nh >= 0) { S.turnH = nh; playTurn(p, p.hands[nh]); return; }
  }
  for (let i = S.turnP + 1; i < S.players.length; i++) {
    const p = S.players[i];
    if (p.out) continue;
    const nh = p.hands.findIndex(h => !h.done);
    if (nh >= 0) { S.turnP = i; S.turnH = nh; render(); playTurn(p, p.hands[nh]); return; }
  }
  S.turnP = -1;
  dealerPlay();
}

function playTurn(p, h) {
  render();
  if (p.isHuman) { humanTurn(h); return; }
  later(() => { if (S) botTurn(p, h); }, 800 + Math.random() * 500);
}

function finishHand(h, why) {
  h.done = true;
  if (why) h.result = why;
  render();
  later(nextTurn, 620);
}

function hit(p, h) {
  h.cards.push(draw());
  SFX.deal();
  const v = handValue(h.cards);
  render();
  if (v.total > 21) { log(`${p.name} battı (${v.total})`); finishHand(h, 'BATTI'); return true; }
  if (v.total === 21) { finishHand(h); return true; }
  return false;
}

const canDouble = (p, h) => Rules.canDouble(h, p.chips);
const canSplit = (p, h) => Rules.canSplit(h, p.chips, p.hands.length);

function doDouble(p, h) {
  p.chips -= h.bet; h.bet *= 2; h.doubled = true;
  SFX.chip();
  h.cards.push(draw());
  SFX.deal();
  const v = handValue(h.cards);
  log(`${p.name} double (${v.total})`);
  finishHand(h, v.total > 21 ? 'BATTI' : '');
}

function doSplit(p, h) {
  const idx = p.hands.indexOf(h);
  p.chips -= h.bet;
  const moved = h.cards.pop();
  const nh = { cards: [moved], bet: h.bet, done: false, doubled: false, fromSplit: true, fromSplit2: true, result: '' };
  h.fromSplit = true; h.fromSplit2 = true;
  p.hands.splice(idx + 1, 0, nh);
  h.cards.push(draw());
  nh.cards.push(draw());
  SFX.chip(); SFX.deal(1);
  log(`${p.name} split yaptı`);
  // split A'lara tek kart
  if (bjValue(h.cards[0]) === 11) { h.done = true; nh.done = true; }
  render();
  later(nextTurn, 620);
}

function botTurn(p, h) {
  const up = S.dealer.cards[0];
  const mv = basicStrategy(h, up, canDouble(p, h), canSplit(p, h));
  if (mv === 'split') return doSplit(p, h);
  if (mv === 'double') return doDouble(p, h);
  if (mv === 'stand') { log(`${p.name} durdu (${handValue(h.cards).total})`); return finishHand(h); }
  const busted = hit(p, h);
  if (!busted) later(() => { if (S) botTurn(p, h); }, 750);
}

/* ---------------- insan kontrolleri ---------------- */
function humanTurn(h) {
  S.humanHand = h;
  $('bj-play-buttons').classList.remove('hidden');
  $('bj-hit').disabled = false;
  $('bj-stand').disabled = false;
  $('bj-double').disabled = !canDouble(S.me, h);
  $('bj-split').disabled = !canSplit(S.me, h);
  const v = handValue(h.cards);
  // tek satırda kalmalı: uzun mesaj dar ekranda oyuncuların kartlarını örtüyor
  $('bj-msg').innerHTML = `<b>SIRA SENDE</b> — elin ${v.total}${v.soft ? ' (soft)' : ''}`;
  $('bj-stage').textContent = 'Sıra sende';
}

function lockHuman() {
  S.humanHand = null;
  if (S.phase === 'play') {
    $('bj-stage').textContent = 'Oyun';
    $('bj-msg').textContent = '';
  }
  ['bj-hit', 'bj-stand', 'bj-double', 'bj-split'].forEach(id => $(id).disabled = true);
}

function humanMove(mv) {
  if (!S || !S.humanHand) return;
  const h = S.humanHand, p = S.me;
  lockHuman();
  if (mv === 'stand') { log(`${p.name} durdu (${handValue(h.cards).total})`); return finishHand(h); }
  if (mv === 'double') return doDouble(p, h);
  if (mv === 'split') return doSplit(p, h);
  const busted = hit(p, h);
  if (!busted) humanTurn(h);
}

/* ---------------- krupiye ---------------- */
function dealerPlay() {
  lockHuman();
  $('bj-play-buttons').classList.add('hidden');
  $('bj-stage').textContent = 'Krupiye';
  $('bj-msg').textContent = 'Krupiye kartlarını açıyor…';
  S.dealer.hole = false;
  SFX.flip();
  render();

  const anyLive = S.players.some(p => !p.out && p.hands.some(h => handValue(h.cards).total <= 21));
  if (!anyLive) { later(settle, 1000); return; }

  const step = () => {
    const v = handValue(S.dealer.cards);
    if (Rules.dealerMustHit(S.dealer.cards)) {
      S.dealer.cards.push(draw());
      SFX.deal();
      render();
      later(step, 800);
    } else {
      log(`Krupiye: ${v.total}${v.total > 21 ? ' — battı' : ''}`);
      later(settle, 900);
    }
  };
  later(step, 900);
}

/* ---------------- ödemeler ---------------- */
function settle() {
  S.phase = 'settle';
  S.dealer.hole = false;
  const dv = handValue(S.dealer.cards).total;
  let mine = 0;

  S.players.forEach(p => {
    if (p.out) return;
    p.hands.forEach(h => {
      const { result: res, payout: win } = settleHand(h, S.dealer.cards);
      h.result = res;
      if (res === 'KAZANDI' || res === 'BLACKJACK') p.winner = true;
      p.chips += win;
      if (p.isHuman) mine += win - h.bet;
    });
  });

  $('bj-stage').textContent = 'Sonuç';
  const txt = mine > 0 ? `Kazandın! +${fmt(mine)}` : mine < 0 ? `Kaybettin: ${fmt(mine)}` : 'Berabere (push)';
  $('bj-msg').textContent = `Krupiye ${dv > 21 ? 'battı' : dv} — ${txt}`;
  log(`Krupiye ${dv} · sen ${mine >= 0 ? '+' : ''}${fmt(mine)}`, true);
  SFX.chips();
  setTimeout(() => (mine > 0 ? SFX.win() : mine < 0 ? SFX.lose() : SFX.push()), 320);
  render();

  S.players.forEach(p => { if (p.chips < MIN_BET) p.out = true; });
  if (S.me.chips < MIN_BET) later(gameOver, 1500);
  else $('bj-next').classList.remove('hidden');
}

function gameOver() {
  $('bj-msg').textContent = 'Jetonların bitti. Menüden yeniden başlayabilirsin.';
  $('bj-next').classList.add('hidden');
  $('bj-bet-buttons').classList.add('hidden');
  $('bj-play-buttons').classList.add('hidden');
  render();
}

/* ---------------- çizim ---------------- */
function render() {
  if (!S) return;
  const shoe = $('bj-shoe-visual');
  const flyMs = Speed.ms(230);
  const dz = $('bj-dealer-cards');
  renderCards(dz, S.dealer.cards, {
    faceDownIdx: S.dealer.hole ? [1] : [], flyFrom: shoe, flyMs,
  });
  const dv = handValue(S.dealer.cards);
  $('bj-dealer-total').textContent =
    S.dealer.cards.length === 0 ? '' : S.dealer.hole ? `· ${bjValue(S.dealer.cards[0])}+` : `· ${dv.total}`;

  $('bj-you-chips').textContent = 'Jeton: ' + fmt(S.me.chips);
  $('bj-you-bet').textContent = S.phase === 'bet' ? 'Bahis: ' + fmt(S.pendingBet) : '';
  $('bj-shoe').textContent = Math.max(1, Math.ceil(S.shoe.length / 52));

  renderMyHand();

  S.players.forEach((p, pi) => {
    const el = p.el;
    el.classList.toggle('out', p.out);
    el.classList.toggle('active', S.turnP === pi);
    el.classList.toggle('winner', !!p.winner && S.phase === 'settle');
    el.querySelector('.seat-chips').textContent = fmt(p.chips);
    const bet = el.querySelector('.seat-bet');
    const totalBet = p.hands.reduce((s, h) => s + h.bet, 0);
    bet.textContent = fmt(totalBet);
    bet.classList.toggle('empty', totalBet <= 0);

    // kart yokken bile nokta görünsün: en az bir el kutusu çiz
    const list = p.hands.length ? p.hands : [null];
    const hands = el.querySelector('.hands');
    while (hands.children.length > list.length) hands.lastChild.remove();
    while (hands.children.length < list.length) {
      const d = document.createElement('div');
      d.className = 'bj-hand';
      d.innerHTML = '<div class="cards-row"><div class="bj-spot"></div><div class="hand-cards"></div></div>' +
                    '<div class="total"></div><div class="res"></div>';
      hands.appendChild(d);
    }
    list.forEach((h, hi) => {
      const hEl = hands.children[hi];
      const cards = h ? h.cards : [];
      hEl.classList.toggle('active', !!h && S.turnP === pi && S.turnH === hi && S.phase === 'play');
      hEl.querySelector('.bj-spot').hidden = cards.length > 0;
      renderCards(hEl.querySelector('.hand-cards'), cards, { small: true, flyFrom: shoe, flyMs });
      const v = handValue(cards);
      hEl.querySelector('.total').textContent =
        cards.length ? (isBJ(h) ? 'BJ' : v.total + (v.soft && v.total <= 21 ? 's' : '')) : '';
      const res = hEl.querySelector('.res');
      const cls = { 'KAZANDI': 'win', 'KAYIP': 'lose', 'PUSH': 'push', 'BLACKJACK': 'bj', 'BATTI': 'lose' };
      res.className = 'res ' + ((h && cls[h.result]) || '');
      res.textContent = (h && h.result) || '';
    });
  });
}

/* İnsan oyuncunun oynadığı el, aksiyon barında büyük gösterilir. */
function renderMyHand() {
  const me = S.me;
  const hand = me.hands.length
    ? (S.turnP === S.players.indexOf(me) ? me.hands[S.turnH] : me.hands[0]) || me.hands[0]
    : null;
  const box = $('bj-my-cards');
  renderCards(box, hand ? hand.cards : [], { large: true });
  box.parentElement.classList.toggle('empty', !hand || !hand.cards.length);
  const nameEl = $('bj-my-name');
  if (!hand || !hand.cards.length) { nameEl.textContent = ''; return; }
  const v = handValue(hand.cards);
  const parts = [isBJ(hand) ? 'BLACKJACK' : `Elin: ${v.total}${v.soft && v.total <= 21 ? ' (soft)' : ''}`];
  if (me.hands.length > 1) parts.push(`${me.hands.indexOf(hand) + 1}. el`);
  if (hand.result) parts.push(hand.result);
  nameEl.textContent = parts.join(' · ');
}

/* ---------------- olay bağlantıları ---------------- */
function bind() {
  document.querySelectorAll('#bj-bet-buttons [data-bet]').forEach(b => b.onclick = () => {
    if (!S || S.phase !== 'bet') return;
    S.pendingBet = Math.min(S.me.chips, S.pendingBet + +b.dataset.bet);
    SFX.chip();
    render();
  });
  $('bj-bet-clear').onclick = () => { if (S && S.phase === 'bet') { S.pendingBet = MIN_BET; render(); } };
  $('bj-deal').onclick = () => deal();
  $('bj-hit').onclick = () => humanMove('hit');
  $('bj-stand').onclick = () => humanMove('stand');
  $('bj-double').onclick = () => humanMove('double');
  $('bj-split').onclick = () => humanMove('split');
  $('bj-next').onclick = () => { $('bj-next').classList.add('hidden'); startBetting(); };
  $('bj-log-toggle').onclick = () => $('bj-logpanel').classList.toggle('open');
}

return { init, stop, bind };
})();
