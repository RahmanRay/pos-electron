import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { CAMERA_IPC, type LiveCameraAPI, type LiveCameraFrame, type LiveCameraStatus } from '../src/types/liveCamera';
import { CameraFrameDispatcher } from './frameDispatcher';

const frames = new CameraFrameDispatcher((at) => ipcRenderer.send(CAMERA_IPC.frameAck, at));
// Registered before React starts: a reload or temporary zero subscribers can
// never strand a frame in the main-process queue.
ipcRenderer.on(CAMERA_IPC.frame, (_event: IpcRendererEvent, frame: LiveCameraFrame) => frames.dispatch(frame));

const api: LiveCameraAPI = {
  getSettings: () => ipcRenderer.invoke(CAMERA_IPC.getSettings),
  saveSettings: (input) => ipcRenderer.invoke(CAMERA_IPC.saveSettings, input),
  connect: () => ipcRenderer.invoke(CAMERA_IPC.connect),
  disconnect: () => ipcRenderer.invoke(CAMERA_IPC.disconnect),
  getStatus: () => ipcRenderer.invoke(CAMERA_IPC.getStatus),
  onFrame(callback) {
    return frames.subscribe(callback);
  },
  onStatus(callback) {
    const listener = (_event: IpcRendererEvent, status: LiveCameraStatus) => callback(status);
    ipcRenderer.on(CAMERA_IPC.status, listener);
    return () => ipcRenderer.removeListener(CAMERA_IPC.status, listener);
  },
};

contextBridge.exposeInMainWorld('cameraAPI', api);
