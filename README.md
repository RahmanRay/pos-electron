# Restoran Kamera

Restoran masalarının doluluğunu kamera görüntüsündən izləyən **oflayn demo** tətbiq
(Electron + React + TypeScript + TensorFlow.js). İnterfeys Azərbaycan dilindədir, tünd "idarə otağı" dizaynı ilə.

> **Bu, real kamera deyil.** Lokal video faylı canlı kamera kimi oynadılır və ekranda həmişə
> "DEMO" və "Lokal video · time-lapse" yazılır.

## İşə salmaq

```bash
npm install
npm run camera-demo   # bir dəfə: demo videonu və aşkarlama modelini yükləyir (internet lazımdır)
npm run dev           # Vite + Electron; brauzerdə də açılır: http://localhost:5173
```

Node.js 22.12+ lazımdır. VS Code terminalında `ELECTRON_RUN_AS_NODE` dəyişənini silin
(`env -u ELECTRON_RUN_AS_NODE npm run dev`).

## Nə edir

- Video dövrə ilə oynayır. Mənbə time-lapse olduğu üçün **0,5× sürətə** yavaşladılıb
  (`APP_CONFIG.camera.playbackRate`).
- TensorFlow.js ilə hər 250 ms-də bir kadrda insanları tapır (COCO-SSD, MobileNet v2).
  Bu, lokal fayllardan, GPU-da işləyir.
- 5 masa zonası (A–E) videonun üstündə çəkilib. Göstərilənlər: doluluq faizi, hər masa üçün
  boş / gəlir / dolu, adam sayı, oturma taymeri, sessiya üzrə zaman xətti və hadisələr
  (doldu, boşaldı, yanından keçdi).
- **Yanından keçən adam:** masa yalnız 1,5 saniyə ərzində kadrların ən azı 60%-də adam görünəndə
  "dolu" sayılır. Daha tez gedən adam "yanından keçdi" kimi qeyd olunur.
- **Qısa örtülmə:** dolu masada 2 saniyəyə qədər adam görünməsə, masa dolu qalır və taymer davam edir
  ("hazırda görünmür").
- **Axının dayanması:** 2 saniyə yeni kadr gəlməsə, ekranda "Axın dayanıb" çıxır və masaların vəziyyəti
  dondurulur. "Axını dondur (test)" düyməsi bunu süni şəkildə yoxlayır.
- **Video yenidən başlayanda** yeni demo sessiyası açılır və bütün vəziyyət sıfırlanır.
- Heç nə saxlanılmır və şəbəkəyə göndərilmir. Kamera və mikrofon icazələri rədd edilir.

Hədlər `src/config/app.config.ts` faylındadır (`camera`), zonalar isə `src/data/cameraDemo.ts` faylındadır.

## Mənbə

Sahibinin icazə ilə açıq yayımladığı restoran kamerası tapılmadı, ona görə stok video istifadə olunur:

- Video: "Customers in a minimalist style restaurant" (Mixkit, Mixkit Stock Video Free License):
  https://mixkit.co/free-stock-video/customers-in-a-minimalist-style-restaurant-4385/
- Video **time-lapse**-dir: taymerlər real dəqiqə yox, video saniyəsi sayır.
- Model: COCO-SSD MobileNet v2 (TensorFlow.js, Apache-2.0).

Fayllar `public/demo/camera` qovluğuna yüklənir, SHA-256 ilə yoxlanır və git-ə əlavə olunmur.

## Məhdudiyyətlər

- Model yuxarıdan çəkilmiş insanların bir qismini qaçırır. Küncdəki bulanıq E masası çox vaxt
  aşkarlanmır.
- Zonalar düzbucaqlıdır və bu videoya görə əl ilə qoyulub. Başqa kamera üçün yenidən çəkilməlidir.
- Real canlı kamera (RTSP/IP) qoşulmayıb.

## Əmrlər

```bash
npm run verify     # typecheck + lint + unit testlər + build
npm run test:e2e   # build edir, sonra Playwright real Electron tətbiqini yoxlayır
npm run dist:win   # Windows quraşdırıcısı → release/<versiya>/
```
