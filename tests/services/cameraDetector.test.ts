import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPersonDetector, type PersonDetector } from '@/services/cameraDetector';
import type { CameraZone } from '@/types';

const mocks = vi.hoisted(() => ({
  executeAsync: vi.fn(),
  modelDispose: vi.fn(),
  fromPixels: vi.fn(),
  expandDims: vi.fn(),
  tensor2d: vi.fn(),
  nonMaxSuppressionAsync: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('@tensorflow/tfjs-converter', () => ({
  loadGraphModel: vi.fn(async () => ({ executeAsync: mocks.executeAsync, dispose: mocks.modelDispose })),
}));
vi.mock('@tensorflow/tfjs-core', () => ({
  setBackend: vi.fn(async () => true),
  ready: vi.fn(async () => undefined),
  tidy: <T>(callback: () => T): T => callback(),
  browser: { fromPixels: mocks.fromPixels },
  expandDims: mocks.expandDims,
  tensor2d: mocks.tensor2d,
  image: { nonMaxSuppressionAsync: mocks.nonMaxSuppressionAsync },
  dispose: mocks.dispose,
}));
vi.mock('@tensorflow/tfjs-backend-webgl', () => ({}));
vi.mock('@tensorflow/tfjs-backend-cpu', () => ({}));

interface TestTensor {
  shape: number[];
  data: ReturnType<typeof vi.fn<() => Promise<Float32Array>>>;
  dispose: ReturnType<typeof vi.fn<() => void>>;
}

const tensors: TestTensor[] = [];
let detector: PersonDetector | undefined;
let source: HTMLCanvasElement;
const drawImage = vi.fn();
const rearTable: CameraZone = {
  id: 'rear', label: '3',
  polygon: [{ x: 0.4, y: 0.3 }, { x: 0.6, y: 0.3 }, { x: 0.6, y: 0.5 }, { x: 0.4, y: 0.5 }],
};

function tensor(values: number[] = [], shape: number[] = []): TestTensor {
  const value = { shape, data: vi.fn(async () => Float32Array.from(values)), dispose: vi.fn<() => void>() };
  tensors.push(value);
  return value;
}

/** The model supplies normalized [top, left, bottom, right] boxes. */
function prediction(box?: readonly number[], score = 0.9): TestTensor[] {
  return [tensor(box ? [score] : [], [1, box ? 1 : 0, 1]), tensor(box ? [...box] : [], [1, box ? 1 : 0, 4])];
}

beforeEach(() => {
  vi.clearAllMocks();
  tensors.length = 0;
  detector = undefined;
  source = document.createElement('canvas');
  source.width = 1000;
  source.height = 1000;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation((() => ({ drawImage })) as unknown as HTMLCanvasElement['getContext']);
  mocks.executeAsync.mockReset();
  mocks.fromPixels.mockImplementation(() => tensor());
  mocks.expandDims.mockImplementation((input: TestTensor) => input);
  mocks.tensor2d.mockImplementation((values: Float32Array, shape: number[]) => tensor(Array.from(values), shape));
  mocks.dispose.mockImplementation((values: TestTensor[]) => values.forEach((value) => value.dispose()));
  mocks.nonMaxSuppressionAsync.mockReset().mockImplementation(async (
    _boxes: TestTensor, scores: Float32Array, _limit: number, _overlap: number, minimum: number,
  ) => tensor(Array.from(scores.keys()).filter((index) => scores[index]! >= minimum)));
});

afterEach(() => { detector?.dispose(); });

describe('camera person detection', () => {
  it('recovers a still seated person from the table crop and maps it into the original frame', async () => {
    // The full frame misses the small person; the larger table view sees them.
    for (let frame = 0; frame < 2; frame++) {
      mocks.executeAsync.mockResolvedValueOnce(prediction()).mockResolvedValueOnce(prediction([0.2, 0.25, 0.8, 0.75]));
    }
    detector = await loadPersonDetector();

    const first = await detector.detect(source, [rearTable]);
    const still = await detector.detect(source, [rearTable]);

    expect(first).toHaveLength(1);
    expect(first[0]?.x).toBeCloseTo(0.435);
    expect(first[0]?.y).toBeCloseTo(0.322);
    expect(first[0]?.width).toBeCloseTo(0.13);
    expect(first[0]?.height).toBeCloseTo(0.156);
    expect(still).toEqual(first);
    expect(mocks.executeAsync).toHaveBeenCalledTimes(4);
    // Every pass reads the same source snapshot, including the unchanged frame.
    expect(drawImage).toHaveBeenCalledTimes(4);
    expect(drawImage.mock.calls.every(([image]) => image === source)).toBe(true);
    expect(tensors.every((value) => value.dispose.mock.calls.length === 1)).toBe(true);
  });

  it('counts a person found in both the full frame and table crop only once', async () => {
    mocks.executeAsync
      .mockResolvedValueOnce(prediction([0.322, 0.435, 0.478, 0.565], 0.7))
      .mockResolvedValueOnce(prediction([0.2, 0.25, 0.8, 0.75], 0.9));
    detector = await loadPersonDetector();

    const people = await detector.detect(source, [rearTable]);

    expect(people).toHaveLength(1);
    expect(people[0]?.score).toBeCloseTo(0.9);
  });

  it('rejects a neighbouring person seen only in the padding around a table', async () => {
    mocks.executeAsync
      .mockResolvedValueOnce(prediction())
      // Center maps left of the table polygon, although still inside its crop.
      .mockResolvedValueOnce(prediction([0.2, 0, 0.8, 0.1]));
    detector = await loadPersonDetector();

    expect(await detector.detect(source, [rearTable])).toEqual([]);
  });

  it.each(['inference', 'tensor read', 'suppression'] as const)('disposes allocated tensors after a failed %s', async (stage) => {
    const failure = new Error('GPU unavailable');
    if (stage === 'inference') {
      mocks.executeAsync.mockRejectedValueOnce(failure);
    } else {
      const output = prediction([0.2, 0.25, 0.8, 0.75]);
      mocks.executeAsync.mockResolvedValueOnce(output);
      if (stage === 'tensor read') output[0]!.data.mockRejectedValueOnce(failure);
      else mocks.nonMaxSuppressionAsync.mockRejectedValueOnce(failure);
    }
    detector = await loadPersonDetector();

    await expect(detector.detect(source)).rejects.toBe(failure);

    expect(tensors.length).toBeGreaterThan(0);
    for (const value of tensors) expect(value.dispose).toHaveBeenCalledTimes(1);
  });
});
