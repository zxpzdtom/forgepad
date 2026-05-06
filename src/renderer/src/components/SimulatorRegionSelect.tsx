import { useCallback, useEffect, useRef, useState } from 'react';

type Region = { x: number; y: number; w: number; h: number };

type SimulatorRegionSelectProps = {
  /** The simulator canvas to capture regions from */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Called when the user finishes selecting a region */
  onRegionSelected: (screenshot: string, region: Region) => void;
  /** Called when the user cancels (ESC or right-click) */
  onCancel: () => void;
  /** i18n helper */
  t: (key: string) => string;
};

/**
 * Transparent overlay rendered on top of the simulator canvas.
 * User draws a rectangle by clicking and dragging to select a region.
 * On release the region is extracted from the canvas as a PNG screenshot.
 */
export function SimulatorRegionSelect({ canvasRef, onRegionSelected, onCancel, t }: SimulatorRegionSelectProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);

  // ── Region extraction ───────────────────────────────────────────────

  const extractRegion = useCallback(
    (region: Region) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Map overlay-relative pixel coords to canvas-pixel coords
      const overlay = overlayRef.current;
      if (!overlay) return;

      const overlayRect = overlay.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();

      // Scale from overlay coords to canvas internal pixels
      const scaleX = canvas.width / canvasRect.width;
      const scaleY = canvas.height / canvasRect.height;

      const cx = (region.x - (canvasRect.left - overlayRect.left)) * scaleX;
      const cy = (region.y - (canvasRect.top - overlayRect.top)) * scaleY;
      const cw = Math.max(1, region.w * scaleX);
      const ch = Math.max(1, region.h * scaleY);

      // Clamp to canvas bounds
      const sx = Math.max(0, Math.min(canvas.width - 1, Math.round(cx)));
      const sy = Math.max(0, Math.min(canvas.height - 1, Math.round(cy)));
      const sw = Math.min(Math.round(cw), canvas.width - sx);
      const sh = Math.min(Math.round(ch), canvas.height - sy);

      if (sw <= 0 || sh <= 0) return;

      // Extract the region to a temporary canvas
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = sw;
      tmpCanvas.height = sh;
      const tmpCtx = tmpCanvas.getContext('2d');
      if (!tmpCtx) return;

      const imageData = ctx.getImageData(sx, sy, sw, sh);
      tmpCtx.putImageData(imageData, 0, 0);

      const dataUrl = tmpCanvas.toDataURL('image/png');
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');

      onRegionSelected(base64, { x: sx, y: sy, w: sw, h: sh });
    },
    [canvasRef, onRegionSelected],
  );

  // ── Mouse handlers ──────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) {
        onCancel();
        return;
      }
      e.preventDefault();
      e.stopPropagation();

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      setStart({ x, y });
      setCurrent({ x, y });
      setIsDragging(true);
    },
    [onCancel],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging || !start) return;
      e.preventDefault();

      const rect = e.currentTarget.getBoundingClientRect();
      setCurrent({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    [isDragging, start],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging || !start) return;
      e.preventDefault();

      const rect = e.currentTarget.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;

      setIsDragging(false);

      const dx = Math.abs(endX - start.x);
      const dy = Math.abs(endY - start.y);

      if (dx < 5 && dy < 5) {
        // Point click — crop a 200x200 region around the click point
        const size = 200;
        const regionX = Math.max(0, start.x - size / 2);
        const regionY = Math.max(0, start.y - size / 2);
        extractRegion({ x: regionX, y: regionY, w: size, h: size });
      } else {
        // Dragged a region
        const regionX = Math.min(start.x, endX);
        const regionY = Math.min(start.y, endY);
        extractRegion({ x: regionX, y: regionY, w: dx, h: dy });
      }

      setStart(null);
      setCurrent(null);
    },
    [isDragging, start, extractRegion],
  );

  // ── ESC key to cancel ───────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  // ── Highlight rectangle ─────────────────────────────────────────────

  const highlightStyle: React.CSSProperties | undefined =
    start && current
      ? {
          position: 'absolute',
          left: Math.min(start.x, current.x),
          top: Math.min(start.y, current.y),
          width: Math.abs(current.x - start.x),
          height: Math.abs(current.y - start.y),
          border: '2px solid #2563eb',
          background: 'rgba(37, 99, 235, 0.08)',
          pointerEvents: 'none' as const,
          boxSizing: 'border-box' as const,
        }
      : undefined;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-20"
      style={{ cursor: 'crosshair' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Hint text */}
      <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
        <div className="rounded-full bg-panel/90 px-4 py-1.5 font-medium text-text text-xs shadow-md backdrop-blur">
          {t('simulator.inspectHint')}
        </div>
      </div>

      {/* Selection highlight */}
      {highlightStyle && <div style={highlightStyle} />}
    </div>
  );
}
