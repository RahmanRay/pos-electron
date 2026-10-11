import { Film } from 'lucide-react';
import { CAMERA_DEMO_SOURCE } from '@/data/cameraDemo';
import { TEXT } from '@/text';
import { PANEL } from './visuals';

/** Where the demo picture comes from, and what the demo does not do. */
export function SourceCard() {
  const source = CAMERA_DEMO_SOURCE;
  return (
    <section className={`${PANEL} p-5`} aria-labelledby="source-title" data-testid="camera-source">
      <h2 id="source-title" className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg-muted">
        <Film className="size-4" aria-hidden />
        {TEXT.source}
      </h2>
      <p className="font-semibold">{source.title}</p>
      <p className="text-sm text-fg-muted">
        {source.author} · {source.license}
      </p>
      {/* Shown as text: the app never opens remote pages. */}
      <p className="mt-1 font-mono text-xs break-all text-accent select-text">{source.pageUrl}</p>
      <p className="mt-3 text-xs text-fg-subtle">{TEXT.sourceWhy}</p>
      <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs text-fg-muted">
        {TEXT.notes.map((note) => (
          <li key={note} className="flex gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-fg-subtle" aria-hidden />
            {note}
          </li>
        ))}
      </ul>
    </section>
  );
}
