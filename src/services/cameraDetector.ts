import type { GraphModel } from '@tensorflow/tfjs-converter';
import type * as TfCore from '@tensorflow/tfjs-core';
import { APP_CONFIG } from '@/config/app.config';
import type { CameraZone, PersonDetection } from '@/types';
import { detectionRegions, mapRegionDetection, mergePersonDetections } from '@/utils/personDetection';
import { detectionAnchor, pointInPolygon } from '@/utils/occupancy';

/*
 * Person detector for camera frames: COCO-SSD (MobileNet v2) run with
 * TensorFlow.js on the GPU (WebGL). The model files are local
 * (public/models/coco-ssd, fetched by scripts/setup-model.mjs), so nothing
 * is downloaded at runtime. TensorFlow.js is loaded only when the camera page
 * is opened.
 */

export interface PersonDetector {
  detect(source: HTMLCanvasElement, zones?: readonly CameraZone[]): Promise<PersonDetection[]>;
  dispose(): void;
}

/** COCO class index of "person" in the model's score output. */
const PERSON_CLASS = 0;

/** Asset URL relative to index.html (works for the dev server and the packaged file:// page). */
export function cameraAssetUrl(fileName: string): string {
  return `${APP_CONFIG.camera.assetDir}/${fileName}`;
}

/**
 * fetch() replacement for file:// pages, where Chromium's fetch() refuses the
 * file scheme but XMLHttpRequest can still read files next to index.html.
 */
function fileFetch(input: RequestInfo | URL): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input);
  if (!url.startsWith('file:') && window.location.protocol !== 'file:') return fetch(input);
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('GET', url);
    request.responseType = 'arraybuffer';
    request.onload = () => resolve(new Response(request.response as ArrayBuffer, { status: 200 }));
    request.onerror = () => reject(new Error(`Could not read ${url}`));
    request.send();
  });
}

/** Scores of the person class for every candidate box. */
function personScores(scores: ArrayLike<number>, boxCount: number, classCount: number): Float32Array {
  const result = new Float32Array(boxCount);
  for (let i = 0; i < boxCount; i++) result[i] = scores[i * classCount + PERSON_CLASS] ?? 0;
  return result;
}

export async function loadPersonDetector(): Promise<PersonDetector> {
  const [tf, converter] = await Promise.all([
    import('@tensorflow/tfjs-core') as Promise<typeof TfCore>,
    import('@tensorflow/tfjs-converter'),
    import('@tensorflow/tfjs-backend-webgl'),
    import('@tensorflow/tfjs-backend-cpu'),
  ]);
  if (!(await tf.setBackend('webgl'))) await tf.setBackend('cpu');
  await tf.ready();

  const modelUrl = new URL(cameraAssetUrl(APP_CONFIG.camera.modelPath), window.location.href).href;
  const model: GraphModel = await converter.loadGraphModel(modelUrl, { fetchFunc: fileFetch });
  const { maxDetections, minScore } = APP_CONFIG.camera;

  async function predict(source: HTMLCanvasElement): Promise<PersonDetection[]> {
    const width = source.width;
    const height = source.height;
    if (!width || !height) return [];

    const input = tf.tidy(() => tf.expandDims(tf.browser.fromPixels(source)));
    let output: TfCore.Tensor[] | undefined;
    let boxes2d: TfCore.Tensor2D | undefined;
    let keep: TfCore.Tensor1D | undefined;
    try {
      output = (await model.executeAsync(input)) as TfCore.Tensor[];
      const [scoreTensor, boxTensor] = output;
      if (!scoreTensor || !boxTensor) return [];
      const [, boxCount = 0, classCount = 0] = scoreTensor.shape;
      const [scores, boxes] = await Promise.all([scoreTensor.data(), boxTensor.data()]);
      const people = personScores(scores, boxCount, classCount);
      boxes2d = tf.tensor2d(boxes, [boxCount, 4]);
      keep = await tf.image.nonMaxSuppressionAsync(boxes2d, people, maxDetections, 0.5, minScore);
      const indexes = await keep.data();

      // Boxes are [top, left, bottom, right], already normalized to 0…1.
      return Array.from(indexes, (index) => {
        const top = boxes[index * 4] ?? 0;
        const left = boxes[index * 4 + 1] ?? 0;
        const bottom = boxes[index * 4 + 2] ?? 0;
        const right = boxes[index * 4 + 3] ?? 0;
        return { x: left, y: top, width: right - left, height: bottom - top, score: people[index] ?? 0 };
      });
    } finally {
      // Failed GPU reads/inferences must not leak tensors on every retry.
      input.dispose();
      if (output) tf.dispose(output);
      boxes2d?.dispose();
      keep?.dispose();
    }
  }

  const cropCanvas = document.createElement('canvas');
  const cropContext = cropCanvas.getContext('2d', { alpha: false });
  if (!cropContext) {
    model.dispose();
    throw new Error('Detection canvas unavailable');
  }

  const detect = async (source: HTMLCanvasElement, zones: readonly CameraZone[] = []): Promise<PersonDetection[]> => {
    if (!source.width || !source.height) return [];
    const people: PersonDetection[] = [];
    // SSD internally shrinks every input to 300×300. Separate table crops give
    // distant / partly occluded seated people enough pixels, even when still.
    // All crops read the same immutable snapshot; no movement test is involved.
    for (const region of detectionRegions(zones, source.width, source.height)) {
      const sourceWidth = region.width * source.width;
      const sourceHeight = region.height * source.height;
      const scale = Math.min(1, APP_CONFIG.camera.detectMaxWidth / sourceWidth);
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      if (cropCanvas.width !== width || cropCanvas.height !== height) {
        cropCanvas.width = width;
        cropCanvas.height = height;
      }
      cropContext.drawImage(source, region.x * source.width, region.y * source.height, sourceWidth, sourceHeight, 0, 0, width, height);
      const detections = await predict(cropCanvas);
      const zone = region.zoneId ? zones.find((candidate) => candidate.id === region.zoneId) : undefined;
      for (const detection of detections) {
        const mapped = mapRegionDetection(detection, region);
        // Padding may include a neighbour. It must not invent occupancy in this
        // crop's table or duplicate people from other table areas.
        if (!zone || pointInPolygon(detectionAnchor(mapped), zone.polygon)) people.push(mapped);
      }
    }
    return mergePersonDetections(people, maxDetections, zones);
  };

  return {
    detect,
    dispose: () => model.dispose(),
  };
}
