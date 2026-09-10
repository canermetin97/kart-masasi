/* ============================================================
   blackjack.js — 3-6 kişilik masa, 6 desteli shoe
   Kurallar: krupiye soft 17'de durur, BJ 3:2, double her 2 kartta,
             split (en fazla 4 el), split A'lara tek kart.
   ============================================================ */
const Blackjack = (() => {

const BOT_NAMES = ['Cem', 'Zeynep', 'Murat', 'Elif', 'Kaan', 'Deniz', 'Selin', 'Emre', 'Burak'];
/* Kurallar js/rules.js'ten gelir — çevrimiçi masayı çalıştıran sunucu da
   aynı dosyayı kullanır, böylece iki mod birebir aynı oynar. */
/* Deste sayısı ve asgari bahis tek kaynaktan (js/rules.js) okunur —
   sunucu da aynı değerleri kullanıyor. Rules modül olarak sonradan
   yüklendiği için parse anında değil çağrı anında erişiliyor. */
const DECKS = () => Rules.BJ.DECKS;
const MIN_BET = () => Rules.BJ.MIN_BET;

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
    S.shoe = shuffle(makeDeck(DECKS()));
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
  // Dizi sırası = dağıtım sırası. İnsan, halkadaki saat 6 koltuğuna denk gelen
  // yere konur; böylece dağıtım en sağdan başlayıp saat yönünde ilerler.
  const seats = bots.slice();
  seats.splice(seatRing(cfg.count).indexOf(6), 0, me);
  S = {
    players: seats,
    me, handNo: 0, phase: 'bet', dealer: { cards: [] },
    shoe: shuffle(makeDeck(DECKS())),
    reshuffleAt: Math.floor(DECKS() * 52 * 0.25),
    pendingBet: Math.min(MIN_BET() * 2, cfg.stack),
  };
  S.players.forEach(p => Object.assign(p, { hands: [], bet: 0, out: false }));
  $('bj-shoe').textContent = DECKS();
  $('bj-log').innerHTML = '';
  buildSeats();
  startBetting();
}

function stop() { token++; S = null; }

/* Masa bir saat kadranı gibi kurulur ve konumlar HİÇ değişmez:
     12 → krupiye
      6 → sen (hangi cihazdan bakarsan bak, kendini hep altta görürsün)
   diğerleri sırayla 3, 9, 4:30, 7:30, 1:30, 10:30

   Koltuklar mutlak konumlu; bir oyuncunun eli büyüse de, sıra birine
   geçse de kimsenin kartı yerinden oynamaz. */
/* Koltuklar saat yönünde, en sağdan (saat 3) başlayarak dizilir.
   Kartlar da bu sırayla dağıtılır: 3 → 4:30 → 6 → 7:30 → 9 → …
   Oyuncu her zaman saat 6'da oturur. */
const CLOCKWISE = {
  3: [3, 6, 9],
  4: [3, 4.5, 6, 9],
  5: [3, 4.5, 6, 7.5, 9],
  6: [1.5, 3, 4.5, 6, 7.5, 9],
};
const seatRing = n => CLOCKWISE[n] || CLOCKWISE[6];
const SEAT_RX = 35, SEAT_RY = 34;

/* Koltuk konumları YÜZDE ile değil, masanın ölçülen piksel boyutuna göre
   verilir. Yüzdeli "top" değerleri, kapsayıcı kutunun yüksekliği tarayıcıya
   göre farklı hesaplandığında (iOS Safari'de olduğu gibi) sıfıra düşüp bütün
   koltukları üst üste bindiriyordu. Piksel her yerde aynı davranır. */
function seatOffset(clock) {
  const a = (clock / 12) * 2 * Math.PI - Math.PI / 2;   // 12 yukarı, 3 sağ
  // Üst köşedeki koltuklar krupiyenin kart sırasına girmesin diye
  // daha dışa ve daha aşağıya alınır.
  const ust = Math.sin(a) < -0.3;
  return {
    fx: (ust ? 40 : SEAT_RX) * Math.cos(a) / 100,
    fy: (ust ? 30 : SEAT_RY) * Math.sin(a) / 100,
  };
}

/* Masanın içindeki her şey ölçülen piksele göre yerleşir.
   WebKit, yüksekliği belirsiz bir kapsayıcıda yüzdeli "top" değerlerini
   sıfır kabul ediyor; bu yüzden krupiye, deste ve mesaj da tepeye
   yığılıyordu. Piksel her tarayıcıda aynı davranır. */
const LAYOUT = { dealer: 0.03, shoe: 0.42, msg: 0.58 };   // masa yüksekliğinin oranı

function layoutSeats() {
  if (!S || !S.players) return;
  const felt = $('bj-felt');
  const r = felt.getBoundingClientRect();
  const w = r.width, h = r.height;
  if (!w || !h) return;

  const put = (el, oran) => { if (el) el.style.top = Math.round(h * oran) + 'px'; };
  put(document.querySelector('#screen-blackjack .dealer-zone'), LAYOUT.dealer);
  const shoe = $('bj-shoe-visual');
  if (shoe) { shoe.style.top = Math.round(h * LAYOUT.shoe) + 'px'; shoe.style.bottom = 'auto'; }
  put($('bj-msg'), LAYOUT.msg);
  const tag = document.querySelector('#bj-logpanel [data-version]');
  if (tag && !tag.dataset.base) tag.dataset.base = tag.textContent;
  if (tag) tag.textContent = `${tag.dataset.base} · masa ${Math.round(w)}×${Math.round(h)}`;
  S.players.forEach(p => {
    if (!p.el || !p.clock) return;
    const { fx, fy } = seatOffset(p.clock);
    p.el.style.left = Math.round(w / 2 + fx * w) + 'px';
    p.el.style.top = Math.round(h / 2 + fy * h) + 'px';
  });
}

function buildSeats() {
  const wrap = $('bj-seats');
  wrap.innerHTML = '';
  const n = S.players.length;
  wrap.dataset.n = n;                     // kalabalık masada koltuklar daralır
  const ring = seatRing(n);
  const p6 = ring.indexOf(6);
  const meIdx = Math.max(0, S.players.indexOf(S.me));
  S.players.forEach((p, i) => {
    // dizideki sıra korunur (dağıtım sırası), kendim saat 6'ya döndürülür
    p.clock = ring[(i - meIdx + p6 + n * 2) % n];
    const el = document.createElement('div');
    el.className = 'bj-seat' + (p.isHuman ? ' you' : '');
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
  layoutSeats();
  // masa boyutu değişince (döndürme, klavye, adres çubuğu) yeniden yerleştir
  requestAnimationFrame(layoutSeats);
}

addEventListener('resize', layoutSeats);
addEventListener('orientationchange', () => setTimeout(layoutSeats, 250));
/* Masanın boyu, alttaki buton satırı gösterilip gizlendikçe de değişiyor;
   pencere olayı bunu yakalamadığı için masayı doğrudan izliyoruz. */
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => layoutSeats()).observe(document.getElementById('bj-felt'));
}

/* ---------------- bahis aşaması ---------------- */
function startBetting() {
  S.handNo++;
  S.phase = 'bet';
  S.dealer = { cards: [], hole: true };
  S.players.forEach(p => {
    p.hands = []; p.bet = 0; p.winner = false;
    p.out = p.chips < MIN_BET();
  });
  if (S.me.out) { gameOver(); return; }

  S.pendingBet = Math.max(MIN_BET(), Math.min(S.pendingBet, S.me.chips));
  $('bj-hand').textContent = S.handNo;
  $('bj-stage').textContent = 'Bahis';
  $('bj-msg').textContent = 'Bahsini koy ve “Dağıt”a bas.';
  $('bj-next').classList.add('hidden');
  $('bj-play-buttons').classList.add('hidden');
  $('bj-bet-buttons').classList.remove('hidden');
  render();
}

function botBet(p) {
  const base = Math.max(MIN_BET(), Math.round(p.chips * (0.02 + Math.random() * 0.05) / MIN_BET()) * MIN_BET());
  return Math.min(base, p.chips);
}

/* ---------------- dağıtım ---------------- */
function deal() {
  if (S.phase !== 'bet') return;
  if (S.pendingBet < MIN_BET() || S.pendingBet > S.me.chips) return;

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
  rigShoe();                      // hile açıksa deste dağıtımdan ÖNCE düzenlenir

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

/* "feeling lucky" hilesi.
   Kartları dağıtımdan SONRA değiştirmek gözle görülüyordu (masadaki
   kartlar bir anda başkasına dönüşüyordu). Bunun yerine dağıtım
   başlamadan deste düzenleniyor: insanın alacağı iki kartın destedeki
   yerine bir As ve bir onluk takas ediliyor, böylece kartlar zaten
   blackjack olarak çıkıyor. Deste yalnızca yer değiştiriyor, kart
   eklenip çıkarılmıyor. Yalnızca tek kişilik masada çalışır. */
function rigShoe() {
  if (!S || !S.cheat || S.online) return;
  const live = S.players.filter(p => !p.out);
  const n = live.length;
  const mi = live.indexOf(S.me);
  if (mi < 0) return;

  const gerekli = 2 * n + 2;                 // bir elde dağıtılan kart sayısı
  const yenile = () => { S.shoe = shuffle(makeDeck(DECKS())); log('Shoe karıştırıldı'); };

  /* Desteyi düzenlemeyi dener. draw() desteyi sondan çeker, yani k. çekilen
     kart shoe[len - k]. İnsanın iki kartının denk geldiği yerlere bir As ve
     bir onluk takas edilir — kart eklenip çıkarılmaz, sadece yer değişir. */
  const dene = () => {
    const len = S.shoe.length;
    if (len < gerekli + 4) return false;
    const yer = k => len - k;
    const pAs = yer(mi + 1);                 // insanın 1. kartı
    const pOn = yer(n + mi + 2);             // insanın 2. kartı
    const kd1 = yer(n + 1);                  // krupiyenin açık kartı
    const kd2 = yer(2 * n + 2);              // krupiyenin kapalı kartı

    const kilit = new Set([pAs, pOn]);
    const bul = kosul => {
      for (let i = 0; i < len; i++) if (!kilit.has(i) && kosul(S.shoe[i])) return i;
      return -1;
    };
    const koy = (hedef, kosul) => {
      if (kosul(S.shoe[hedef])) return true;
      const kaynak = bul(kosul);
      if (kaynak < 0) return false;
      [S.shoe[hedef], S.shoe[kaynak]] = [S.shoe[kaynak], S.shoe[hedef]];
      return true;
    };

    if (!koy(pAs, c => c.v === 14)) return false;
    if (!koy(pOn, c => bjValue(c) === 10)) return false;

    // krupiye de blackjack yaparsa el berabere biter; kapalı kartını değiştir
    if (handValue([S.shoe[kd1], S.shoe[kd2]]).total === 21) {
      kilit.add(kd1);
      koy(kd2, c => bjValue(c) >= 2 && bjValue(c) <= 9);
    }
    return true;
  };

  // dağıtım ortasında yeniden karışırsa düzen bozulur; önden karıştır
  if (S.shoe.length < S.reshuffleAt + gerekli) yenile();

  // As ya da onluk kalmamış olabilir (hile destedeki As'ları tüketiyor);
  // o durumda desteyi yenileyip bir kez daha dene
  if (!dene()) { yenile(); if (!dene()) return; }

  S.cheat--;
  log(`🍀 Şans seninle — ${S.cheat} el kaldı`, true);
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
  // kısa tut: masa mesajı dar bir kutu, elin toplamı zaten kartlarının altında
  $('bj-msg').innerHTML = '<b>SIRA SENDE</b>';
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
  $('bj-msg').textContent = 'Krupiye oynuyor';
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
  const txt = mine > 0 ? `+${fmt(mine)}` : mine < 0 ? fmt(mine) : 'push';
  $('bj-msg').textContent = `Krupiye ${dv > 21 ? 'battı' : dv} · ${txt}`;
  log(`Krupiye ${dv} · sen ${mine >= 0 ? '+' : ''}${fmt(mine)}`, true);
  SFX.chips();
  setTimeout(() => (mine > 0 ? SFX.win() : mine < 0 ? SFX.lose() : SFX.push()), 320);
  render();

  S.players.forEach(p => { if (p.chips < MIN_BET()) p.out = true; });
  if (S.me.chips < MIN_BET()) later(gameOver, 1500);
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

  if (!S.online) {                       // çevrimiçi modda bunları online.js yazar
    $('bj-you-chips').textContent = 'Jeton: ' + fmt(S.me.chips);
    $('bj-you-bet').textContent = S.phase === 'bet' ? 'Bahis: ' + fmt(S.pendingBet) : '';
  }
  $('bj-shoe').textContent = S.decksLeft ?? Math.max(1, Math.ceil(S.shoe.length / 52));

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


/* ---------------- çevrimiçi masa adaptörü ----------------
   Sunucudan gelen durum, yerel S ile aynı şekilde olduğu için
   masayı çizen kod olduğu gibi kullanılabiliyor. */
const ONLINE_STAGE = {
  lobby: 'Lobi', bet: 'Bahis', deal: 'Dağıtım',
  play: 'Oyun', dealer: 'Krupiye', settle: 'Sonuç',
};

function onlinePaint(v, myId) {
  const ids = v.players.map(p => p.id).join(',');
  if (!S || !S.online || S.ids !== ids) {
    token++;                                   // varsa yerel oyunun zamanlayıcılarını durdur
    S = {
      online: true, ids, me: null,
      players: v.players.map(p => Object.assign({}, p, { isHuman: p.id === myId })),
    };
    S.me = S.players.find(p => p.id === myId) || S.players[0];
    buildSeats();
  }
  v.players.forEach((sp, i) => {
    const p = S.players[i];
    Object.assign(p, sp);                      // p.el korunur
    p.isHuman = p.id === myId;
    p.winner = v.phase === 'settle' &&
      p.hands.some(h => h.result === 'KAZANDI' || h.result === 'BLACKJACK');
  });
  S.me = S.players.find(p => p.id === myId) || S.players[0];
  S.phase = v.phase;
  S.handNo = v.handNo;
  S.decksLeft = v.decksLeft;
  S.dealer = v.dealer;
  S.turnP = v.turnP;
  S.turnH = v.turnH;

  $('bj-hand').textContent = v.handNo;
  const mine = v.phase === 'play' && v.players[v.turnP]?.id === myId;
  $('bj-stage').textContent = mine ? 'Sıra sende' : (ONLINE_STAGE[v.phase] || '');
  if (mine) {
    $('bj-msg').innerHTML = '<b>SIRA SENDE</b>';
  } else {
    const who = v.phase === 'play' ? v.players[v.turnP]?.name : null;
    $('bj-msg').textContent = who ? `${who} oynuyor…` : (v.msg || '');
  }
  render();
}

/* ---------------- olay bağlantıları ---------------- */
function bind() {
  const on = () => typeof Online !== 'undefined' && Online.isActive();

  document.querySelectorAll('#bj-bet-buttons [data-bet]').forEach(b => b.onclick = () => {
    SFX.chip();
    if (on()) return Online.addBet(+b.dataset.bet);
    if (!S || S.phase !== 'bet') return;
    S.pendingBet = Math.min(S.me.chips, S.pendingBet + +b.dataset.bet);
    render();
  });
  $('bj-bet-clear').onclick = () => {
    if (on()) return Online.clearBet();
    if (S && S.phase === 'bet') { S.pendingBet = MIN_BET(); render(); }
  };
  $('bj-deal').onclick = () => (on() ? Online.bet() : deal());
  $('bj-hit').onclick = () => (on() ? Online.act('hit') : humanMove('hit'));
  $('bj-stand').onclick = () => (on() ? Online.act('stand') : humanMove('stand'));
  $('bj-double').onclick = () => (on() ? Online.act('double') : humanMove('double'));
  $('bj-split').onclick = () => (on() ? Online.act('split') : humanMove('split'));
  $('bj-next').onclick = () => {
    if (on()) return Online.again();
    $('bj-next').classList.add('hidden'); startBetting();
  };
  $('bj-log-toggle').onclick = () => $('bj-logpanel').classList.toggle('open');
}

return {
  init, stop, bind,
  online: { paint: onlinePaint },
  /** Hile: sıradaki n elde doğal blackjack. Çevrimiçi masada çalışmaz. */
  luck(n) { if (S && !S.online) { S.cheat = (S.cheat || 0) + n; return true; } return false; },
};
})();
