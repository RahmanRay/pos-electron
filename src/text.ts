import type { FeedStatus, OccupancyEventKind, ZoneStatus } from '@/types';

/* All UI text (Azerbaijani, the only UI language). */
export const TEXT = {
  appSubtitle: 'Masa doluluğu monitoru',
  demo: 'DEMO',
  cameraName: 'KAM-01 · Zal',
  sourceBadge: 'Lokal video · time-lapse',
  speed: (rate: string) => `Sürət ${rate}×`,
  session: (count: number) => `Sessiya #${count}`,
  people: (count: number) => `${count} nəfər`,
  table: (label: string) => `Masa ${label}`,
  seconds: (value: string) => `${value} san`,

  feed: {
    loading: 'Yüklənir',
    live: 'Canlı (simulyasiya)',
    paused: 'Pauza',
    stalled: 'Axın dayanıb',
    missing: 'Video tapılmadı',
    error: 'Video xətası',
  } satisfies Record<FeedStatus, string>,

  status: {
    empty: 'Boş',
    arriving: 'Gəlir',
    occupied: 'Dolu',
  } satisfies Record<ZoneStatus, string>,

  stalledTitle: 'Axın dayanıb',
  stalledHint: (seconds: number) =>
    `${seconds} saniyədən çoxdur yeni kadr yoxdur. Masalar son kadrda dondurulub və axın bərpa olunana qədər etibarlı deyil.`,
  missingHint: 'Demo videonu və modeli yükləmək üçün bir dəfə "npm run camera-demo" işlədin (internet lazımdır).',

  detectorLoading: 'İnsan aşkarlanması yüklənir…',
  detectorError: 'İnsan aşkarlanması işləmir: masalar yenilənmir.',
  stallTestRunning: 'Test: axının dayanması simulyasiya olunur',

  pause: 'Pauza',
  resume: 'Davam et',
  freezeTest: 'Axını dondur (test)',
  endFreezeTest: 'Testi bitir',
  restart: 'Sessiyanı sıfırla',

  occupancy: 'Doluluq',
  occupiedOf: (occupied: number, total: number) => `${occupied}/${total} masa dolu`,
  peopleInFrame: 'Kadrda',
  inference: 'Aşkarlama',
  tables: 'Masalar',
  seated: 'Oturur',
  hidden: 'Görünmür: qısa örtülmə?',
  timeline: 'Zaman xətti',
  timelineHint: 'Bu sessiyada hər masanın vəziyyəti (video vaxtı)',
  events: 'Hadisələr',
  noEvents: 'Bu sessiyada hələ hadisə yoxdur.',
  event: (kind: OccupancyEventKind, label: string, duration: string) =>
    ({
      seated: `Masa ${label} doldu`,
      left: `Masa ${label} boşaldı · ${duration} oturdu`,
      passedBy: `Masa ${label} yanından keçən · ${duration}`,
    })[kind],

  source: 'Mənbə',
  sourceWhy: 'Sahibinin icazə ilə açıq yayımladığı restoran kamerası tapılmadı, ona görə lisenziyalı stok video istifadə olunur.',
  notes: [
    'Video time-lapse-dir və yavaşladılıb: taymerlər real dəqiqə yox, video saniyəsi sayır.',
    'Video yenidən başlayanda yeni sessiya açılır və hər şey sıfırlanır.',
    'Heç nə saxlanılmır və göndərilmir: hər şey bu kompüterdə işləyir.',
  ],

  errorTitle: 'Nəsə səhv getdi',
  reload: 'Yenilə',
};
