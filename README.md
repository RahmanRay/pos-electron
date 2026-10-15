# Restoran Kamera

Electron + React + TypeScript + TensorFlow.js ilə lokal RTSP kamera görüntüsünü və masa doluluğunu izləyən tətbiq. İnterfeys Azərbaycan dilindədir. Demo ekranı və stok video silinib; görüntü yalnız istifadəçinin real kamerasından alınır.

## İşə salmaq

Node.js 22.12+ və FFmpeg lazımdır. Bu Mac-də FFmpeg `/usr/local/bin/ffmpeg` yolundadır. Tətbiq macOS/Linux-da həmçinin `/opt/homebrew/bin/ffmpeg` və `/usr/bin/ffmpeg`, bütün platformalarda Electron `resources` qovluğundakı binary-ni axtarır. FFmpeg hazırda distributivə daxil edilməyib; Windows distributivinin `resources` qovluğuna `ffmpeg.exe` ayrıca yerləşdirilməlidir.

```bash
npm install
npm run setup-model  # bir dəfə: lokal insan aşkarlama modelini yükləyir
npm run dev          # Vite + Electron
npm run start        # build + Electron
npm run electron     # mövcud build-i açır
```

VS Code terminalında `ELECTRON_RUN_AS_NODE` dəyişənini silin: `env -u ELECTRON_RUN_AS_NODE npm run dev`. Brauzerdə açılan Vite səhifəsində Electron RTSP bridge-i yoxdur; kamera Electron daxilində işləyir. Model runtime-da internetə müraciət etmir.

## EZVIZ H6c bağlantısı

1. Kamera və Mac eyni lokal şəbəkədə olmalıdır. USB kabel enerji verir; şəbəkə bağlantısı Wi-Fi/Ethernet ilə qurulur.
2. EZVIZ telefon tətbiqində kameranı qurun və LAN Live View daxilində Local Service Settings / Local Server Settings bölməsində RTSP-ni aktiv edin. Menyu firmware-dən asılı ola bilər.
3. Kamera ekranında IP-ni yazın. Hazırkı kamera üçün başlanğıc ayarlar: `192.168.72.104`, RTSP portu `554`, istifadəçi `admin`, yol `/h264/ch1/main/av_stream`. `8000` SDK portudur; RTSP axını üçün ayrıca `554` istifadə edilir.
4. Maskalı şifrə sahəsinə kameranın lokal giriş şifrəsini daxil edin. Lokal şifrə dəyişdirilməyibsə cihazın doğrulama kodu istifadə oluna bilər. **Saxla və qoşul** düyməsinə basın. Şifrəni chat-a, README-yə və ya terminal əmrinə yazmayın.
5. Hazırkı kameranın tərs görüntüsünü düzəltmək üçün **Görüntünü 180° çevir** başlanğıcda aktivdir. Kameranın montaj istiqaməti dəyişərsə bu seçimi dəyişib **Saxla** düyməsinə basın; aktiv axın yenidən qoşulur. Masa zonaları görüntü ilə birlikdə çevrilir, insan aşkarlanması da düzəldilmiş kadrı alır.
6. Canlı görüntü gəldikdən sonra hər masa üçün unikal ID yazın, **Nöqtələrlə**, **Dairə / oval** və ya **Düzbucaqlı** seçib **Zona çək** düyməsinə basın. Nöqtəli seçimdə sərhəd boyunca klikləyin; ilk nöqtəyə klik və ya **Tamamla** / Enter seçimi bitirir. Dairəvi və düzbucaqlı seçimdə siçanı basılı saxlayıb sahəni çəkin. Saxlamazdan əvvəl nöqtələri sürüşdürüb düzəldə bilərsiniz. **Son nöqtəni sil** / Backspace geri qaytarır, Esc ləğv edir. Saxlanmış masanın qələm düyməsi onun nöqtələrini yenidən düzəldir. Zonalar çəkilməyənədək masa statusu hesablanmır. Kamera hərəkət edəndə zonaları yenidən uyğunlaşdırın; zona və ya istiqamət dəyişikliyi izləməni sıfırlayır.

Şifrə Electron main prosesində OS açar anbarı vasitəsilə şifrələnir; `live-camera.json` faylı `0600` icazəsi ilə userData qovluğunda saxlanır. Renderer saxlanmış şifrəni almır, yalnız onun mövcudluğunu görür. Boş şifrə sahəsi əvvəlki şifrəni saxlayır. Təhlükəsiz açar anbarı olmadıqda saxlanma rədd edilir. Tətbiq açılarkən avtomatik qoşulmur; **Saxla və qoşul** ilə qoşulmaq lazımdır.

## Kod yolu və davranış

- `LiveCameraPage` → `window.cameraAPI` → Electron main `liveCamera.ts` → FFmpeg RTSP/TCP → JPEG kadrları → preload IPC → `useLiveCamera` → canvas → lokal COCO-SSD insan aşkarlanması → `cameraStore` → masa statusu və taymer.
- Görüntü 25 FPS hədəfi ilə, maksimum 1280×720 ölçüdə göstərilir. İnsan aşkarlanması sabit kadrın həm hamısını, həm də hər masa sahəsinin ətrafı genişləndirilmiş hissəsini ayrıca yoxlayır. Modelin daxili 300×300 ölçüsündə uzaqdakı oturan adamların çox kiçik qalmasının qarşısı bu yolla alınır; nəticələr ilkin koordinatlara qaytarılıb təkrar qutular birləşdirilir. Hərəkət şərti yoxdur. Hər model girişinin eni maksimum 640 pikseldir; təhlil hədəfi saniyədə 3 dəfədir, faktiki tezlik masa sayından və Mac-in yükündən asılıdır. Görüntü aşkarlamanı gözləmir; yavaş renderer köhnə kadrları atır və növbəni böyütmür.
- İnsanların aşkarlanan bədən mərkəzi istifadəçinin çəkdiyi zonaya düşəndə həmin masa ID-si ilə əlaqələndirilir. Model oturma pozasını ayrıca təsnif etmir; yanından keçən və qısa örtülmə üçün zaman hədləri tətbiq edilir.
- Masa 1,5 saniyə ərzində kadrların ən azı 60%-də və cari kadrda insan görünəndə dolu sayılır. Gəliş zamanı 2 saniyəyədək aşkarlama itkisi başlanğıcı sıfırlamır. Dolu masa yalnız insan ən azı 6 saniyə və ardıcıl ən azı 3 təzə təhlildə görünməyəndə boşalır; qısa itkilərdə taymer davam edir və insanın görünmədiyi ayrıca bildirilir. Təzə insan aşkarlanması boşalma sübutunu sıfırlayır. Hədlər `src/config/app.config.ts` faylındadır.
- Taymer müşahidə olunan real saniyələri sayır. Kamera offline, aşkarlama xətası və tətbiq bağlı olduqda sayım dayanır. Saxlanmış müddət bərpa olunur; müşahidə edilməyən interval oturma vaxtına əlavə edilmir.
- Kamera ünvanı, axın yolu və zona geometriyasına uyğun status, taymer, son hadisələr və məhdud zaman xətti localStorage-da saxlanır. Şifrə bu tarixçəyə daxil edilmir. Yenidən açıldıqda son status **Təsdiqlənmir** kimi göstərilir və təzə aşkarlama ilə yenilənir.
- Bağlantı və kadr timeout-u, avtomatik təkrar qoşulma var. Səhv şifrə cavabında təkrar cəhd dayanır. Offline vəziyyətdə son görüntü saxlanır, masalar təsdiqlənməmiş göstərilir, taymerlər dondurulur.
- Renderer sandbox daxilindədir: Node/raw IPC çıxışı və uzaq şəbəkə sorğuları bloklanır. RTSP bağlantısı yalnız main prosesdə qurulur. Mikrofon və brauzer kamera icazələri rədd edilir.

## Yoxlama və məhdudiyyətlər

2026-10-15 tarixində masa sahələrinin ayrıca təhlili real kamerada yoxlanıb: iki oturan adam aşkarlanıb, hər iki masanın taymeri təxminən iki dəqiqə sıfırlanmadan davam edib, boş masa boş qalıb. Həmin müşahidədə təhlil müddəti 114–134 ms olub. Faktiki çıxıb-getmə bu canlı yoxlamada sınanmayıb; gecikmiş boşalma və təkrar aşkarlanma qaydaları avtomatik testlərlə yoxlanır.

2026-10-12 tarixində fiziki `CS-H6c-R105-1L2WF` kamerasının `192.168.72.104:554` RTSP axını Electron ekranında yoxlanıb: həqiqi görüntü, yenilənən kamera vaxtı və insan aşkarlama qutuları görünüb. Axın kəsiləndə real **Kamera offline** statusu və təkrar qoşulma mesajı da müşahidə edilib.

Həmin gün görüntünün ilkin 3 FPS məhdudiyyəti aradan qaldırıldıqdan sonra real kamerada 10 saniyəlik ölçmə aparılıb: 247 göstərilmiş kadr, orta 24,7 FPS, ən böyük kadr intervalı 97 ms və 0 uzun UI bloklanması. Bu nəticə Apple M4 / 16 GB Mac-də həmin sınaq intervalına aiddir; davamlı və bütün şəbəkələr üçün zəmanət deyil. İstifadəçinin saxladığı 2 və 3 ID-li zonaların statusları, taymerləri və tətbiq yenidən açıldıqda müddətlərin bərpası UI-də müşahidə edilib; aşkarlamanın dəqiqliyi ayrıca ölçülməyib.

İnsan aşkarlanması təxminidir: bucaq, işıq, örtülmə və yaxın masalar nəticəyə təsir edir. Oturma müddəti müstəqil sensorla ölçülmür. Model faylları və FFmpeg ayrıca hazır olmalıdır. Python/OpenCV worker yoxdur; aşkarlama TensorFlow.js ilə renderer-də işləyir. Model COCO-SSD MobileNet v2-dir (TensorFlow.js, Apache-2.0); fayllar `public/models/coco-ssd` daxilinə SHA-256 yoxlaması ilə yüklənir və git-ə əlavə edilmir.

```bash
npm run verify      # typecheck + lint + unit testlər + build
npm run dist:mac    # macOS distributivi
npm run dist:win    # Windows distributivi; FFmpeg ayrıca təmin edilməlidir
npm run dist:linux  # Linux distributivi
```
