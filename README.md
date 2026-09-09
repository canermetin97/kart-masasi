# Kart Masası

**Canlı: https://canermetin97.github.io/kart-masasi/**

Tarayıcıda çalışan, kurulum gerektirmeyen iki kart oyunu: **Texas Hold'em** ve **Blackjack**.
Saf HTML/CSS/JavaScript — derleme adımı, paket, internet bağlantısı yok.

## Çalıştırma

Masaüstünde: `index.html` dosyasına çift tıkla.
Telefonda: aşağıdaki **iPhone'a kurmak** bölümüne bak.

Ekran hem yatay hem dikey çalışır — dikeyde oyuncular iki sıraya sarılır.

(İstersen yerel sunucuyla da açabilirsin: `python3 -m http.server 4321` → http://localhost:4321)

## iPhone'a kurmak (PWA)

Oyun bir **Progressive Web App**. Apple geliştirici hesabı, Xcode veya Mac bağlantısı
gerekmez; ücretsizdir ve süresi dolmaz.

Safari ile **https://canermetin97.github.io/kart-masasi/** adresini aç →
**Paylaş** → **Ana Ekrana Ekle**.

Ana ekranda kendi ikonuyla, tam ekran, adres çubuğu olmadan açılır ve **çevrimdışı çalışır**
(ilk açılışta dosyalar önbelleğe alınır).

> Aynı Wi-Fi'da hızlı denemek için: `python3 -m http.server 4321 --bind 0.0.0.0` çalıştır,
> telefondan `http://<mac-ip>:4321` adresini aç. Bu yol http olduğu için çevrimdışı çalışmaz,
> sadece görünümü test etmek içindir.

## Değişiklik yayınlamak

Yayın GitHub Pages üzerinde, `main` dalının köküne bağlı. Push ettiğin an derleme başlar,
30-60 saniye içinde canlıya çıkar:

```bash
git add -A
git commit -m "değişiklik açıklaması"
git push
```

Derlemenin durumunu görmek için: `gh api /repos/canermetin97/kart-masasi/pages --jq .status`
(`building` → `built`).

### Dosya sürümleri

`index.html` içindeki `?v=N` etiketleri ve `sw.js` içindeki `VERSION` **aynı olmalı**.
Kodda bir şey değiştirdiğinde ikisini birlikte artır — yoksa tarayıcı ve servis çalışanı
eski dosyaları servis etmeye devam eder.

## Ayarlar

Üst barda (ve menüde) iki buton var, tercihin tarayıcıda saklanır:

- **🔊 Ses** — efektleri açar/kapatır. Sesler Web Audio ile üretilir, ses dosyası yok.
- **⏱ Hız** — Yavaş / Normal / Hızlı arasında geçiş yapar; botların düşünme süresi ve
  kart dağıtma temposu bu ayara göre ölçeklenir.

## Oyunlar

### Texas Hold'em
- Masada 3–6 oyuncu (sen + botlar), başlangıç jetonu ve blind seviyesi seçilebilir.
- **Masa düzeni:** herkes masanın alt yarısında, yan yana oturur; sen ortadasın.
  Ortak kartlar ve pot üstte, ortada durur.
- **👁 Açık / 🙈 Kapalı** butonu rakiplerin kartlarını açar ya da kapatır.
  Açıkken bütün eller masada görünür (öğrenmek ve izlemek için); kapatınca normal poker.
- Buton her elde döner; small/big blind otomatik yatırılır.
- **Blind artışı** (isteğe bağlı): kapalı, ya da 5 / 10 / 20 elde bir yükselir.
  Seviye ilerlemesi başlangıç blind'ının katlarıdır — 5/10 için
  `5/10 → 10/20 → 15/30 → 25/50 → 40/80 → 60/120 → 100/200 → …`
  Üst barda hangi seviyede olduğun ve sonraki artışa kaç el kaldığı yazar.
- Preflop → Flop → Turn → River → Showdown; her aşamada bahis turu.
- Kendi iki kartın masanın altında, tam önünde büyük olarak durur; altında elinin adı yazar
  (flop'tan sonra "İki Çift", "Floş" gibi).
- Fold / Check / Call / Bet / Raise, slider ve ½–¾–Pot–All-in kısayolları.
- All-in ve **yan pot (side pot)** desteği; berabere kalan potlar bölüşülür.
- Showdown'da kazanan 5 kart altın çerçeveyle işaretlenir.
- Jetonu biten oyuncu masadan kalkar; son kalan masayı kazanır.

### Blackjack
- Masada 3–6 oyuncu (sen + botlar), 6 desteli shoe (%25 kalınca karışır).
- Krupiye **soft 17'de durur**, Blackjack **3:2** öder.
- Hit / Stand / Double / Split (en fazla 4 el; split A'lara tek kart, split sonrası double yok).
- Botlar temel strateji (basic strategy) oynar.
- **Masa düzeni:** krupiye en üstte, ortada deste, her oyuncunun masanın alt yarısında
  sabit bir noktası var. Kartlar tek tek ortadaki desteden uçarak noktalara gelir —
  Normal hızda saniyede bir kart. Hiçbir şey yerinden oynamaz.
- Kendi elin ayrıca masanın altında, tam önünde büyük gösterilir (toplamıyla birlikte).
- Çok kartlı ellerde kartlar kasinodaki gibi birbirinin üstüne serilir.
- Sıra sana geldiğinde **süre sınırı yoktur** — masa sen karar verene kadar bekler.

## Dosyalar

| Dosya | İçerik |
|---|---|
| `index.html` | Tüm ekranlar (menü, kurulum, poker, blackjack) |
| `css/style.css` | Kırmızı tema, masa, kartlar, yerleşim |
| `js/sfx.js` | Web Audio ses efektleri + ses aç/kapa ayarı |
| `js/speed.js` | Oyun hızı ayarı (tüm gecikmeler bu çarpanla ölçeklenir) |
| `js/cards.js` | Deste, karıştırma, kart çizimi, poker el değerlendirici |
| `js/poker.js` | Texas Hold'em motoru + bot yapay zekâsı |
| `js/blackjack.js` | Blackjack motoru + temel strateji botları |
| `js/app.js` | Ekran yönlendirme, masa kurulumu, servis çalışanı kaydı |
| `sw.js` | Çevrimdışı önbellek (servis çalışanı) |
| `manifest.webmanifest` | PWA tanımı (ad, ikon, tam ekran, tema rengi) |
| `icons/` | Uygulama ikonları (SVG kaynak + 192/512/maskable/apple-touch PNG) |

Gerçek para yok, sadece jeton.
