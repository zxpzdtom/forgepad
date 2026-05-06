/**
 * serve-sim Binary WebSocket Protocol
 *
 * All messages: [type_byte][JSON_payload_utf8]
 *
 * Type bytes:
 *   0x03 = SingleTouch  { type: "begin"|"move"|"end", x: 0-1, y: 0-1, edge?: 0|1|2|3|4 }
 *   0x04 = Button       { button: "home"|"swipe_home"|"app_switcher"|"lock"|"siri"|"side_button" }
 *   0x05 = MultiTouch   { type: "begin"|"move"|"end", x1, y1, x2, y2 }
 *   0x06 = Key           { type: "down"|"up", usage: uint32 }
 *   0x07 = Orientation   { orientation: "portrait"|"landscape_left"|"landscape_right"|"portrait_upside_down" }
 */

import { buildInputWsUrl } from './simulator-api';

const MSG_TOUCH = 0x03;
const MSG_BUTTON = 0x04;
// const MSG_MULTI_TOUCH = 0x05;
// const MSG_KEY = 0x06;
const MSG_ORIENTATION = 0x07;

/** Edge constants matching IndigoHIDEdge. */
const EDGE_NONE = 0;
// const EDGE_LEFT = 1;
// const EDGE_TOP = 2;
const EDGE_BOTTOM = 3;
// const EDGE_RIGHT = 4;

/** Bottom 12% of the screen triggers bottom edge gesture (swipe-to-home). */
const BOTTOM_EDGE_THRESHOLD = 0.88;

// ── Helpers ───────────────────────────────────────────────────────────────

/** Encode a binary protocol message: [type_byte][JSON_utf8] */
function encodeBinaryMessage(typeByte: number, payload: Record<string, unknown>): ArrayBuffer {
  const json = JSON.stringify(payload);
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(json);
  const buf = new ArrayBuffer(1 + jsonBytes.byteLength);
  const view = new Uint8Array(buf);
  view[0] = typeByte;
  view.set(jsonBytes, 1);
  return buf;
}

/** Detect if a normalized y coordinate is near the bottom edge. */
function detectEdge(_x: number, y: number): number {
  if (y > BOTTOM_EDGE_THRESHOLD) return EDGE_BOTTOM;
  return EDGE_NONE;
}

// ── Input Handler ─────────────────────────────────────────────────────────

export type InputStatus = 'disconnected' | 'connecting' | 'connected';

/**
 * SimulatorInputHandler
 *
 * Connects a dedicated WebSocket to serve-sim's /ws endpoint and translates
 * mouse events on the canvas into the binary touch protocol.
 *
 * All coordinates are normalized 0–1 (serve-sim's native format).
 */
export class SimulatorInputHandler {
  private canvas: HTMLCanvasElement;
  private ws: WebSocket | null = null;
  private port: number;
  private alive = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private onStatusChange?: (status: InputStatus) => void;

  // Touch state
  private isPressed = false;
  private hasMoved = false;
  private pressStartX = 0;
  private pressStartY = 0;
  private pressStartTime = 0;

  private readonly MOVE_THRESHOLD = 5; // pixels on screen
  private readonly TAP_MAX_DURATION = 300; // ms

  // Bound handlers for cleanup
  private boundMouseDown: (e: MouseEvent) => void;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseUp: (e: MouseEvent) => void;
  private boundWheel: (e: WheelEvent) => void;
  private boundContextMenu: (e: Event) => void;

  constructor(canvas: HTMLCanvasElement, port: number, onStatusChange?: (status: InputStatus) => void) {
    this.canvas = canvas;
    this.port = port;
    this.onStatusChange = onStatusChange;

    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundMouseUp = this.handleMouseUp.bind(this);
    this.boundWheel = this.handleWheel.bind(this);
    this.boundContextMenu = (e: Event) => e.preventDefault();

    this.attachCanvasListeners();
    this.connectWebSocket();
  }

  /** Remove all listeners and close WebSocket. */
  dispose(): void {
    this.canvas.removeEventListener('mousedown', this.boundMouseDown);
    this.canvas.removeEventListener('wheel', this.boundWheel);
    this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
    window.removeEventListener('mousemove', this.boundMouseMove);
    window.removeEventListener('mouseup', this.boundMouseUp);

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.alive = false;
  }

  /** Send a button press (home, lock, etc.). */
  sendButton(button: string): void {
    this.sendBinary(MSG_BUTTON, { button });
  }

  /** Send an orientation change. */
  sendOrientation(orientation: string): void {
    this.sendBinary(MSG_ORIENTATION, { orientation });
  }

  get isConnected(): boolean {
    return this.alive;
  }

  // ── Private: WebSocket ────────────────────────────────────────────────

  private connectWebSocket(): void {
    this.onStatusChange?.('connecting');

    const wsUrl = buildInputWsUrl(this.port);
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      this.alive = true;
      this.onStatusChange?.('connected');
    };

    ws.onclose = () => {
      this.alive = false;
      this.onStatusChange?.('disconnected');
      this.ws = null;
      // Auto-reconnect after 1s
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (!this.alive && this.canvas.isConnected) {
          this.connectWebSocket();
        }
      }, 1000);
    };

    ws.onerror = () => {
      this.alive = false;
      this.onStatusChange?.('disconnected');
    };
  }

  private sendBinary(typeByte: number, payload: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(encodeBinaryMessage(typeByte, payload));
    }
  }

  // ── Private: Canvas Events ────────────────────────────────────────────

  private attachCanvasListeners(): void {
    this.canvas.addEventListener('mousedown', this.boundMouseDown);
    this.canvas.addEventListener('wheel', this.boundWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', this.boundContextMenu);
  }

  /** Get normalized 0–1 coordinates from a mouse event. */
  private getNormalized(e: MouseEvent): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }

  private handleMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return; // Left button only
    e.preventDefault();

    const coords = this.getNormalized(e);
    if (!coords) return;

    this.isPressed = true;
    this.pressStartX = coords.x;
    this.pressStartY = coords.y;
    this.pressStartTime = Date.now();
    this.hasMoved = false;

    // Send touch begin
    this.sendBinary(MSG_TOUCH, {
      type: 'begin',
      x: coords.x,
      y: coords.y,
      edge: detectEdge(coords.x, coords.y),
    });

    // Track movement and release globally
    window.addEventListener('mousemove', this.boundMouseMove);
    window.addEventListener('mouseup', this.boundMouseUp);
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.isPressed) return;
    e.preventDefault();

    const coords = this.getNormalized(e);
    if (!coords) return;

    // Check move threshold
    const rect = this.canvas.getBoundingClientRect();
    const dx = Math.abs(coords.x - this.pressStartX) * rect.width;
    const dy = Math.abs(coords.y - this.pressStartY) * rect.height;
    if (dx > this.MOVE_THRESHOLD || dy > this.MOVE_THRESHOLD) {
      this.hasMoved = true;
    }

    // Send touch move
    this.sendBinary(MSG_TOUCH, {
      type: 'move',
      x: coords.x,
      y: coords.y,
      edge: detectEdge(coords.x, coords.y),
    });
  }

  private handleMouseUp(e: MouseEvent): void {
    if (!this.isPressed) return;
    e.preventDefault();

    const coords = this.getNormalized(e);
    this.isPressed = false;

    // Remove global listeners
    window.removeEventListener('mousemove', this.boundMouseMove);
    window.removeEventListener('mouseup', this.boundMouseUp);

    if (!coords) return;

    // Send touch end
    this.sendBinary(MSG_TOUCH, {
      type: 'end',
      x: coords.x,
      y: coords.y,
      edge: detectEdge(coords.x, coords.y),
    });

    // serve-sim handles tap detection server-side from begin/end sequences.
    // No separate tap/swipe messages needed.
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();

    // serve-sim doesn't have a dedicated scroll message type.
    // Simulate scroll via a quick touch swipe sequence.
    const coords = this.getNormalized(e);
    if (!coords) return;

    const scrollAmount = 0.05; // normalized distance per scroll tick
    const dy = e.deltaY > 0 ? scrollAmount : -scrollAmount;

    // Quick swipe: begin → move → end
    this.sendBinary(MSG_TOUCH, { type: 'begin', x: coords.x, y: coords.y, edge: EDGE_NONE });

    setTimeout(() => {
      this.sendBinary(MSG_TOUCH, { type: 'move', x: coords.x, y: coords.y + dy * 0.5, edge: EDGE_NONE });
    }, 16);
    setTimeout(() => {
      this.sendBinary(MSG_TOUCH, { type: 'move', x: coords.x, y: coords.y + dy, edge: EDGE_NONE });
    }, 32);
    setTimeout(() => {
      this.sendBinary(MSG_TOUCH, { type: 'end', x: coords.x, y: coords.y + dy, edge: EDGE_NONE });
    }, 48);
  }
}
