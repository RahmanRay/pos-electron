// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CameraSettingsError, classifyCameraFailure, isPrivateCameraHost, makeRtspUrl, validateCameraSettings } from '../../electron/main/liveCameraValidation';
import { MjpegParser } from '../../electron/main/mjpegParser';
import { CameraFrameDispatcher } from '../../electron/frameDispatcher';

const settings = {
  name: 'Restoran', host: '192.168.72.104', port: 554, username: 'admin',
  streamPath: '/ch1/main', password: 'TEST_PASSWORD',
  zones: [{ id: 'table-1', label: 'Masa 1', polygon: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.5 }] }],
};

describe('camera boundary validation', () => {
  it('accepts only local camera addresses and valid ports/paths', () => {
    expect(validateCameraSettings(settings)).toEqual(settings);
    for (const host of ['example.com', '127.0.0.1', '8.8.8.8', '192.168.72.104:8000', '192.168.072.104', '192.168.72.255', 'rtsp://192.168.72.104']) {
      expect(isPrivateCameraHost(host)).toBe(false);
      expect(() => validateCameraSettings({ ...settings, host })).toThrow(CameraSettingsError);
    }
    for (const port of [0, 65536, NaN, 554.1, '554']) expect(() => validateCameraSettings({ ...settings, port })).toThrow(CameraSettingsError);
    for (const streamPath of ['/../file', '//example.com', '/live?password=test', 'rtsp://192.168.72.104']) {
      expect(() => validateCameraSettings({ ...settings, streamPath })).toThrow(CameraSettingsError);
    }
  });

  it('rejects ambiguous and out-of-frame zones', () => {
    const zone = settings.zones[0];
    expect(() => validateCameraSettings({ ...settings, zones: [zone, zone] })).toThrow(CameraSettingsError);
    expect(() => validateCameraSettings({ ...settings, zones: [{ ...zone, polygon: [{ x: 2, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }] }] })).toThrow(CameraSettingsError);
    expect(() => validateCameraSettings({ ...settings, zones: [{ ...zone, polygon: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 }] }] })).toThrow(CameraSettingsError);
  });

  it('does not place credentials or raw diagnostics into errors', () => {
    for (const diagnostic of ['Unauthorized 401 rtsp://admin:DO_NOT_EXPOSE@192.168.72.104', '404 secret=DO_NOT_EXPOSE', 'connect failed password=DO_NOT_EXPOSE']) {
      const message = classifyCameraFailure(diagnostic);
      expect(message).not.toContain('DO_NOT_EXPOSE');
      expect(message).not.toContain('rtsp://');
    }
    try {
      validateCameraSettings({ ...settings, host: 'DO_NOT_EXPOSE' });
    } catch (error) {
      expect((error as Error).message).not.toContain('DO_NOT_EXPOSE');
    }
  });

  it('escapes authentication characters when constructing the main-only URL', () => {
    expect(makeRtspUrl(settings, 'a:@/b')).toBe('rtsp://admin:a%3A%40%2Fb@192.168.72.104:554/ch1/main');
  });
});

describe('bounded JPEG parser', () => {
  it('handles markers split across chunks and multiple frames per chunk', () => {
    const frames: Buffer[] = [];
    const parser = new MjpegParser((frame) => frames.push(frame));
    parser.push(Buffer.from([1, 2, 0xff]));
    parser.push(Buffer.from([0xd8, 10, 0xff]));
    parser.push(Buffer.from([0xd9, 0xff, 0xd8, 20, 0xff, 0xd9]));
    expect(frames).toEqual([Buffer.from([0xff, 0xd8, 10, 0xff, 0xd9]), Buffer.from([0xff, 0xd8, 20, 0xff, 0xd9])]);
  });

  it('discards oversized/unfinished frames and recovers on the next valid frame', () => {
    const frames: Buffer[] = [];
    const parser = new MjpegParser((frame) => frames.push(frame), 10);
    parser.push(Buffer.from([0xff, 0xd8, 1, 1, 1, 1, 1, 1]));
    parser.push(Buffer.from([1, 1, 1, 1]));
    parser.push(Buffer.from([0xff, 0xd8, 2, 0xff, 0xd9]));
    expect(frames).toEqual([Buffer.from([0xff, 0xd8, 2, 0xff, 0xd9])]);
    parser.push(Buffer.alloc(11));
    parser.push(Buffer.from([0xff, 0xd8, 3, 0xff, 0xd9]));
    expect(frames).toHaveLength(2);
  });
});

describe('preload frame acknowledgement', () => {
  it('always acknowledges with zero subscribers and after unsubscription', () => {
    const acknowledgements: number[] = [];
    const received: number[] = [];
    const frames = new CameraFrameDispatcher((at) => acknowledgements.push(at));
    const frame = (at: number) => ({ bytes: new Uint8Array([1, 2]), at });
    frames.dispatch(frame(1));
    const unsubscribe = frames.subscribe((entry) => received.push(entry.at));
    frames.dispatch(frame(2));
    unsubscribe();
    frames.dispatch(frame(3));
    expect(acknowledgements).toEqual([1, 2, 3]);
    expect(received).toEqual([2]);
  });

  it('isolates callback failures and byte mutations while acknowledging once', () => {
    const acknowledgements: number[] = [];
    const received: number[] = [];
    const frames = new CameraFrameDispatcher((at) => acknowledgements.push(at));
    frames.subscribe((frame) => { frame.bytes[0] = 99; throw new Error('PRIVATE_CALLBACK_ERROR'); });
    frames.subscribe((frame) => received.push(frame.bytes[0]));
    expect(() => frames.dispatch({ bytes: new Uint8Array([1, 2]), at: 10 })).not.toThrow();
    expect(received).toEqual([1]);
    expect(acknowledgements).toEqual([10]);
  });
});
