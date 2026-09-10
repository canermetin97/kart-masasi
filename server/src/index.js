/* ============================================================
   Kart Masası — çevrimiçi blackjack masası (Cloudflare Durable Object)
   Otoriter sunucu: deste burada durur, kartları burası dağıtır ve
   her oyuncuya yalnızca görmeye hakkı olan bilgiyi gönderir.
   Kurallar js/rules.js'ten gelir — tarayıcıdaki tek kişilik mod ile
   birebir aynı dosya.
   ============================================================ */
import * as Rules from '../../js/rules.js';

const MAX_HUMANS = 4;
const BOT_NAMES = ['Cem', 'Zeynep', 'Murat', 'Elif', 'Kaan', 'Deniz', 'Selin', 'Emre', 'Burak'];

const TURN_MS = 30000;   // sıra süresi; dolunca temel strateji oynar
const BET_MS  = 30000;   // bahis süresi; dolunca son bahis tekrarlanır
const BOT_MS  = 1200;    // bot düşünme süresi
const DEAL_MS = 700;     // kart başına dağıtım temposu
const NEXT_MS = 7000;    // sonuçtan sonra yeni ele geçiş

const now = () => Date.now();

export class Table {
  constructor(state) {
    this.state = state;
    this.sockets = new Map();          // ws -> playerId
    this.T = null;
    this.timer = null;
    this.seq = 0;
  }

  /* ---------------- bağlantı ---------------- */
  async fetch(req) {
    const url = new URL(req.url);
    if (req.headers.get('Upgrade') !== 'websocket') {
      return Response.json({ ok: true, players: this.T ? this.T.players.length : 0 });
    }
    const id = url.searchParams.get('id') || crypto.randomUUID();
    const name = (url.searchParams.get('name') || 'Oyuncu').slice(0, 12);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    const err = this.attach(server, id, name);
    if (err) {
      server.send(JSON.stringify({ t: 'error', msg: err }));
      server.close(1008, err);
      return new Response(null, { status: 101, webSocket: client });
    }

    server.addEventListener('message', e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      try { this.onMessage(id, m); } catch (ex) { this.send(server, { t: 'error', msg: String(ex.message || ex) }); }
    });
    server.addEventListener('close', () => this.detach(server));
    server.addEventListener('error', () => this.detach(server));

    return new Response(null, { status: 101, webSocket: client });
  }

  attach(ws, id, name) {
    if (!this.T) this.T = this.newTable();
    const T = this.T;
    let p = T.players.find(x => x.id === id);

    if (p) {                                   // yeniden bağlanma
      for (const [old, oid] of this.sockets) {  // aynı kimlikle eski soket varsa kapat
        if (oid === id) { this.sockets.delete(old); try { old.close(1000, 'yeni bağlantı'); } catch {} }
      }
      p.connected = true;
      p.name = name;
    } else {
      const humans = T.players.filter(x => !x.isBot).length;
      if (humans >= MAX_HUMANS) return 'Masa dolu (en fazla 4 kişi).';
      if (T.phase !== 'lobby' && T.phase !== 'bet') return 'Oyun başladı, el bitince tekrar dene.';
      p = this.newPlayer(id, name, false);
      // el ortasında katılan bir sonraki eli bekler
      p.out = T.phase !== 'lobby';
      T.players.push(p);
      this.fillBots();
    }
    if (!T.hostId) T.hostId = p.id;
    this.sockets.set(ws, id);
    this.broadcast();
    return null;
  }

  detach(ws) {
    const id = this.sockets.get(ws);
    this.sockets.delete(ws);
    if (!id || !this.T) return;
    const p = this.T.players.find(x => x.id === id);
    if (p) p.connected = false;

    const live = this.T.players.filter(x => !x.isBot && x.connected);
    if (live.length === 0) {                   // oda boşaldı → masa sıfırlanır
      this.clearTimer();
      this.T = null;
      return;
    }
    if (this.T.hostId === id) this.T.hostId = live[0].id;
    // sırası gelen kişi düştüyse oyun tıkanmasın
    if (this.T.phase === 'play' && this.T.players[this.T.turnP]?.id === id) this.autoAct();
    this.broadcast();
  }

  /* ---------------- durum ---------------- */
  newTable() {
    return {
      phase: 'lobby', handNo: 0,
      seats: 4, stack: 1000, minBet: Rules.BJ.MIN_BET,
      players: [], dealer: { cards: [], hole: true },
      shoe: Rules.shuffle(Rules.makeDeck(Rules.BJ.DECKS)),
      turnP: -1, turnH: 0, deadline: 0, msg: '', hostId: null,
    };
  }

  newPlayer(id, name, isBot) {
    return {
      id, name, isBot, connected: !isBot,
      chips: this.T ? this.T.stack : 1000,
      bet: 0, lastBet: 0, out: false, ready: false, hands: [],
    };
  }

  fillBots() {
    const T = this.T;
    T.players = T.players.filter(p => !p.isBot);
    const used = new Set(T.players.map(p => p.name));
    const pool = BOT_NAMES.filter(n => !used.has(n));
    while (T.players.length < T.seats) {
      T.players.push(this.newPlayer('bot-' + T.players.length, pool.shift() || 'Bot', true));
    }
    T.players.length = Math.min(T.players.length, T.seats);
  }

  draw() {
    const T = this.T;
    if (T.shoe.length < Rules.BJ.RESHUFFLE_AT) {
      T.shoe = Rules.shuffle(Rules.makeDeck(Rules.BJ.DECKS));
      this.log('Shoe karıştırıldı');
    }
    return T.shoe.pop();
  }

  /* ---------------- gelen mesajlar ---------------- */
  onMessage(id, m) {
    const T = this.T;
    if (!T) return;
    const p = T.players.find(x => x.id === id);
    if (!p) return;

    switch (m.t) {
      case 'config': {
        if (id !== T.hostId || T.phase !== 'lobby') return;
        T.seats = Math.max(3, Math.min(6, +m.seats || 4));
        T.stack = Math.max(200, Math.min(10000, +m.stack || 1000));
        T.players.forEach(x => { x.chips = T.stack; });
        this.fillBots();
        this.broadcast();
        break;
      }
      case 'start': {
        if (id !== T.hostId || T.phase !== 'lobby') return;
        this.fillBots();
        T.players.forEach(x => { x.out = false; });
        this.startBetting();
        break;
      }
      case 'bet': {
        if (T.phase !== 'bet' || p.out) return;
        const amt = Math.round(+m.amount || 0);
        if (amt < T.minBet || amt > p.chips) return;
        p.bet = amt;
        p.ready = true;
        this.broadcast();
        if (T.players.every(x => x.out || x.isBot || x.ready)) this.deal();
        break;
      }
      case 'act': {
        if (T.phase !== 'play') return;
        if (T.players[T.turnP]?.id !== id) return;
        p.afk = false;
        this.applyMove(p, p.hands[T.turnH], m.move);
        break;
      }
      case 'again': {
        if (T.phase !== 'settle') return;
        p.ready = true;
        this.broadcast();
        if (T.players.every(x => x.isBot || !x.connected || x.ready)) this.startBetting();
        break;
      }
    }
  }

  /* ---------------- el akışı ---------------- */
  startBetting() {
    const T = this.T;
    this.clearTimer();
    T.handNo++;
    T.phase = 'bet';
    T.dealer = { cards: [], hole: true };
    T.turnP = -1; T.turnH = 0;
    T.msg = 'Bahisler alınıyor';
    T.players.forEach(p => {
      p.hands = []; p.bet = 0; p.ready = false; p.afk = false;
      p.out = p.chips < T.minBet || (!p.isBot && !p.connected);
    });
    if (T.players.filter(p => !p.out).length === 0) { T.phase = 'lobby'; this.broadcast(); return; }

    // botlar hemen bahsini koyar
    T.players.forEach(p => { if (p.isBot && !p.out) { p.bet = this.botBet(p); p.ready = true; } });

    T.deadline = now() + BET_MS;
    this.after(BET_MS, () => {                     // süre dolunca son bahsi tekrarla
      T.players.forEach(p => {
        if (!p.out && !p.ready) { p.bet = Math.min(p.chips, p.lastBet || T.minBet); p.ready = true; }
      });
      this.deal();
    });
    this.broadcast();
  }

  botBet(p) {
    const T = this.T;
    const base = Math.max(T.minBet, Math.round(p.chips * (0.02 + Math.random() * 0.05) / T.minBet) * T.minBet);
    return Math.min(base, p.chips);
  }

  deal() {
    const T = this.T;
    if (T.phase !== 'bet') return;
    this.clearTimer();
    T.phase = 'deal';
    T.msg = '';
    T.players.forEach(p => {
      if (p.out || p.bet < T.minBet) { p.out = true; return; }
      p.chips -= p.bet; p.lastBet = p.bet;
      p.hands = [{ cards: [], bet: p.bet, done: false, doubled: false, fromSplit: false, fromSplit2: false, result: '' }];
    });
    this.log(`— El ${T.handNo} —`);

    const seq = [];
    for (let r = 0; r < 2; r++) {
      T.players.forEach(p => { if (!p.out) seq.push(() => p.hands[0].cards.push(this.draw())); });
      seq.push(() => T.dealer.cards.push(this.draw()));
    }
    let i = 0;
    const tick = () => {
      if (!this.T || this.T !== T) return;
      if (i >= seq.length) { this.afterDeal(); return; }
      seq[i++](); this.broadcast();
      this.after(DEAL_MS, tick);
    };
    tick();
  }

  afterDeal() {
    const T = this.T;
    if (Rules.handValue(T.dealer.cards).total === 21) {   // krupiye peek yapar
      T.dealer.hole = false;
      T.msg = 'Krupiyede Blackjack!';
      this.log('Krupiye Blackjack yaptı');
      this.broadcast();
      this.after(1500, () => this.settle());
      return;
    }
    T.players.forEach(p => { if (!p.out && Rules.isBJ(p.hands[0])) p.hands[0].done = true; });
    T.phase = 'play';
    T.turnP = -1; T.turnH = 0;
    this.nextTurn();
  }

  nextTurn() {
    const T = this.T;
    if (T.turnP >= 0) {                       // aynı oyuncunun başka eli var mı
      const p = T.players[T.turnP];
      const nh = p.hands.findIndex(h => !h.done);
      if (nh >= 0) { T.turnH = nh; return this.beginTurn(p); }
    }
    for (let i = T.turnP + 1; i < T.players.length; i++) {
      const p = T.players[i];
      if (p.out) continue;
      const nh = p.hands.findIndex(h => !h.done);
      if (nh >= 0) { T.turnP = i; T.turnH = nh; return this.beginTurn(p); }
    }
    T.turnP = -1;
    this.dealerPlay();
  }

  beginTurn(p) {
    const T = this.T;
    this.clearTimer();
    if (p.isBot || !p.connected || p.afk) {
      T.deadline = 0;
      this.broadcast();
      this.after(BOT_MS, () => this.autoAct());
      return;
    }
    T.deadline = now() + TURN_MS;
    this.broadcast();
    this.after(TURN_MS, () => {                   // süre dolunca temel strateji
      const cur = T.players[T.turnP];
      if (cur) cur.afk = true;                    // bir daha 30sn bekletme
      this.autoAct();
    });
  }

  /** Bot, düşen oyuncu ya da süresi dolan oyuncu için temel strateji oynar */
  autoAct() {
    const T = this.T;
    if (!T || T.phase !== 'play' || T.turnP < 0) return;
    const p = T.players[T.turnP];
    const h = p.hands[T.turnH];
    if (!h) return;
    const mv = Rules.basicStrategy(
      h, T.dealer.cards[0],
      Rules.canDouble(h, p.chips),
      Rules.canSplit(h, p.chips, p.hands.length),
    );
    this.applyMove(p, h, mv);
  }

  applyMove(p, h, mv) {
    const T = this.T;
    if (!h || h.done) return;
    this.clearTimer();

    if (mv === 'split' && Rules.canSplit(h, p.chips, p.hands.length)) {
      const idx = p.hands.indexOf(h);
      p.chips -= h.bet;
      const moved = h.cards.pop();
      const nh = { cards: [moved, this.draw()], bet: h.bet, done: false, doubled: false, fromSplit: true, fromSplit2: true, result: '' };
      h.fromSplit = true; h.fromSplit2 = true;
      h.cards.push(this.draw());
      p.hands.splice(idx + 1, 0, nh);
      if (Rules.bjValue(h.cards[0]) === 11) { h.done = true; nh.done = true; }  // split As'lara tek kart
      this.log(`${p.name} split yaptı`);
    } else if (mv === 'double' && Rules.canDouble(h, p.chips)) {
      p.chips -= h.bet; h.bet *= 2; h.doubled = true;
      h.cards.push(this.draw());
      h.done = true;
      if (Rules.handValue(h.cards).total > 21) h.result = 'BATTI';
      this.log(`${p.name} double (${Rules.handValue(h.cards).total})`);
    } else if (mv === 'stand') {
      h.done = true;
      this.log(`${p.name} durdu (${Rules.handValue(h.cards).total})`);
    } else {                                    // hit
      h.cards.push(this.draw());
      const v = Rules.handValue(h.cards).total;
      if (v > 21) { h.done = true; h.result = 'BATTI'; this.log(`${p.name} battı (${v})`); }
      else if (v === 21) h.done = true;
    }

    this.broadcast();
    if (h.done) this.after(500, () => this.nextTurn());
    else this.beginTurn(p);
  }

  dealerPlay() {
    const T = this.T;
    T.phase = 'dealer';
    T.dealer.hole = false;
    T.msg = 'Krupiye oynuyor';
    T.deadline = 0;
    this.broadcast();

    const alive = T.players.some(p => !p.out && p.hands.some(h => Rules.handValue(h.cards).total <= 21));
    if (!alive) { this.after(900, () => this.settle()); return; }

    const step = () => {
      if (!this.T || this.T !== T) return;
      if (Rules.dealerMustHit(T.dealer.cards)) {
        T.dealer.cards.push(this.draw());
        this.broadcast();
        this.after(900, step);
      } else {
        this.log(`Krupiye: ${Rules.handValue(T.dealer.cards).total}`);
        this.after(700, () => this.settle());
      }
    };
    this.after(900, step);
  }

  settle() {
    const T = this.T;
    this.clearTimer();
    T.phase = 'settle';
    T.dealer.hole = false;
    const dv = Rules.handValue(T.dealer.cards).total;

    T.players.forEach(p => {
      if (p.out) return;
      p.net = 0;
      p.hands.forEach(h => {
        const { result, payout } = Rules.settleHand(h, T.dealer.cards);
        h.result = result;
        p.chips += payout;
        p.net += payout - h.bet;
      });
      p.ready = false;
    });
    T.msg = `Krupiye ${dv > 21 ? 'battı' : dv}`;
    this.log(T.msg);
    T.deadline = now() + NEXT_MS;
    this.broadcast();
    this.after(NEXT_MS, () => this.startBetting());
  }

  /* ---------------- zamanlayıcı ---------------- */
  after(ms, fn) {
    this.clearTimer();
    const mine = ++this.seq;
    this.timer = setTimeout(() => { if (mine === this.seq) fn(); }, ms);
  }
  clearTimer() {
    this.seq++;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  /* ---------------- gönderim ---------------- */
  log(text) {
    for (const [ws] of this.sockets) this.send(ws, { t: 'log', text });
  }

  send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch {} }

  /** Her oyuncuya kendi görüşünü gönderir; krupiyenin kapalı kartı hiç yollanmaz. */
  view(forId) {
    const T = this.T;
    const dealerCards = T.dealer.cards.map((c, i) => (T.dealer.hole && i === 1 ? null : c));
    return {
      t: 'state',
      you: forId,
      hostId: T.hostId,
      phase: T.phase, handNo: T.handNo, seats: T.seats, stack: T.stack,
      minBet: T.minBet, msg: T.msg,
      deadline: T.deadline, serverNow: now(),
      decksLeft: Math.max(1, Math.ceil(T.shoe.length / 52)),
      dealer: { cards: dealerCards, hole: T.dealer.hole },
      turnP: T.turnP, turnH: T.turnH,
      players: T.players.map(p => ({
        id: p.id, name: p.name, isBot: p.isBot, connected: p.connected,
        chips: p.chips, bet: p.bet, out: p.out, ready: p.ready, afk: !!p.afk, net: p.net || 0,
        hands: p.hands.map(h => ({
          cards: h.cards, bet: h.bet, done: h.done, doubled: h.doubled,
          fromSplit: h.fromSplit, fromSplit2: h.fromSplit2, result: h.result,
        })),
      })),
    };
  }

  broadcast() {
    if (!this.T) return;
    for (const [ws, id] of this.sockets) this.send(ws, this.view(id));
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);   // ['room', CODE, 'ws']
    if (parts[0] !== 'room' || !parts[1]) {
      return new Response('Kart Masası sunucusu', { status: 200 });
    }
    const code = parts[1].toUpperCase().slice(0, 12);
    return env.TABLE.get(env.TABLE.idFromName(code)).fetch(req);
  },
};
