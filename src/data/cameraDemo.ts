import type { CameraSourceInfo, CameraZone, NormalizedPoint } from '@/types';

/*
 * Demo camera: a stock clip played from a local file as if it were a live
 * camera. No public restaurant camera whose owner allows reuse (and that
 * could be used without a network connection) was found, so the demo uses a
 * downloadable stock video. `node scripts/camera-demo.mjs` fetches the clip
 * and the detection model into public/demo/camera (not committed).
 */
export const CAMERA_DEMO_SOURCE: CameraSourceInfo = {
  title: 'Customers in a minimalist style restaurant',
  pageUrl: 'https://mixkit.co/free-stock-video/customers-in-a-minimalist-style-restaurant-4385/',
  author: 'Mixkit',
  license: 'Mixkit Stock Video Free License',
  timeLapse: true,
  videoPath: 'restaurant-4385-720.mp4',
};

/** Pixel rectangle on the 1280×720 source frame → normalized polygon. */
function rect(left: number, top: number, right: number, bottom: number): NormalizedPoint[] {
  const x0 = left / 1280;
  const x1 = right / 1280;
  const y0 = top / 720;
  const y1 = bottom / 720;
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

/**
 * Tables in the demo clip (traced on frames of the 1280×720 video). Each zone
 * covers the table, its chairs and the bench, where a seated person's body is.
 */
export const CAMERA_DEMO_ZONES: readonly CameraZone[] = [
  { id: 'zone-a', label: 'A', polygon: rect(660, 170, 900, 240) },
  { id: 'zone-b', label: 'B', polygon: rect(620, 240, 950, 372) },
  { id: 'zone-c', label: 'C', polygon: rect(620, 372, 1000, 492) },
  { id: 'zone-d', label: 'D', polygon: rect(590, 492, 1100, 720) },
  { id: 'zone-e', label: 'E', polygon: rect(40, 560, 300, 720) },
];
