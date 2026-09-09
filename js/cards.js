/* ============================================================
   cards.js — deste, kart görseli ve poker el değerlendirmesi
   ============================================================ */

const SUITS = [
  { k: 'S', sym: '♠', red: false },
  { k: 'H', sym: '♥', red: true  },
  { k: 'D', sym: '♦', red: true  },
  { k: 'C', sym: '♣', red: false },
];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

/** Tek kart: {r:'A', s:'♥', red:true, v:14, sk:'H'} */
function makeDeck(n = 1) {
  const deck = [];
  for (let d = 0; d < n; d++)
    for (const su of SUITS)
      RANKS.forEach((r, i) => deck.push({ r, s: su.sym, sk: su.k, red: su.red, v: i + 2 }));
  return deck;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** DOM kart elemanı. opts: {small, faceDown, win, dim} */
function cardEl(card, opts = {}) {
  const el = document.createElement('div');
  el.className = 'card' + (opts.small ? ' sm' : opts.large ? ' lg' : '');
  if (opts.faceDown || !card) { el.classList.add('back'); return el; }
  if (card.red) el.classList.add('red');
  if (opts.win) el.classList.add('win');
  if (opts.dim) el.classList.add('dim');
  el.innerHTML =
    `<span class="r">${card.r}</span>` +
    `<span class="big">${card.s}</span>` +
    `<span class="s">${card.s}</span>`;
  return el;
}

/* Kartları çizer. Var olan kartlara dokunmaz, sadece yeni geleni ekler —
   böylece her çizimde dağıtma animasyonu baştan başlamaz. */
function renderCards(container, cards, opts = {}) {
  const optSig = JSON.stringify([
    !!opts.small, !!opts.large, !!opts.faceDown, !!opts.dim,
    opts.faceDownIdx || null,
    opts.winSet ? [...opts.winSet].sort() : null,
  ]);
  const keys = cards.map(c => (c ? c.r + c.sk : 'x'));
  const build = (c, i) => {
    const o = Object.assign({}, opts);
    if (opts.faceDownIdx && opts.faceDownIdx.includes(i)) o.faceDown = true;
    if (opts.winSet && c) o.win = opts.winSet.has(c.r + c.sk);
    return cardEl(c, o);
  };
  const prev = container._keys || [];
  if (container._opt === optSig && prev.length <= keys.length && prev.every((k, i) => k === keys[i])) {
    for (let i = prev.length; i < keys.length; i++) {
      const el = build(cards[i], i);
      container.appendChild(el);
      if (opts.flyFrom) flyIn(el, opts.flyFrom, opts.flyMs || 420);
    }
    container._keys = keys;
    return;
  }
  container._opt = optSig;
  container._keys = keys;
  container.innerHTML = '';
  cards.forEach((c, i) => container.appendChild(build(c, i)));
}

/* Kartı, verilen elemanın (deste) üzerinden kendi yerine uçurur.
   Kart zaten DOM'da ve doğru yerinde; sadece başlangıç noktasından geri sarıyoruz. */
function flyIn(el, fromEl, ms) {
  if (!fromEl) return;
  const src = fromEl.getBoundingClientRect();
  const dst = el.getBoundingClientRect();
  if (!src.width || !dst.width) return;
  const dx = (src.left + src.width / 2) - (dst.left + dst.width / 2);
  const dy = (src.top + src.height / 2) - (dst.top + dst.height / 2);
  el.classList.add('flying');
  el.style.transition = 'none';
  el.style.transform = `translate(${dx}px, ${dy}px) scale(.66) rotate(-14deg)`;
  void el.offsetWidth;
  el.style.transition = `transform ${ms}ms cubic-bezier(.2,.75,.28,1)`;
  el.style.transform = 'translate(0,0) scale(1) rotate(0deg)';
  setTimeout(() => {
    el.classList.remove('flying');
    el.style.transition = ''; el.style.transform = '';
  }, ms + 60);
}

const fmt = n => Math.round(n).toLocaleString('tr-TR');

/* ------------------------------------------------------------
   Poker el değerlendirmesi
   Skor dizisi: [kategori, ...beraberlik bozucular] — sözlük sırası
   ------------------------------------------------------------ */
const HAND_NAMES = [
  'Yüksek Kart', 'Bir Çift', 'İki Çift', 'Üçlü', 'Kent',
  'Floş', 'Full House', 'Dörtlü', 'Straight Flush', 'Royal Flush',
];

function score5(cards) {
  const vals = cards.map(c => c.v).sort((a, b) => b - a);
  const flush = cards.every(c => c.sk === cards[0].sk);

  const uniq = [...new Set(vals)];
  let straightHi = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHi = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5) straightHi = 5; // A-2-3-4-5
  }

  const counts = {};
  vals.forEach(v => counts[v] = (counts[v] || 0) + 1);
  // [adet, değer] — önce adet, sonra değer büyükten küçüğe
  const groups = Object.entries(counts)
    .map(([v, c]) => [c, +v])
    .sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const shape = groups.map(g => g[0]).join('');
  const ord = groups.map(g => g[1]);

  if (straightHi && flush) return [straightHi === 14 ? 9 : 8, straightHi];
  if (shape === '41')   return [7, ord[0], ord[1]];
  if (shape === '32')   return [6, ord[0], ord[1]];
  if (flush)            return [5, ...vals];
  if (straightHi)       return [4, straightHi];
  if (shape === '311')  return [3, ...ord];
  if (shape === '221')  return [2, ...ord];
  if (shape === '2111') return [1, ...ord];
  return [0, ...vals];
}

function cmpScore(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

const COMBO5 = (() => {
  const out = [];
  for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) for (let c = b + 1; c < 7; c++)
    for (let d = c + 1; d < 7; d++) for (let e = d + 1; e < 7; e++) out.push([a, b, c, d, e]);
  return out;
})();

/** 5-7 karttan en iyi 5'liyi bulur → {score, cards, name} */
function bestHand(cards) {
  if (cards.length < 5) return { score: [-1], cards: [], name: '—' };
  let best = null, bestCards = null;
  if (cards.length === 7) {
    for (const idx of COMBO5) {
      const sel = idx.map(i => cards[i]);
      const sc = score5(sel);
      if (!best || cmpScore(sc, best) > 0) { best = sc; bestCards = sel; }
    }
  } else {
    const n = cards.length, idxs = [];
    const rec = (start, cur) => {
      if (cur.length === 5) { idxs.push(cur.slice()); return; }
      for (let i = start; i < n; i++) { cur.push(i); rec(i + 1, cur); cur.pop(); }
    };
    rec(0, []);
    for (const idx of idxs) {
      const sel = idx.map(i => cards[i]);
      const sc = score5(sel);
      if (!best || cmpScore(sc, best) > 0) { best = sc; bestCards = sel; }
    }
  }
  return { score: best, cards: bestCards, name: HAND_NAMES[best[0]] };
}

const cardKey = c => c.r + c.sk;
