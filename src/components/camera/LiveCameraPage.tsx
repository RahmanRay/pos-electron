import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Save, SquareDashedMousePointer, Unplug, X } from 'lucide-react';
import { useLiveCamera } from '@/hooks/useLiveCamera';
import { useCameraStore } from '@/store/cameraStore';
import { TEXT } from '@/text';
import type { CameraZone, NormalizedPoint } from '@/types';
import type { LiveCameraSettings, LiveCameraSettingsInput } from '@/types/liveCamera';
import { EventFeed } from './EventFeed';
import { LiveCameraStage } from './LiveCameraStage';
import { OccupancyGauge } from './OccupancyGauge';
import { TableGrid } from './TableGrid';
import { PANEL } from './visuals';

const DEFAULT_SETTINGS: LiveCameraSettings = {
  name: 'EZVIZ H6c', host: '192.168.72.104', port: 554,
  username: 'admin', streamPath: '/h264/ch1/main/av_stream', hasPassword: false, zones: [],
};
const INPUT = 'w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent';
const BUTTON = 'inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50';

function configure(settings: LiveCameraSettings) {
  useCameraStore.getState().configureLive(settings.zones, `${settings.host}:${settings.port}${settings.streamPath}`);
}

export function LiveCameraPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mounted = useRef(false);
  const { status, hasFrame } = useLiveCamera(canvasRef);
  const [saved, setSaved] = useState<LiveCameraSettings>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<LiveCameraSettingsInput>(DEFAULT_SETTINGS);
  const [password, setPassword] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [tableId, setTableId] = useState('1');
  const zones = useCameraStore((state) => state.zones);

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    const api = window.cameraAPI;
    if (!api) return;
    void api.getSettings().then((settings) => {
      if (disposed) return;
      const value = settings ?? DEFAULT_SETTINGS;
      setSaved(value);
      setDraft(value);
      configure(value);
      setReady(true);
    }).catch(() => {
      if (!disposed) setError(TEXT.cameraSettingsLoadError);
    });
    return () => { disposed = true; mounted.current = false; };
  }, []);

  const updateDraft = <K extends keyof LiveCameraSettingsInput>(key: K, value: LiveCameraSettingsInput[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice('');
  };

  const save = async (connect: boolean) => {
    const api = window.cameraAPI;
    if (!api || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const input: LiveCameraSettingsInput = {
        name: draft.name.trim(), host: draft.host.trim(), port: Number(draft.port),
        username: draft.username.trim(), streamPath: draft.streamPath.trim(), zones: saved.zones,
      };
      if (password) input.password = password;
      const settings = await api.saveSettings(input);
      if (!mounted.current) return;
      setSaved(settings);
      setDraft(settings);
      setPassword('');
      configure(settings);
      setNotice(TEXT.cameraSettingsSaved);
      if (connect) await api.connect();
    } catch {
      if (mounted.current) setError(TEXT.cameraActionError);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save(true);
  };

  const disconnect = async () => {
    try {
      await window.cameraAPI?.disconnect();
      if (mounted.current) setDrawing(false);
    } catch {
      if (mounted.current) setError(TEXT.cameraDisconnectError);
    }
  };

  const persistZones = async (nextZones: CameraZone[]) => {
    const api = window.cameraAPI;
    if (!api || busy) return;
    setBusy(true);
    setError('');
    try {
      const settings = await api.saveSettings({
        name: saved.name, host: saved.host, port: saved.port, username: saved.username,
        streamPath: saved.streamPath, zones: nextZones,
      });
      if (!mounted.current) return;
      setSaved(settings);
      setDraft((current) => ({ ...current, zones: settings.zones }));
      configure(settings);
      setNotice(TEXT.cameraZonesSaved);
    } catch {
      if (mounted.current) setError(TEXT.cameraZonesSaveError);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const addZone = (polygon: NormalizedPoint[]) => {
    const id = tableId.trim();
    if (!id || zones.some((zone) => zone.id === id)) {
      setError(TEXT.cameraDuplicateZone);
      return;
    }
    if (busy) return;
    setDrawing(false);
    void persistZones([...saved.zones, { id, label: id, polygon }]);
    const numericId = Number(id);
    if (Number.isInteger(numericId)) setTableId(String(numericId + 1));
  };

  return (
    <div className="grid gap-4 p-3 sm:p-4 lg:h-full lg:grid-cols-[minmax(0,1fr)_23rem] lg:overflow-hidden" data-testid="live-camera-page">
      <div className="flex min-h-0 min-w-0 flex-col gap-4 lg:overflow-y-auto lg:pe-1">
        <LiveCameraStage canvasRef={canvasRef} name={saved.name} status={status} hasFrame={hasFrame} drawingEnabled={drawing && !busy} onZoneDrawn={addZone} />
        <section className={`${PANEL} p-4`} aria-labelledby="live-zones-title">
          <h2 id="live-zones-title" className="text-sm font-semibold">{TEXT.zoneEditor}</h2>
          <p className="mt-1 text-sm text-fg-muted">{zones.length === 0 ? TEXT.noLiveZones : TEXT.zoneEditorHint}</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="w-32 text-xs text-fg-muted">{TEXT.tableId}
              <input className={`${INPUT} mt-1`} value={tableId} maxLength={32} onChange={(event) => setTableId(event.target.value)} placeholder={TEXT.tableIdPlaceholder} />
            </label>
            <button type="button" className={BUTTON} disabled={!ready || busy || !hasFrame || status.state !== 'live'} onClick={() => setDrawing(!drawing)} aria-pressed={drawing}>
              <SquareDashedMousePointer className="size-4" aria-hidden />{drawing ? TEXT.cancelDrawing : TEXT.drawZone}
            </button>
          </div>
          {drawing && <p className="mt-2 text-sm text-accent">{TEXT.drawingHint}</p>}
          {zones.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label={TEXT.savedZones}>
              {zones.map((zone) => (
                <li key={zone.id} className="flex items-center gap-2 rounded-lg bg-surface-2 ps-3 text-sm">
                  {TEXT.table(zone.label)}
                  <button type="button" className="rounded-lg p-2 text-fg-muted hover:text-danger disabled:opacity-50" disabled={busy} aria-label={TEXT.deleteZone(zone.label)} onClick={() => { void persistZones(saved.zones.filter((candidate) => candidate.id !== zone.id)); }}><X className="size-3.5" aria-hidden /></button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 border-t border-border pt-3 text-xs text-fg-subtle">{TEXT.liveTimingHint}</p>
        </section>
        {ready && <TableGrid />}
        {ready && <EventFeed />}
      </div>
      <aside className="flex min-h-0 flex-col gap-4 lg:overflow-y-auto lg:pe-1">
        <section className={`${PANEL} p-5`} aria-labelledby="camera-connection-title">
          <h2 id="camera-connection-title" className="font-semibold">{TEXT.cameraConnection}</h2>
          <p className="mt-1 text-xs text-fg-muted">{TEXT.cameraPortHint}</p>
          <form className="mt-4 space-y-3" onSubmit={submit} autoComplete="off">
            <label className="block text-xs text-fg-muted">{TEXT.cameraFields.name}
              <input className={`${INPUT} mt-1`} name="camera-name" value={draft.name} maxLength={80} required onChange={(event) => updateDraft('name', event.target.value)} />
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
              <label className="block text-xs text-fg-muted">{TEXT.cameraFields.host}
                <input className={`${INPUT} mt-1 font-mono`} name="camera-host" value={draft.host} required onChange={(event) => updateDraft('host', event.target.value)} placeholder={DEFAULT_SETTINGS.host} />
              </label>
              <label className="block text-xs text-fg-muted">{TEXT.cameraFields.port}
                <input className={`${INPUT} mt-1 font-mono`} name="camera-port" type="number" min={1} max={65535} value={draft.port} required onChange={(event) => updateDraft('port', Number(event.target.value))} />
              </label>
            </div>
            <label className="block text-xs text-fg-muted">{TEXT.cameraFields.username}
              <input className={`${INPUT} mt-1`} name="camera-username" value={draft.username} required maxLength={80} onChange={(event) => updateDraft('username', event.target.value)} />
            </label>
            <label className="block text-xs text-fg-muted">{TEXT.cameraFields.password}
              <input className={`${INPUT} mt-1`} name="camera-password" type="password" value={password} autoComplete="new-password" maxLength={256} onChange={(event) => setPassword(event.target.value)} placeholder={saved.hasPassword ? TEXT.cameraFields.savedPassword : TEXT.cameraFields.enterPassword} />
            </label>
            <p className="text-xs text-fg-subtle">{TEXT.cameraPasswordHint}</p>
            <label className="block text-xs text-fg-muted">{TEXT.cameraFields.streamPath}
              <input className={`${INPUT} mt-1 font-mono`} name="camera-stream-path" value={draft.streamPath} required onChange={(event) => updateDraft('streamPath', event.target.value)} />
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <button className={`${BUTTON} border-accent/40 bg-accent text-accent-fg hover:bg-accent-strong`} type="submit" disabled={!ready || busy}><Link className="size-4" aria-hidden />{busy ? TEXT.waiting : TEXT.cameraConnect}</button>
              <button className={BUTTON} type="button" disabled={!ready || busy} onClick={() => { void save(false); }}><Save className="size-4" aria-hidden />{TEXT.cameraSave}</button>
              <button className={BUTTON} type="button" disabled={status.state === 'idle' || busy} onClick={() => { void disconnect(); }}><Unplug className="size-4" aria-hidden />{TEXT.cameraDisconnect}</button>
            </div>
          </form>
          {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
          {notice && <p className="mt-3 text-xs text-accent" role="status">{notice}</p>}
          {status.message && <p className="mt-3 text-sm text-fg-muted" role="status">{status.message}</p>}
        </section>
        {ready && <OccupancyGauge />}
      </aside>
    </div>
  );
}
