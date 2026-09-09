# Çevrimiçi masa sunucusu

Cloudflare Worker + Durable Object. Her oda kodu bir Durable Object'e karşılık gelir;
o odanın destesi, elleri ve sırası bu nesnenin içinde durur.

**Otoriter sunucu:** kartları burası dağıtır ve her istemciye yalnızca görmeye hakkı
olduğu bilgiyi gönderir. Krupiyenin kapalı kartı istemciye hiç gitmez (`null` olarak
yollanır). Poker eklendiğinde hole kartlar için de aynı düzen kullanılacak.

Kurallar `../js/rules.js`'ten import edilir — tarayıcıdaki tek kişilik mod ile birebir
aynı dosya, böylece iki mod ayrışamaz.

## Geliştirme

```bash
cd server
npx wrangler dev --port 8787 --local     # hesap gerekmez
```

## Yayına alma

```bash
npx wrangler login       # tarayıcıda onay
npx wrangler deploy
```

## Protokol

İstemci → sunucu: `config` (masayı kur, sadece host), `start`, `bet {amount}`,
`act {move}` (hit/stand/double/split), `again` (sonraki el).

Sunucu → istemci: `state` (tam durum anlık görüntüsü), `log {text}`, `error {msg}`.

Bağlantı: `wss://<host>/room/<KOD>/ws?id=<oyuncuId>&name=<ad>`

## Kurallar ve sınırlar

- Aynı masada en fazla 4 gerçek kişi; kalan koltuklar bot.
- Masayı odayı açan kurar (koltuk sayısı, başlangıç jetonu).
- Jetonlar oda boşalınca sıfırlanır.
- Bahis süresi 30 sn (dolunca son bahis tekrarlanır), sıra süresi 30 sn
  (dolunca temel strateji oynar ve oyuncu "afk" işaretlenir, sonraki kararları
  beklemeden oynanır — masa kilitlenmez).
- Bağlantı koparsa aynı `id` ile dönüldüğünde koltuk ve jetonlar korunur.
