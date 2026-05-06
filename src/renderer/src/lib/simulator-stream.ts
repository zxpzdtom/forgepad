import { buildMjpegUrl } from './simulator-api';

// ── Stream Session ─────────────────────────────────────────────────────────

export type StreamStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

export type SimulatorStreamOptions = {
  /** serve-sim port for this device. */
  port: number;
  /** Canvas element to paint frames onto. */
  canvas: HTMLCanvasElement;
  /** Called when the canvas size changes (device resolution). */
  onSize?: (width: number, height: number) => void;
  /** Called every second with the current FPS. */
  onFps?: (fps: number) => void;
  /** Called when the stream status changes. */
  onStatus?: (status: StreamStatus) => void;
  /** Called for log messages. */
  onLog?: (msg: string, isError?: boolean) => void;
};

/**
 * Streams MJPEG frames from serve-sim's HTTP endpoint and paints them
 * onto a canvas element using requestAnimationFrame.
 *
 * The canvas approach (vs. raw <img>) enables:
 * - Screenshot extraction via getImageData
 * - Region select overlay compositing
 * - Future annotation/recording support
 */
export class SimulatorStreamSession {
  private opts: SimulatorStreamOptions;
  private img: HTMLImageElement | null = null;
  private alive = false;
  private frameCount = 0;
  private fpsTimer: ReturnType<typeof setInterval> | null = null;
  private rafId: number | null = null;
  private manualStop = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: SimulatorStreamOptions) {
    this.opts = opts;
  }

  /** Begin streaming MJPEG frames and painting to canvas. */
  start(): void {
    this.manualStop = false;
    this.connect();
  }

  /** Stop streaming and clean up. */
  stop(): void {
    this.manualStop = true;
    this.alive = false;
    this.cleanup();
    this.opts.onStatus?.('idle');
  }

  get isConnected(): boolean {
    return this.alive;
  }

  // ── Private ────────────────────────────────────────────────────────────

  private connect(): void {
    const { port, canvas, onSize, onFps, onLog, onStatus } = this.opts;
    const log = onLog ?? (() => {});

    onStatus?.('connecting');

    // Create an off-screen <img> element pointing to the MJPEG stream
    const img = new Image();
    img.crossOrigin = 'anonymous'; // serve-sim sets Access-Control-Allow-Origin: *
    this.img = img;

    const mjpegUrl = buildMjpegUrl(port);

    img.onload = () => {
      // This fires when the first frame loads
      if (!this.alive) {
        this.alive = true;
        onStatus?.('connected');
        log('MJPEG stream connected');
      }
    };

    img.onerror = () => {
      if (this.manualStop) return;
      log('MJPEG stream error', true);
      this.alive = false;
      onStatus?.('disconnected');
      this.scheduleReconnect();
    };

    // Add a cache-buster to prevent browser caching
    img.src = `${mjpegUrl}?t=${Date.now()}`;

    // Paint loop — continuously draw the <img> to the canvas
    const ctx = canvas.getContext('2d')!;

    const paint = () => {
      if (this.manualStop) return;

      if (this.img && this.img.complete && this.img.naturalWidth > 0) {
        const w = this.img.naturalWidth;
        const h = this.img.naturalHeight;

        // Update canvas size if device resolution changed
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          onSize?.(w, h);
        }

        ctx.drawImage(this.img, 0, 0);
        this.frameCount++;

        // Mark as connected once we get valid frames
        if (!this.alive) {
          this.alive = true;
          onStatus?.('connected');
        }
      }

      this.rafId = requestAnimationFrame(paint);
    };
    this.rafId = requestAnimationFrame(paint);

    // FPS counter
    this.fpsTimer = setInterval(() => {
      onFps?.(this.frameCount);
      this.frameCount = 0;
    }, 1000);
  }

  private scheduleReconnect(): void {
    if (this.manualStop) return;
    this.clearReconnect();

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.manualStop) {
        this.opts.onLog?.('Reconnecting MJPEG stream...');
        this.cleanup();
        this.connect();
      }
    }, 2000);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private cleanup(): void {
    this.clearReconnect();
    if (this.fpsTimer) {
      clearInterval(this.fpsTimer);
      this.fpsTimer = null;
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.img) {
      this.img.src = ''; // Stop fetching
      this.img = null;
    }
  }
}
