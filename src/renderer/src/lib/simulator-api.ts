import type { SimulatorDevice } from '@shared/types';

// ── Preload API accessor ──────────────────────────────────────────────────

type SimulatorApi = {
  checkXcode: () => Promise<{ available: boolean; message?: string }>;
  listDevices: () => Promise<SimulatorDevice[]>;
  bootDevice: (udid: string) => Promise<void>;
  shutdownDevice: (udid: string) => Promise<void>;
  startStream: (udid: string) => Promise<{ port: number }>;
  stopStream: (udid: string) => Promise<void>;
  getActiveStreams: () => Promise<Array<{ udid: string; port: number }>>;
  proxyFetch: (url: string, method?: string, body?: string) => Promise<{ status: number; statusText: string; body: string }>;
};

function getApi(): SimulatorApi {
  const api = (window as unknown as { forgepad?: { simulator?: SimulatorApi } }).forgepad?.simulator;
  if (!api) throw new Error('Simulator API not available');
  return api;
}

// ── Device Management (via IPC → simctl) ──────────────────────────────────

/** Check if Xcode is available. */
export async function checkXcode(): Promise<{ available: boolean; message?: string }> {
  return getApi().checkXcode();
}

/** Fetch the list of simulator devices via simctl (main process). */
export async function fetchDevices(): Promise<SimulatorDevice[]> {
  return getApi().listDevices();
}

/** Boot a simulator device via simctl. */
export async function bootDevice(udid: string): Promise<void> {
  return getApi().bootDevice(udid);
}

/** Shutdown a simulator device via simctl. */
export async function shutdownDevice(udid: string): Promise<void> {
  return getApi().shutdownDevice(udid);
}

// ── Stream Management (serve-sim per-device) ──────────────────────────────

/** Start serve-sim for a device, returns the port. */
export async function startDeviceStream(udid: string): Promise<{ port: number }> {
  return getApi().startStream(udid);
}

/** Stop serve-sim for a device. */
export async function stopDeviceStream(udid: string): Promise<void> {
  return getApi().stopStream(udid);
}

// ── URL Builders ──────────────────────────────────────────────────────────

/** Build the MJPEG stream URL for an <img> tag. */
export function buildMjpegUrl(port: number): string {
  return `http://127.0.0.1:${port}/stream.mjpeg`;
}

/** Build the WebSocket URL for touch input. */
export function buildInputWsUrl(port: number): string {
  return `ws://127.0.0.1:${port}/ws`;
}

/** Build the config URL. */
export function buildConfigUrl(port: number): string {
  return `http://127.0.0.1:${port}/config`;
}

/** Build the health check URL. */
export function buildHealthUrl(port: number): string {
  return `http://127.0.0.1:${port}/health`;
}
