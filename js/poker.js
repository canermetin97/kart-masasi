/* ============================================================
   poker.js — Texas Hold'em (3-6 kişi, 1 insan + botlar)
   ============================================================ */
const Poker = (() => {

const BOT_NAMES = ['Cem', 'Zeynep', 'Murat', 'Elif', 'Kaan', 'Deniz', 'Selin', 'Emre', 'Burak'];
const STAGE_TR = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' };
/* Blind seviyeleri: başlangıç big blind'ının katları. Hepsi çift sayı katı,
   böylece small blind her seviyede tam sayı kalır. */
const BLIND_LEVELS = [1, 2, 3, 5, 8, 12, 20, 30, 50, 80, 120, 200];

let S = null;
let token = 0;

/* Rakip kartları açık mı? Ayar üst bardaki göz butonundan değişir. */
let openCards = true;
try { const v = localStorage.getItem('kartmasasi.opencards'); if (v !== null) openCards = v === '1'; } catch (e) {}

const $ = id => document.getElementById(id);
const later = (fn, ms) => { const t = token; setTimeout(() => { if (t === token && S) fn(); }, Speed.ms(ms)); };

/* ---------------- kurulum ---------------- */
function init(cfg) {
  token++;
  const names = shuffle(BOT_NAMES.slice()).slice(0, cfg.count - 1);
  S = {
    sb: Math.round(cfg.bb / 2), bb: cfg.bb,
    baseBb: cfg.bb, blindUp: cfg.blindUp || 0, level: 0,
    handNo: 0, dealer: -1, over: false, awaiting: false,
    players: [{ id: 0, name: cfg.name || 'Sen', chips: cfg.stack, isHuman: true }]
      .concat(names.map((n, i) => ({ id: i + 1, name: n, chips: cfg.stack, isHuman: false }))),
  };
  S.players.forEach(p => Object.assign(p, {
    hole: [], folded: false, allIn: false, bet: 0, total: 0, acted: false,
    status: '', alive: true, mood: 0.5, best: null,
  }));
  $('pk-blinds').textContent = `${S.sb}/${S.bb}`;
  $('pk-log').innerHTML = '';
  buildSeats();
  newHand();
}

function stop() { token++; S = null; }

function log(text, hl) {
  const li = document.createElement('li');
  li.textContent = text;
  if (hl) li.className = 'hl';
  const ul = $('pk-log');
  ul.appendChild(li);
  ul.scrollTop = ul.scrollHeight;
}

/* ---------------- koltuk yerleşimi ---------------- */
/* Herkes masanın alt yarısında, hafif yay üzerinde oturur; insan oyuncu ortada.
   Sıra dizilişi korunur: insanın solundaki/sağındaki oyuncular oyun sırasına göredir. */
function buildSeats() {
  const wrap = $('pk-seats');
  wrap.innerHTML = '';
  const n = S.players.length;
  const cols = n <= 4 ? 2 : 3;
  wrap.style.setProperty('--cols', cols);
  const center = Math.floor((n - 1) / 2);
  S.players.forEach((p, i) => {
    const pos = (center + i) % n;
    const t = ((pos + 0.5) / n) * 2 - 1;              // -1 sol .. +1 sağ
    const el = document.createElement('div');
    el.className = 'seat' + (p.isHuman ? ' you' : '');
    el.style.left = (50 + t * 38) + '%';
    el.style.bottom = (6 + Math.pow(Math.abs(t), 1.7) * 9) + '%';
    el.innerHTML =
      `<div class="hand-cards"></div>
       <div class="seat-wrap">
         <div class="seat-plate">
           <div class="seat-name">${p.name}</div>
           <div class="seat-chips"></div>
           <div class="seat-status"></div>
         </div>
         <div class="seat-bet empty">0</div>
       </div>`;
    wrap.appendChild(el);
    p.el = el;
  });
}

/* ---------------- yeni el ---------------- */
function newHand() {
  const alive = S.players.filter(p => p.chips > 0);
  S.players.forEach(p => p.alive = p.chips > 0);

  if (alive.length < 2) { gameOver(); return; }
  if (!S.players[0].alive) { gameOver(); return; }

  S.handNo++;

  // turnuva temposu: N elde bir blindler yükselir
  S.levelMsg = '';
  if (S.blindUp) {
    const lvl = Math.floor((S.handNo - 1) / S.blindUp);
    if (lvl > S.level) {
      S.level = lvl;
      const m = BLIND_LEVELS[Math.min(lvl, BLIND_LEVELS.length - 1)];
      S.bb = S.baseBb * m;
      S.sb = S.bb / 2;
      S.levelMsg = `Blindler yükseldi — ${fmt(S.sb)} / ${fmt(S.bb)}`;
      log(`▲ Seviye ${lvl + 1}: blindler ${fmt(S.sb)}/${fmt(S.bb)}`, true);
    }
  }

  S.deck = shuffle(makeDeck());
  S.board = [];
  S.pot = 0;
  S.currentBet = 0;
  S.minRaise = S.bb;
  S.stage = 'preflop';
  S.awaiting = false;
  S.over = false;
  S.winners = [];

  S.players.forEach(p => {
    p.hole = []; p.bet = 0; p.total = 0; p.acted = false; p.allIn = false;
    p.best = null; p.showCards = false;
    p.folded = !p.alive;
    p.winner = false;
    p.status = p.alive ? '' : 'ELENDİ';
    p.mood = Math.random();
  });

  // buton, alive oyuncular arasında dönsün
  do { S.dealer = (S.dealer + 1) % S.players.length; } while (!S.players[S.dealer].alive);

  const nAlive = alive.length;
  const nextAlive = i => { do { i = (i + 1) % S.players.length; } while (!S.players[i].alive); return i; };
  const sbIdx = nAlive === 2 ? S.dealer : nextAlive(S.dealer);
  const bbIdx = nextAlive(sbIdx);

  put(S.players[sbIdx], S.sb); S.players[sbIdx].status = 'SB';
  put(S.players[bbIdx], S.bb); S.players[bbIdx].status = 'BB';
  S.currentBet = S.bb;

  // kart dağıt
  for (let k = 0; k < 2; k++)
    S.players.forEach(p => { if (p.alive) p.hole.push(S.deck.pop()); });

  $('pk-hand').textContent = S.handNo;
  $('pk-msg').textContent = S.levelMsg;
  $('pk-next').classList.add('hidden');
  log(`— El ${S.handNo} — buton: ${S.players[S.dealer].name}`, true);

  hideActions();
  render();
  if (S.levelMsg) SFX.win();
  SFX.shuffle();
  setTimeout(() => SFX.dealMany(alive.length * 2), 260);
  S.actor = advanceActor(bbIdx);
  later(turn, 600);
}

function gameOver() {
  S.over = true;
  const me = S.players[0];
  const msg = me.chips > 0
    ? `Masayı sen kazandın! Toplam ${fmt(me.chips)} jeton.`
    : 'Jetonların bitti. Masadan kalktın.';
  $('pk-msg').textContent = msg;
  log(msg, true);
  hideActions();
  $('pk-next').classList.add('hidden');
  render();
}

/* ---------------- bahis mekaniği ---------------- */
function put(p, amt) {
  amt = Math.max(0, Math.min(amt, p.chips));
  p.chips -= amt; p.bet += amt; p.total += amt; S.pot += amt;
  if (p.chips === 0) p.allIn = true;
  return amt;
}

const needsAction = p =>
  p.alive && !p.folded && !p.allIn && (!p.acted || p.bet < S.currentBet);

function advanceActor(from) {
  for (let k = 1; k <= S.players.length; k++) {
    const i = (from + k) % S.players.length;
    if (needsAction(S.players[i])) return i;
  }
  return -1;
}

function act(p, type, raiseTo) {
  const wasBet = S.currentBet > 0;
  if (type === 'fold') {
    p.folded = true; p.status = 'FOLD';
    SFX.deal();
    log(`${p.name} fold etti`);
  } else if (type === 'call') {
    const need = S.currentBet - p.bet;
    const paid = put(p, need);
    if (need <= 0) { p.status = 'CHECK'; SFX.click(); log(`${p.name} check`); }
    else if (p.allIn) { p.status = 'ALL-IN'; SFX.chip(); log(`${p.name} all-in ${fmt(paid)}`, true); }
    else { p.status = 'CALL'; SFX.chip(); log(`${p.name} call ${fmt(paid)}`); }
  } else {
    const max = p.bet + p.chips;
    const target = Math.min(raiseTo, max);
    put(p, target - p.bet);
    if (target > S.currentBet) S.minRaise = Math.max(S.minRaise, target - S.currentBet);
    S.currentBet = Math.max(S.currentBet, target);
    S.players.forEach(o => { if (o !== p && !o.folded && !o.allIn) o.acted = false; });
    SFX.chip();
    p.status = p.allIn ? 'ALL-IN' : (wasBet ? 'RAISE' : 'BET');
    log(`${p.name} ${p.allIn ? 'all-in' : (wasBet ? 'raise' : 'bet')} → ${fmt(target)}`, p.allIn);
  }
  p.acted = true;
  render();
  proceed(p);
}

function proceed(p) {
  const live = S.players.filter(x => x.alive && !x.folded);
  if (live.length === 1) { later(() => winUncontested(live[0]), 500); return; }
  const idx = S.players.indexOf(p);
  const nxt = advanceActor(idx);
  if (nxt === -1) { later(nextStage, 550); return; }
  S.actor = nxt;
  later(turn, 420);
}

function turn() {
  const p = S.players[S.actor];
  render();
  if (!p.isHuman) hideActions();
  if (p.isHuman) humanTurn();
  else later(() => { if (S && !S.over) botAct(p); }, 550 + Math.random() * 700);
}

/* ---------------- aşamalar ---------------- */
function nextStage() {
  S.players.forEach(p => { p.bet = 0; p.acted = false; if (p.status !== 'FOLD' && p.status !== 'ALL-IN' && p.status !== 'ELENDİ') p.status = ''; });
  S.currentBet = 0;
  S.minRaise = S.bb;

  if (S.stage === 'river') { showdown(); return; }
  S.stage = S.stage === 'preflop' ? 'flop' : S.stage === 'flop' ? 'turn' : 'river';

  S.deck.pop(); // burn
  const draw = S.stage === 'flop' ? 3 : 1;
  for (let i = 0; i < draw; i++) S.board.push(S.deck.pop());
  SFX.dealMany(draw);
  log(`${STAGE_TR[S.stage]}: ${S.board.map(c => c.r + c.s).join(' ')}`);
  render();

  const canAct = S.players.filter(p => p.alive && !p.folded && !p.allIn).length;
  const live = S.players.filter(p => p.alive && !p.folded).length;
  if (live < 2) { later(() => winUncontested(S.players.find(p => p.alive && !p.folded)), 400); return; }
  if (canAct < 2) { later(nextStage, 850); return; }   // herkes all-in → kartları aç

  S.actor = advanceActor(S.dealer);
  if (S.actor === -1) { later(nextStage, 600); return; }
  later(turn, 500);
}

/* ---------------- kazananı belirle ---------------- */
function winUncontested(w) {
  if (!w) return;
  w.chips += S.pot;
  w.status = 'KAZANDI';
  w.winner = true;
  SFX.chips();
  setTimeout(() => (w.isHuman ? SFX.win() : SFX.lose()), 260);
  $('pk-msg').textContent = `${w.name} potu aldı (+${fmt(S.pot)}) — rakipler pas geçti.`;
  log(`${w.name} potu kazandı: ${fmt(S.pot)}`, true);
  S.pot = 0;
  endHand();
}

function showdown() {
  S.stage = 'showdown';
  const live = S.players.filter(p => p.alive && !p.folded);
  live.forEach(p => { p.best = bestHand([...p.hole, ...S.board]); p.showCards = true; p.status = p.best.name; });
  SFX.flip();
  render();

  // yan potlar
  const levels = [...new Set(S.players.filter(p => p.total > 0).map(p => p.total))].sort((a, b) => a - b);
  let prev = 0;
  const results = [];
  for (const lv of levels) {
    let amt = 0;
    S.players.forEach(p => { amt += Math.max(0, Math.min(p.total, lv) - prev); });
    const elig = live.filter(p => p.total >= lv);
    if (amt > 0 && elig.length) {
      let best = null;
      elig.forEach(p => { if (!best || cmpScore(p.best.score, best.best.score) > 0) best = p; });
      const winners = elig.filter(p => cmpScore(p.best.score, best.best.score) === 0);
      const share = Math.floor(amt / winners.length);
      let rem = amt - share * winners.length;
      winners.forEach((w, i) => { w.chips += share + (i < rem ? 1 : 0); });
      results.push({ amt, winners });
    }
    prev = lv;
  }
  S.pot = 0;

  const main = results[0];
  const winSet = new Set();
  results.forEach(r => r.winners.forEach(w => w.best.cards.forEach(c => winSet.add(cardKey(c)))));
  S.winSet = winSet;
  S.players.forEach(p => { if (main && main.winners.includes(p)) p.status = 'KAZANDI · ' + p.best.name; });

  results.forEach(r => r.winners.forEach(w => w.winner = true));
  SFX.chips();
  setTimeout(() => (S.players[0].winner ? SFX.win() : SFX.lose()), 420);

  const txt = results.map(r =>
    `${r.winners.map(w => w.name).join(' & ')} +${fmt(r.amt)} (${r.winners[0].best.name})`).join(' | ');
  $('pk-msg').textContent = txt;
  log('Showdown → ' + txt, true);
  render();
  endHand();
}

function endHand() {
  S.over = true;
  hideActions();
  S.players.forEach(p => { if (p.chips === 0) p.alive = false; });
  render();
  const btn = $('pk-next');
  const stillIn = S.players.filter(p => p.chips > 0);
  if (stillIn.length < 2 || S.players[0].chips === 0) {
    later(gameOver, 1400);
  } else {
    btn.classList.remove('hidden');
  }
}

/* ---------------- bot yapay zekâsı ---------------- */
function preflopStrength(hole) {
  const [a, b] = hole.slice().sort((x, y) => y.v - x.v);
  const suited = a.sk === b.sk, gap = a.v - b.v;
  let s;
  if (gap === 0) s = 0.52 + (a.v - 2) / 12 * 0.46;
  else {
    s = (a.v / 14) * 0.44 + (b.v / 14) * 0.22;
    if (suited) s += 0.07;
    if (gap === 1) s += 0.06; else if (gap === 2) s += 0.03; else if (gap > 4) s -= 0.07;
  }
  return Math.max(0.05, Math.min(1, s));
}

function postflopStrength(p) {
  const bh = bestHand([...p.hole, ...S.board]);
  const base = [0.14, 0.36, 0.56, 0.70, 0.80, 0.86, 0.93, 0.97, 0.99, 1][bh.score[0]];
  let s = base;
  if (bh.score[0] <= 1) s += (bh.score[1] - 2) / 12 * 0.10;
  // renk/kent çekişi bonusu
  if (S.board.length < 5 && bh.score[0] < 5) {
    const all = [...p.hole, ...S.board];
    const bySuit = {};
    all.forEach(c => bySuit[c.sk] = (bySuit[c.sk] || 0) + 1);
    if (Object.values(bySuit).some(v => v === 4)) s += 0.12;
  }
  return Math.min(1, s);
}

function botAct(p) {
  const toCall = S.currentBet - p.bet;
  const raw = S.stage === 'preflop' ? preflopStrength(p.hole) : postflopStrength(p);
  const s = Math.min(1, raw * (0.86 + p.mood * 0.28));
  const r = Math.random();
  const potOdds = toCall > 0 ? toCall / (S.pot + toCall) : 0;
  const raiseTo = f => S.currentBet + Math.max(S.minRaise, Math.round(S.pot * f / S.bb) * S.bb || S.bb);

  if (toCall <= 0) {
    if (s > 0.74 && r < 0.7) return act(p, 'raise', raiseTo(0.7));
    if (s > 0.55 && r < 0.32) return act(p, 'raise', raiseTo(0.5));
    if (s < 0.3 && r < 0.18) return act(p, 'raise', raiseTo(0.55)); // blöf
    return act(p, 'call');
  }
  const cheap = toCall <= S.bb * 1.5;
  if (s < potOdds + 0.08 && !(cheap && r < 0.45)) return act(p, 'fold');
  if (s > 0.85 && r < 0.6) return act(p, 'raise', raiseTo(0.9));
  if (s > 0.68 && r < 0.28) return act(p, 'raise', raiseTo(0.6));
  return act(p, 'call');
}

/* ---------------- insan oyuncu arayüzü ---------------- */
function hideActions() {
  S && S.players[0] && (S.awaiting = false);
  ['pk-fold', 'pk-check', 'pk-raise'].forEach(id => $(id).disabled = true);
  $('pk-raise-row').classList.remove('open');
  $('pk-tocall').textContent = '';
}

function humanTurn() {
  const p = S.players[0];
  S.awaiting = true;
  const toCall = S.currentBet - p.bet;
  $('pk-fold').disabled = false;
  $('pk-check').disabled = false;
  $('pk-check').textContent = toCall > 0 ? `Call ${fmt(Math.min(toCall, p.chips))}` : 'Check';
  $('pk-tocall').textContent = toCall > 0 ? `Görmek için ${fmt(Math.min(toCall, p.chips))}` : 'Bedava görüyorsun';

  const minTo = Math.max(S.currentBet + S.minRaise, S.bb);
  const maxTo = p.bet + p.chips;
  const rBtn = $('pk-raise');
  rBtn.textContent = S.currentBet > 0 ? 'Raise' : 'Bet';
  rBtn.disabled = p.chips <= toCall;
  rBtn.dataset.min = Math.min(minTo, maxTo);
  rBtn.dataset.max = maxTo;
}

function humanAct(type, amount) {
  if (!S || !S.awaiting) return;
  S.awaiting = false;
  hideActions();
  act(S.players[0], type, amount);
}

/* ---------------- çizim ---------------- */
function render() {
  if (!S) return;
  $('pk-blinds').textContent = `${fmt(S.sb)}/${fmt(S.bb)}`;
  $('pk-level').textContent = S.blindUp
    ? ` · Sv.${S.level + 1} · ${S.blindUp - ((S.handNo - 1) % S.blindUp)} el`
    : '';
  $('pk-stage').textContent = STAGE_TR[S.stage] || '';
  const potEl = $('pk-pot');
  if (S.shownPot !== S.pot) {
    S.shownPot = S.pot;
    potEl.textContent = fmt(S.pot);
    potEl.classList.remove('pop'); void potEl.offsetWidth; potEl.classList.add('pop');
  }
  $('pk-you-chips').textContent = 'Jeton: ' + fmt(S.players[0].chips);

  renderCards($('pk-community'), S.board, { winSet: S.stage === 'showdown' ? S.winSet : null });

  const me = S.players[0];
  const myBox = $('pk-my-cards');
  myBox.parentElement.classList.toggle('empty', !me.alive || me.hole.length === 0);
  renderCards(myBox, me.alive ? me.hole : [], {
    large: true, dim: me.folded,
    winSet: S.stage === 'showdown' ? S.winSet : null,
  });
  const nameEl = $('pk-my-name');
  if (!me.alive || me.hole.length === 0) nameEl.textContent = '';
  else if (me.folded) nameEl.textContent = 'Fold ettin';
  else if (S.board.length >= 3) nameEl.textContent = bestHand([...me.hole, ...S.board]).name;
  else nameEl.textContent = me.hole[0].v === me.hole[1].v
    ? me.hole[0].r + ' çifti'
    : me.hole.map(c => c.r + c.s).join(' ') + (me.hole[0].sk === me.hole[1].sk ? ' (suited)' : '');

  S.players.forEach((p, i) => {
    const el = p.el;
    el.classList.toggle('folded', p.folded || !p.alive);
    el.classList.toggle('active', !S.over && S.actor === i && !p.folded);
    el.classList.toggle('winner', !!p.winner);

    const hc = el.querySelector('.hand-cards');
    // insan oyuncunun kartları aksiyon barında büyük gösteriliyor, masada tekrar etme
    const shown = p.showCards || openCards;
    if (p.isHuman || !p.alive || p.hole.length === 0) renderCards(hc, []);
    else renderCards(hc, p.hole, {
      faceDown: !shown,
      winSet: S.stage === 'showdown' && shown ? S.winSet : null,
      dim: p.folded,
    });

    el.querySelector('.seat-chips').textContent = p.alive || p.chips > 0 ? fmt(p.chips) : '—';
    el.querySelector('.seat-status').textContent = p.status || '';

    const bet = el.querySelector('.seat-bet');
    bet.textContent = fmt(p.bet);
    bet.classList.toggle('empty', p.bet <= 0);

    const wrap = el.querySelector('.seat-wrap');
    const old = wrap.querySelector('.dealer-btn');
    if (old) old.remove();
    if (i === S.dealer && p.alive) {
      const d = document.createElement('div');
      d.className = 'dealer-btn'; d.textContent = 'D';
      wrap.appendChild(d);
    }
  });
}

/* ---------------- olay bağlantıları ---------------- */
function bind() {
  $('pk-fold').onclick = () => humanAct('fold');
  $('pk-check').onclick = () => humanAct('call');
  $('pk-next').onclick = () => { $('pk-next').classList.add('hidden'); newHand(); };
  $('pk-log-toggle').onclick = () => $('pk-logpanel').classList.toggle('open');

  const eye = $('pk-eye');
  const paintEye = () => {
    eye.textContent = openCards ? '👁 Açık' : '🙈 Kapalı';
    eye.title = openCards ? 'Rakip kartları açık' : 'Rakip kartları kapalı';
  };
  eye.onclick = () => {
    openCards = !openCards;
    try { localStorage.setItem('kartmasasi.opencards', openCards ? '1' : '0'); } catch (e) {}
    paintEye(); SFX.click();
    if (S) render();
  };
  paintEye();

  const row = $('pk-raise-row'), slider = $('pk-raise-slider'), amtEl = $('pk-raise-amount');
  const step = () => S.bb;
  const setAmt = v => {
    const min = +$('pk-raise').dataset.min, max = +$('pk-raise').dataset.max;
    v = Math.max(min, Math.min(max, Math.round(v / step()) * step()));
    if (max - v < step()) v = max;
    slider.value = v; amtEl.textContent = fmt(v);
  };
  $('pk-raise').onclick = () => {
    const min = +$('pk-raise').dataset.min, max = +$('pk-raise').dataset.max;
    slider.min = min; slider.max = max; slider.step = 1;
    setAmt(Math.min(max, Math.max(min, S.currentBet + Math.round(S.pot * 0.6))));
    row.classList.add('open');
  };
  slider.oninput = () => setAmt(+slider.value);
  $('pk-raise-cancel').onclick = () => row.classList.remove('open');
  $('pk-raise-confirm').onclick = () => { row.classList.remove('open'); humanAct('raise', +slider.value); };
  row.querySelectorAll('.quick button').forEach(b => b.onclick = () => {
    const q = b.dataset.q;
    if (q === 'all') setAmt(+$('pk-raise').dataset.max);
    else setAmt(S.currentBet + S.pot * parseFloat(q));
  });
}

return { init, stop, bind };
})();
