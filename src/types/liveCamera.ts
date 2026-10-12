import type { CameraZone } from './camera';

/** Public settings never include the password or its encrypted representation. */
export interface LiveCameraSettings {
  name: string;
  host: string;
  port: number;
  username: string;
  streamPath: string;
  hasPassword: boolean;
  zones: CameraZone[];
}

export type LiveCameraSettingsInput = Omit<LiveCameraSettings, 'hasPassword'> & {
  /** Empty/omitted retains the saved password for the same camera and username. */
  password?: string;
};

export interface LiveCameraFrame {
  bytes: Uint8Array;
  /** Wall-clock milliseconds when this frame arrived from the camera. */
  at: number;
}

export interface LiveCameraStatus {
  state: 'idle' | 'connecting' | 'live' | 'offline' | 'error';
  message?: string;
}

export interface LiveCameraAPI {
  getSettings(): Promise<LiveCameraSettings | null>;
  saveSettings(input: LiveCameraSettingsInput): Promise<LiveCameraSettings>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): Promise<LiveCameraStatus>;
  onFrame(callback: (frame: LiveCameraFrame) => void): () => void;
  onStatus(callback: (status: LiveCameraStatus) => void): () => void;
}

export const CAMERA_IPC = {
  getSettings: 'camera:get-settings',
  saveSettings: 'camera:save-settings',
  connect: 'camera:connect',
  disconnect: 'camera:disconnect',
  getStatus: 'camera:get-status',
  frame: 'camera:frame',
  frameAck: 'camera:frame-ack',
  status: 'camera:status',
} as const;
