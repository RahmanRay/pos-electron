import { Cctv } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LiveCameraPage } from '@/components/camera/LiveCameraPage';
import { APP_CONFIG } from '@/config/app.config';
import { TEXT } from '@/text';
import { formatClock } from '@/utils/format';

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <time className="font-mono text-sm font-semibold text-fg-muted tabular-nums sm:text-base" dateTime={now.toISOString()}>
      {formatClock(now)}
    </time>
  );
}

export default function App() {
  const liveAvailable = Boolean(window.cameraAPI);
  return (
    <div className="flex h-full flex-col bg-bg bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgb(34_211_238/0.08),transparent)] text-fg">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 sm:px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-strong text-accent-fg shadow-[0_0_20px_rgb(34_211_238/0.35)]">
          <Cctv className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="truncate font-bold tracking-tight">
            {APP_CONFIG.name}
          </h1>
          <p className="hidden truncate text-xs text-fg-subtle sm:block">{TEXT.appSubtitle}</p>
        </div>
        <span className="hidden sm:contents"><Clock /></span>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
        {liveAvailable ? <LiveCameraPage /> : <div className="m-4 rounded-2xl border border-border bg-surface p-6 text-sm text-fg-muted" role="alert">{TEXT.electronRequired}</div>}
      </main>
    </div>
  );
}
