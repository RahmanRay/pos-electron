import { ScanSearch, TriangleAlert, VideoOff } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { APP_CONFIG } from '@/config/app.config';
import { CAMERA_DEMO_SOURCE, CAMERA_DEMO_ZONES } from '@/data/cameraDemo';
import { cameraAssetUrl } from '@/services/cameraDetector';
import { useCameraStore } from '@/store/cameraStore';
import { TEXT } from '@/text';
import type { FeedStatus } from '@/types';
import { formatStopwatch } from '@/utils/format';
import { seatedSeconds } from '@/utils/occupancy';
import { FRAME_HEIGHT, FRAME_WIDTH, STATUS_STYLES } from './visuals';

export interface CameraStageProps {
  videoRef: Ref<HTMLVideoElement>;
}

const FEED_DOT: Record<FeedStatus, string> = {
  loading: 'bg-fg-subtle',
  live: 'bg-live animate-pulse',
  paused: 'bg-fg-muted',
  stalled: 'bg-danger animate-pulse',
  missing: 'bg-danger',
  error: 'bg-danger',
};

const GLASS = 'bg-black/55 backdrop-blur-md ring-1 ring-white/10';

function Chip({ children, className = GLASS }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold text-white sm:gap-2 sm:px-3 sm:py-1 sm:text-[0.8125rem] ${className}`}
    >
      {children}
    </span>
  );
}

/** Four L-shaped corner marks, like a camera viewfinder. */
function CornerMarks() {
  const mark = 'pointer-events-none absolute size-6 border-accent/70 sm:size-8';
  return (
    <>
      <span className={`${mark} start-3 top-3 border-s-2 border-t-2 rounded-ss-lg`} aria-hidden />
      <span className={`${mark} end-3 top-3 border-e-2 border-t-2 rounded-se-lg`} aria-hidden />
      <span className={`${mark} start-3 bottom-3 border-s-2 border-b-2 rounded-es-lg`} aria-hidden />
      <span className={`${mark} end-3 bottom-3 border-e-2 border-b-2 rounded-ee-lg`} aria-hidden />
    </>
  );
}

/** The simulated camera: video, table zones, detected people and the HUD. */
export function CameraStage({ videoRef }: CameraStageProps) {
  const feed = useCameraStore((state) => state.feed);
  const snapshot = useCameraStore((state) => state.snapshot);
  const detections = useCameraStore((state) => state.detections);
  const detector = useCameraStore((state) => state.detector);
  const simulatingStall = useCameraStore((state) => state.simulatingStall);

  return (
    // The frame keeps 16:9 inside whatever space the layout gives it.
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black @container-size lg:aspect-auto lg:min-h-0 lg:flex-1">
      <div className="absolute inset-0 m-auto aspect-video w-[min(100cqw,calc(100cqh*16/9))]">
        <video
          ref={videoRef}
          src={cameraAssetUrl(CAMERA_DEMO_SOURCE.videoPath)}
          className="absolute inset-0 size-full object-cover"
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          aria-label={TEXT.cameraName}
          data-testid="camera-video"
        />
        {/* Soft vignette so the HUD stays readable on bright frames. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgb(0_0_0/0.55))]" aria-hidden />

        <svg viewBox={`0 0 ${FRAME_WIDTH} ${FRAME_HEIGHT}`} className="absolute inset-0 size-full" aria-hidden>
          <defs>
            <filter id="zone-glow" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {detections.map((box, index) => (
            <rect
              key={index}
              x={box.x * FRAME_WIDTH}
              y={box.y * FRAME_HEIGHT}
              width={box.width * FRAME_WIDTH}
              height={box.height * FRAME_HEIGHT}
              rx={8}
              className="fill-none stroke-accent/70"
              strokeWidth={2}
              strokeDasharray="4 6"
            />
          ))}
          {CAMERA_DEMO_ZONES.map((zone) => {
            const state = snapshot.zones.find((candidate) => candidate.zoneId === zone.id);
            const status = state?.status ?? 'empty';
            const style = STATUS_STYLES[status];
            const points = zone.polygon.map((point) => `${point.x * FRAME_WIDTH},${point.y * FRAME_HEIGHT}`).join(' ');
            const first = zone.polygon[0] ?? { x: 0, y: 0 };
            const seconds = state ? seatedSeconds(state, snapshot.time) : null;
            const x = first.x * FRAME_WIDTH + 10;
            const y = first.y * FRAME_HEIGHT + 10;
            const width = seconds === null ? 34 : 104;
            return (
              <g key={zone.id}>
                <polygon points={points} className={style.fill} fillOpacity={status === 'empty' ? 0.03 : 0.12} />
                <polygon
                  points={points}
                  className={`fill-none ${style.stroke}`}
                  strokeOpacity={status === 'empty' ? 0.5 : 1}
                  strokeWidth={status === 'empty' ? 2 : 3}
                  strokeLinejoin="round"
                  strokeDasharray={state?.hidden ? '10 8' : undefined}
                  filter={status === 'empty' ? undefined : 'url(#zone-glow)'}
                />
                <rect x={x} y={y} width={width} height={34} rx={17} className="fill-black/70" />
                <circle cx={x + 17} cy={y + 17} r={13} className={style.fill} />
                <text x={x + 17} y={y + 23} textAnchor="middle" className="fill-black font-bold" fontSize={17}>
                  {zone.label}
                </text>
                {seconds !== null && (
                  <text x={x + 38} y={y + 23} className="fill-white font-mono font-semibold" fontSize={17}>
                    {formatStopwatch(seconds)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        <CornerMarks />

        {/* Top: always says DEMO and where the picture comes from. */}
        <div className="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between gap-2 sm:inset-x-7 sm:top-6">
          <div className="flex min-w-0 flex-wrap gap-1.5 sm:gap-2">
            <Chip className="bg-warning text-warning-fg shadow-lg">
              <span className="size-2 rounded-full bg-warning-fg" aria-hidden />
              {TEXT.demo}
            </Chip>
            <Chip>{TEXT.sourceBadge}</Chip>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <span className="hidden md:contents">
              <Chip>{TEXT.cameraName}</Chip>
            </span>
            <Chip>
              <span className={`size-2 rounded-full ${FEED_DOT[feed]}`} aria-hidden />
              <span data-testid="camera-feed" className="max-sm:sr-only">
                {TEXT.feed[feed]}
              </span>
            </Chip>
          </div>
        </div>

        {detector !== 'ready' && feed === 'live' && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center px-4">
            <Chip className={detector === 'error' ? 'bg-danger text-black' : GLASS}>
              <ScanSearch className={`size-4 ${detector === 'loading' ? 'animate-pulse' : ''}`} aria-hidden />
              {detector === 'error' ? TEXT.detectorError : TEXT.detectorLoading}
            </Chip>
          </div>
        )}

        {feed === 'stalled' && (
          <div className="absolute inset-0 grid place-items-center bg-black/45 p-4" role="alert">
            <div className={`max-w-sm rounded-2xl p-5 text-center ${GLASS}`}>
              <TriangleAlert className="mx-auto mb-2 size-8 text-warning" aria-hidden />
              <p className="font-bold text-white">{TEXT.stalledTitle}</p>
              <p className="mt-1 text-sm text-white/75">{TEXT.stalledHint(APP_CONFIG.camera.stallAfterMs / 1000)}</p>
              {simulatingStall && <p className="mt-2 text-xs font-semibold text-warning">{TEXT.stallTestRunning}</p>}
            </div>
          </div>
        )}
      </div>

      {(feed === 'missing' || feed === 'error') && (
        <div className="absolute inset-0 grid place-items-center bg-surface p-6 text-center">
          <div className="max-w-md space-y-2">
            <VideoOff className="mx-auto size-10 text-fg-subtle" aria-hidden />
            <p className="font-semibold">{TEXT.feed[feed]}</p>
            <p className="text-sm text-fg-muted">{TEXT.missingHint}</p>
          </div>
        </div>
      )}
    </div>
  );
}
