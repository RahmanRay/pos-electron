import { useRef } from 'react';
import { useCameraDemo } from '@/hooks/useCameraDemo';
import { CameraStage } from './CameraStage';
import { EventFeed } from './EventFeed';
import { OccupancyGauge } from './OccupancyGauge';
import { SourceCard } from './SourceCard';
import { TableGrid } from './TableGrid';
import { Timeline } from './Timeline';

/**
 * Camera occupancy demo. From `lg` up everything fits one screen: the camera
 * fills the left column, the panels scroll on the right.
 */
export function CameraPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { togglePause, toggleStallSimulation, restart } = useCameraDemo(videoRef);

  return (
    <div className="grid gap-4 p-3 sm:p-4 lg:h-full lg:grid-cols-[minmax(0,1fr)_23rem] lg:overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-col gap-4">
        <CameraStage videoRef={videoRef} />
        <Timeline onTogglePause={togglePause} onToggleFreeze={toggleStallSimulation} onRestart={restart} />
      </div>
      <aside className="flex min-h-0 flex-col gap-4 lg:overflow-y-auto lg:pe-1">
        <OccupancyGauge />
        <TableGrid />
        <EventFeed />
        <SourceCard />
      </aside>
    </div>
  );
}
