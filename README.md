# MetaAds Panel

Meta Ads hesaplarını, kampanyalarını ve satış performansını tek yerden yönetmek için yerel bir yönetim paneli.

Panel, Meta Graph API üzerinden reklam hiyerarşisini (hesap → kampanya → reklam seti → reklam) senkronize eder, günlük satış insight’larını analiz eder ve zayıf reklam setlerini kapatmanız için kural tabanlı uyarılar üretir. Arayüz Türkçedir.

## Ne işe yarar

Meta Business Suite içinde dağınık duran harcama, tıklama ve satış verisini operasyonel kararlara çevirir:

- Hangi kampanya ve reklam seti gerçekten satıyor?
- Hangi kreatif tekrar kullanılmalı, hangisi bütçeyi yakıyor?
- Satış gelmeyen reklam seti ne zaman kapatılmalı, ne zaman biraz daha süre verilmeli?
- Katalog ürünleri hangi setlerde tavan satışa ulaştı?

Amaç Ads Manager’ın yerini almak değil; günlük medya alımı kararlarını hızlandırmaktır.

## Kimler için

| Rol | Ne yapar |
| --- | --- |
| **Yönetici** | Meta köprüsü, kullanıcılar, bütçe kuralları, kreatif yükleme, kampanya yazma |
| **Analist** | Dashboard, raporlar, hesap ve kreatif incelemesi (yazma yok) |
| **Reklam veren** | Hesap / kampanya gezintisi, kampanya oluşturma-düzenleme, kreatif önerileri |

Giriş yapılmadan panel sayfalarına ve API’lere erişilemez. Oturum, HTTP-only JWT çerezi ile tutulur.

## Çalışma mantığı

Sistem dört katmanda akar.

```text
Meta Graph API
      │  OAuth + senkron + yazma
      ▼
MySQL (Prisma)
      │  skorlar, uyarılar, özetler
      ▼
Sunucu katmanı (src/lib + /api)
      │  JSON
      ▼
Panel (Next.js App Router)
```

1. **Bağlantı.** Ayarlar’da Meta uygulama kimliği ve gizli anahtarı kaydedilir. Yönetici Facebook ile OAuth başlatır (`ads_read`, `ads_management`, `business_management`). Access token ve uygulama sırrı AES-256-GCM ile şifrelenerek veritabanında durur.
2. **İçe aktarma.** Bağlantı sonrası reklam hesapları, kampanyalar, reklam setleri ve reklamlar yerel tabloya yazılır. Senkron, Meta’daki silinmiş kayıtları da temizler; yeni oluşturulan nesneler ise tam senkron çağrılmaz, yerel olarak upsert edilir.
3. **Satış analizi.** Kampanya ve reklam seti için son 90 güne kadar günlük insight çekilir (`purchases`, `purchase_value`, spend, click, impression). Bu seriden **satış olasılığı** (0–100) hesaplanır.
4. **Karar.** Bütçe koruma kuralları reklam setini `Kapat` / `Süre ver` / `Devam` diye etiketler. Dashboard ve raporlar aynı yerel veriyi okur; kreatif motoru satışları harcama payına göre görsel/videoya dağıtır.

Yeni kampanya, reklam seti veya reklam oluşturmak Ads Manager ile aynı hiyerarşiyi izler. Kayıtlar varsayılan olarak **PAUSED** doğar; yayına almak ayrı bir düzenleme adımıdır.

Hassas yazma işlemleri (oluştur, güncelle, pasife al, Meta ayarlarını kaydet) rol yetkisinin üstünde bir **onay şifresi** ister. Şifre yanlışsa API `403` ve şu metni döner: *Yetkiniz yok, bu işlemi yapamazsınız.*

---

## Modüller

### Dashboard (`/`)

Tarih aralığına göre:

- Harcama, satış adedi, satış tutarı, ROAS, CPA
- Günlük harcama çubuğu + satış çizgisi
- En iyi kampanyalar, reklam setleri, reklamlar, ürünler ve kreatifler
- Açık bütçe koruma uyarıları

Veri `GET /api/dashboard` üzerinden gelir; hesaplar karışık para birimindeyse panel bunu işaretler.

Üstte **Yapay zeka analisti** kartı, aynı dönem sayılarını ücretsiz Groq modeline gönderip kapat / ölçekle / kreatif aksiyonları üretir. Aynı kart kampanya içi **reklam setleri** ve set içi **reklamlar** sayfalarında da çalışır; görsel ve video kapaklarını `qwen/qwen3.6-27b` ile inceler. Anahtar yoksa kart sessizce yönlendirir; skor motorunun yerini almaz.

### Yapay zeka (ücretsiz)

Bütçe olmadığı için varsayılan sağlayıcı [Groq](https://console.groq.com/keys) ve model `openai/gpt-oss-120b`. Kart istemez. Eski Llama modelleri Ağustos 2026’da kapatıldığı için kota veya hata olursa `qwen/qwen3.6-27b` ve `openai/gpt-oss-20b` denenir.

Google Gemini de seçilebilir; 2026 ücretsiz kotası Flash modellerinde çok daha dardır (~20 istek/gün), bu yüzden önerilmez.

Anahtar Ayarlar’dan (şifreli veritabanı) veya `.env` ile verilir:

```env
GROQ_API_KEY=""
GEMINI_API_KEY=""
AI_PROVIDER="groq"
AI_MODEL=""
```

Modele yalnızca toplanmış KPI, kampanya/set adları ve uyarı özetleri gider. Meta token, şifre veya kullanıcı e-postası gitmez. Aynı tarih aralığı 20 dakika önbellekte tutulur.

### Reklam hesapları (`/accounts`)

OAuth sonrası gelen Meta reklam hesapları. Hesap → kampanya → reklam seti → reklam sayfalarına inilir. Her seviyede performans, satış grafikleri, ürün kırılımları ve (yetki varsa) oluştur / düzenle formları vardır.

### Kampanyalar (`/campaigns`)

Tüm hesaplardaki kampanyaları tek listede gezer. Tarih aralığı, durum ve arama ile süzülür. `CAMPAIGNS_MANAGE` yetkisi olan kullanıcı Ads Manager tarzı formlarla kampanya, reklam seti ve reklam açabilir.

### Raporlar (`/reports`)

Kampanya / reklam seti / ürün bazında harcama–satış karşılaştırması ve bütçe koruma teşhisi. Analist ve yönetici görür; reklam veren bu menüyü görmez.

### Kreatif öneriler (`/creatives`)

Yayındaki reklam kreatiflerini (görsel / video) parmak izine göre gruplar. Reklam seti satışları, setteki reklamların harcama payına göre kreatiflere dağıtılır. Skor 0–100:

| Aksiyon | Skor |
| --- | --- |
| Kullan | ≥ 55 |
| Test et | 35–54 |
| Kaçın | < 35 |

Yönetici henüz yayında olmayan görsel/video yükleyebilir (`public/uploads/creatives/`). Yüklenen dosya, aynı türdeki geçmiş kreatiflerin ortalamasıyla **tahmini** skor alır; güven düşüktür, öneri “küçük bütçeyle test”tir. Yükleme boyutu üst sınırı 24 MB; proxy gövde limiti 32 MB.

### Rakip analizi (`/competitors`)

Yönetici ve analist, rakip firma veya sattığınız ürünü takibe alır. Kaynak sitenin arama adresini (ör. `/arama?q=`) elle girebilirsiniz; sistem arama ifadesini o parametreye yazar. Sunucu sayfayı açamazsa Groq Compound aynı adresi ziyaret eder. Meta bağlıysa resmi [Reklam Kütüphanesi](https://developers.facebook.com/docs/graph-api/reference/ads_archive/) (`ads_archive`) Facebook / Instagram reklamlarını tarar. Ticari reklam arşivi AB/İngiltere teslimatında daha doludur. Gizli stok veya kapalı hesap fiyatı çekilmez.

### Kullanıcılar (`/users`)

Yalnız yönetici. Hesap açma, rol değiştirme, pasife alma.

### Ayarlar (`/settings`)

- **Meta köprüsü:** App ID, App Secret, Graph sürümü, OAuth redirect URI, bağlan / senkron / bağlantıyı kes.
- **Bütçe koruma:** Eşikler (maks. ürün satışı, maks. set harcaması, minimum tıklama/gösterim, CTR, ROAS, ilk kontrol ve kesin kapatma günleri).

Bağlantıyı kesmek Meta yetkisini iptal eder ve içe aktarılmış reklam / satış / uyarı verisini siler. Uygulama config’i, bütçe ayarları ve kullanıcılar kalır.

---

## Satış olasılığı nasıl hesaplanır

Kampanya ve reklam seti için günlük seriden türetilir (`src/lib/sales.ts`):

| Bileşen | Ağırlık | Anlamı |
| --- | --- | --- |
| İsabet oranı | 32% | Satış olan gün / aktif gün |
| Dönüşüm | 20% | Satış / tıklama (hedef %2) |
| Hacim | 16% | Toplam satış (10 satışta doygun) |
| Tutarlılık | 12% | Günlük satışların sapması |
| Yakınlık | 10% | Son 3 günde satış veya tıklama |
| ROAS | 10% | Satış tutarı / harcama (hedef 2x) |
| Trend | ± | Son 7 gün vs önceki 7 gün |

Sonuç 0–100 aralığına sıkıştırılır. Kampanyada öne çıkan ürünler skora küçük bir lift ekleyebilir. Skorlar `sales_scores` tablosunda tutulur; büyük değişimler snapshot’lanır.

Insight penceresi Meta tarafında en fazla **90 gün**dür. Yerel önbellek yaklaşık 10 dakika taze kabul edilir.

## Bütçe koruma

Reklam seti yaşını, harcamayı, tıklamayı, CTR’ı, satışı ve ROAS’ı ayarlardaki eşiklerle karşılaştırır (`src/lib/budget-guard.ts`).

| Tür | Ne zaman |
| --- | --- |
| İlgi yok | Yeterli gösterim/tıklama var, satış yok, CTR düşük |
| Fiyat pahalı | İlgi (CTR) var ama satış yok — fiyat/teklif şüphesi |
| Süre ver | Henüz `hardCloseDays` dolmadı; izlemeye devam |
| Ürün tavanı | Bir ürün `maxProductSales` eşiğini aştı |
| Zayıf getiri | Harcama var, ROAS `minRoasToKeep` altında |
| Satış durdu | İlk günlerde satış vardı, sonra kesildi |

Karar: **Kapat**, **Süre ver**, **Devam**. Uyarılar dashboard’da listelenir. Pasife alma Meta’ya `PAUSED` yazar ve açık uyarıları çözer; bunun için onay şifresi gerekir. Koruma kapalıysa (`enabled: false`) teşhis üretilmez.

Varsayılan eşikler (Ayarlar’dan değişir): ürün tavanı 30 satış, set harcama tavanı 5, min. 8 tıklama / 400 gösterim, CTR %1.5, ROAS 1, ilk kontrol 5. gün, kesin kapatma 7. gün.

## Onay şifresi

Rol yetkisi tek başına yetmez. Aşağıdaki işlemler ekstra şifre ister:

- Kampanya / reklam seti / reklam oluşturma ve güncelleme
- Reklam setini pasife alma
- Meta uygulama ayarlarını ve redirect URI’yi kaydetme

Doğrulama `src/lib/close-secret.ts` içindedir. `CLOSE_SECRET` doluysa düz metin karşılaştırılır; değilse `CLOSE_SECRET_HASH` (veya koddaki varsayılan bcrypt hash) kullanılır. Üretimde hash’i ortam değişkenine taşıyın.

## Roller ve izinler

| İzin | Yönetici | Analist | Reklam veren |
| --- | --- | --- | --- |
| Dashboard | ✓ | ✓ | ✓ |
| Hesaplar | ✓ | ✓ | ✓ |
| Kampanya görüntüleme | ✓ | ✓ | ✓ |
| Kampanya yönetme | ✓ | | ✓ |
| Raporlar | ✓ | ✓ | |
| Kreatif görüntüleme | ✓ | ✓ | ✓ |
| Kreatif yükleme | ✓ | | |
| Ayarlar | ✓ | | |
| Meta köprüsü | ✓ | | |
| Kullanıcı yönetimi | ✓ | | |

Sayfa koruması `requirePermission`, API koruması `requireApiPermission` ile yapılır. Oturumu olmayan istekler `/login`e yönlenir (`src/proxy.ts`). OAuth callback ve login API herkese açıktır.

---

## Teknoloji

- **Next.js 16** (App Router) + **React 19** + **Tailwind CSS 4**
- **MySQL** + **Prisma 6**
- **jose** (JWT oturum), **bcryptjs** (şifre), **zod** (istek doğrulama)
- Meta Graph API (varsayılan `v22.0`)

Gizli alanlar (`ENCRYPTION_KEY`, 32 byte / 64 hex) ile şifrelenir. Oturum imzası `SESSION_SECRET` ile doğrulanır.

## Kurulum

Gereksinimler: Node.js 20+, MySQL, npm.

```bash
git clone https://github.com/ihsanakyildiz/MetaAds.git
cd MetaAds
npm install
```

`.env.example` dosyasını `.env` olarak kopyalayın ve doldurun:

```env
DATABASE_URL="mysql://root:@localhost:3306/metaads"
SESSION_SECRET="64-karakter-hex"
ENCRYPTION_KEY="64-karakter-hex"
APP_URL="http://localhost:3003"
META_GRAPH_VERSION="v22.0"
CLOSE_SECRET=""
CLOSE_SECRET_HASH=""
GROQ_API_KEY=""
GEMINI_API_KEY=""
AI_PROVIDER="groq"
AI_MODEL=""
```

MySQL’de `metaads` veritabanını oluşturun, sonra:

```bash
npx prisma generate
npm run db:push
npm run db:seed
npm run dev
```

Uygulama **3003** portunda dinler. Tarayıcı: [http://localhost:3003](http://localhost:3003)

Canlıda Nginx / reverse proxy `https://metaads.ihsanakyildiz.com.tr` trafiğini `127.0.0.1:3003` adresine iletir. `APP_URL` o zaman `https://metaads.ihsanakyildiz.com.tr` olur (port yazılmaz); `npm start` yine 3003’te dinler.

Tohum kullanıcılar (`prisma/seed.ts`):

| E-posta | Şifre | Rol |
| --- | --- | --- |
| `admin@metaads.local` | `Admin123!` | Yönetici |
| `analist@metaads.local` | `Analist123!` | Analist |
| `reklam@metaads.local` | `Reklam123!` | Reklam veren |

Üretimde bu şifreleri değiştirin.

### Meta uygulaması

1. [Meta for Developers](https://developers.facebook.com/) üzerinde bir uygulama açın.
2. Facebook Login ve Marketing API ürünlerini ekleyin.
3. Valid OAuth Redirect URI olarak paneldeki değeri girin (varsayılan: `{APP_URL}/api/meta/oauth/callback`).
4. Ayarlar’a App ID ve App Secret’ı yazıp Facebook ile bağlanın.
5. Yerelde HTTPS callback gerekiyorsa ngrok kullanılabilir; `next.config.ts` ngrok origin’lerine izin verir.

`ENCRYPTION_KEY` değişirse daha önce şifrelenmiş token’lar okunamaz; Meta’yı yeniden bağlamanız gerekir.

`prisma generate` çalışırken `next dev` açıksa Windows’ta query engine kilitlenebilir (EPERM). Önce Next sürecini durdurun, generate edin, sonra tekrar `npm run dev`.

## Komutlar

| Komut | İş |
| --- | --- |
| `npm run dev` | Geliştirme sunucusu (`:3003`) |
| `npm run build` / `npm start` | Üretim derlemesi ve çalıştırma (`:3003`) |
| `npm run db:push` | Şemayı MySQL’e uygula |
| `npm run db:seed` | Örnek kullanıcıları yaz |
| `npm run db:studio` | Prisma Studio |
| `npm run lint` | ESLint |

## Canlıda PM2 (yalnızca 3003)

Bu dosya sadece `metaads` sürecini tanımlar; 3000 / 3001 / 3002 üzerindeki diğer uygulamalara dokunmaz.

```bash
cd /home/ihsanproje/web/metaads.ihsanakyildiz.com.tr/apps/MetaAds
npm run build
pm2 delete metaads
pm2 start ecosystem.config.cjs
pm2 save
```

Paylaşımlı hostingde `ihsanproje` çoğu zaman **sudoers’ta yoktur**. `pm2 startup` bu yüzden parola doğru olsa da reddedilir. Kalıcılık için systemd yerine kullanıcı crontab’ı yeterlidir; diğer projelerin portuna dokunmaz, `pm2 save` ile kayıtlı süreçleri (`alchatol`, `sastimim`, `metaads` vb.) geri yükler:

```bash
chmod +x scripts/pm2-resurrect.sh
pm2 save
(crontab -l 2>/dev/null | grep -v pm2-resurrect.sh; echo "@reboot /home/ihsanproje/web/metaads.ihsanakyildiz.com.tr/apps/MetaAds/scripts/pm2-resurrect.sh") | crontab -
crontab -l
```

Sunucu sahibinin root erişimi varsa alternatif: o hesabın `pm2 startup systemd -u ihsanproje --hp /home/ihsanproje` komutunu çalıştırması.

Yapmayın: `pm2 delete all`, `pm2 kill`, `pm2 restart all` (diğer siteleri de etkiler).

## Dizin yapısı

```text
prisma/                 şema ve seed
public/uploads/         kreatif yüklemeleri (.gitkeep hariç git dışıdır)
src/app/(auth)/         giriş
src/app/(panel)/        korumalı sayfalar
src/app/api/            REST uçları
src/components/         dashboard, kampanya, kreatif, rapor UI
src/lib/                iş kuralları (Meta, satış, bütçe, kreatif, yetki)
src/proxy.ts            oturum yönlendirmesi
```

Yazma yardımcıları `src/lib/meta-ads-write.ts` ve `src/lib/meta-mutate.ts` içindedir. Bütçe koruma, `meta.ts` üzerinden yazma fonksiyonu import etmez (döngüsel bağımlılık).

## Güvenlik

- `.env`, `node_modules`, `.next` ve yüklenen kreatifler git’e girmez.
- `.env.example` yalnızca yer tutucudur.
- Onay şifresinin düz metnini repoya koymayın; `CLOSE_SECRET` / `CLOSE_SECRET_HASH` kullanın.
- Meta token’ları ve App Secret veritabanında şifrelidir; yedekleri koruyun.
- Panel herkese açık bir GitHub deposundaysa tohum şifrelerini ve yerel secret’ları üretimde kullanmayın.
