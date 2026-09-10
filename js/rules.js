/* ============================================================
   rules.js — deste ve blackjack kuralları.
   TEK KAYNAK: hem tarayıcı (tek kişilik mod) hem Cloudflare Worker
   (çevrimiçi masa) bu dosyayı kullanır, böylece iki mod asla ayrışmaz.
   ES modülü olarak yazılır; tarayıcıda index.html içindeki küçük bir
   modül parçası bunu window.Rules'a bağlar.
   ============================================================ */

export const SUITS = [
  { k: 'S', sym: '♠', red: false },
  { k: 'H', sym: '♥', red: true },
  { k: 'D', sym: '♦', red: true },
  { k: 'C', sym: '♣', red: false },
];
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

/** Kart: {r:'A', s:'♥', sk:'H', red:true, v:14} — v: 2..14 (J=11, Q=12, K=13, A=14) */
export function makeDeck(n = 1) {
  const deck = [];
  for (let d = 0; d < n; d++)
    for (const su of SUITS)
      RANKS.forEach((r, i) => deck.push({ r, s: su.sym, sk: su.k, red: su.red, v: i + 2 }));
  return deck;
}

export function shuffle(a, rnd = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------------- blackjack kuralları ---------------- */

export const BJ = {
  DECKS: 6,
  MIN_BET: 50,
  /** shoe bu sayının altına düşünce yeniden karıştırılır (%25 kesme kartı) */
  get RESHUFFLE_AT() { return Math.floor(this.DECKS * 52 * 0.25); },
};

/** Blackjack kart değeri: A=11, resimliler=10 */
export const bjValue = c => (c.v === 14 ? 11 : Math.min(c.v, 10));

/** El toplamı; As'lar gerekince 1'e döner. → {total, soft} */
export function handValue(cards) {
  let t = 0, aces = 0;
  for (const c of cards) {
    if (!c) continue;                 // gizli kart (çevrimiçi masada null gelir)
    if (c.v === 14) { t += 11; aces++; }
    else t += Math.min(c.v, 10);
  }
  while (t > 21 && aces > 0) { t -= 10; aces--; }
  return { total: t, soft: aces > 0 };
}

/** Doğal blackjack: ilk iki kart 21, split'ten gelmemiş */
export const isBJ = h =>
  !!h && h.cards.length === 2 && h.cards.every(Boolean) &&
  !h.fromSplit && handValue(h.cards).total === 21;

export const canDouble = (h, chips) => h.cards.length === 2 && !h.fromSplit2 && chips >= h.bet;
export const canSplit = (h, chips, handCount) =>
  h.cards.length === 2 && bjValue(h.cards[0]) === bjValue(h.cards[1]) &&
  handCount < 4 && chips >= h.bet;

/** Krupiye soft 17'de durur */
export const dealerMustHit = cards => handValue(cards).total < 17;

/**
 * Temel strateji (basic strategy) — botlar ve süre dolunca otomatik oynayış.
 * 6 deste, krupiye soft 17'de durur, split sonrası double yok.
 */
export function basicStrategy(h, upCard, dbl, spl) {
  const { total, soft } = handValue(h.cards);
  const up = bjValue(upCard);

  if (spl) {
    const r = bjValue(h.cards[0]);
    if (r === 11 || r === 8) return 'split';
    if (r === 9 && up !== 7 && up <= 9) return 'split';
    if ((r === 2 || r === 3 || r === 7) && up <= 7) return 'split';
    if (r === 6 && up <= 6) return 'split';
    if (r === 4 && (up === 5 || up === 6)) return 'split';
  }
  if (soft) {
    if (total >= 19) return 'stand';
    if (total === 18) { if (dbl && up >= 3 && up <= 6) return 'double'; return up >= 9 ? 'hit' : 'stand'; }
    if (total === 17 && dbl && up >= 3 && up <= 6) return 'double';
    if ((total === 15 || total === 16) && dbl && up >= 4 && up <= 6) return 'double';
    if ((total === 13 || total === 14) && dbl && (up === 5 || up === 6)) return 'double';
    return 'hit';
  }
  if (total >= 17) return 'stand';
  if (total >= 13) return up >= 7 ? 'hit' : 'stand';
  if (total === 12) return (up >= 4 && up <= 6) ? 'stand' : 'hit';
  if (total === 11) return dbl ? 'double' : 'hit';
  if (total === 10) return (dbl && up <= 9) ? 'double' : 'hit';
  if (total === 9) return (dbl && up >= 3 && up <= 6) ? 'double' : 'hit';
  return 'hit';
}

/**
 * Bir elin sonucunu ve ödemesini hesaplar.
 * → {result, payout} — payout, oyuncuya geri verilecek toplam (bahis dahil)
 */
export function settleHand(h, dealerCards) {
  const dv = handValue(dealerCards).total;
  const dealerBJ = dealerCards.length === 2 && dv === 21;
  const v = handValue(h.cards).total;
  const pBJ = isBJ(h);

  if (v > 21) return { result: 'KAYIP', payout: 0 };
  if (pBJ && dealerBJ) return { result: 'PUSH', payout: h.bet };
  if (pBJ) return { result: 'BLACKJACK', payout: h.bet + Math.round(h.bet * 1.5) };
  if (dealerBJ) return { result: 'KAYIP', payout: 0 };
  if (dv > 21) return { result: 'KAZANDI', payout: h.bet * 2 };
  if (v > dv) return { result: 'KAZANDI', payout: h.bet * 2 };
  if (v === dv) return { result: 'PUSH', payout: h.bet };
  return { result: 'KAYIP', payout: 0 };
}
