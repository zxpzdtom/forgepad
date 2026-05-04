import { useCallback, useEffect, useRef, useState } from 'react';
import { SpriteAnimator } from 'codex-pets-react';
import type { PetSettings } from '@shared/types';
import { forgePetAtlas, getPetSpritesheetUrl, type ForgePetAnimationName } from './pet-registry';

/**
 * Standalone pet overlay for the transparent pet window.
 *
 * Architecture:
 *  - The Electron window is exactly the size of one sprite frame
 *  - SpriteAnimator renders the animation inside it (no PetWidget / position:fixed)
 *  - Dragging the sprite moves the Electron window itself via IPC
 *  - No fullscreen overlay, so nothing blocks interaction with other windows
 */
export function PetOverlay() {
  const [petSettings, setPetSettings] = useState<PetSettings | null>(null);
  const [animation, setAnimation] = useState<ForgePetAnimationName>('idle');
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Listen for settings changes from the main process
  useEffect(() => {
    const api = window.forgepadPet;
    if (!api) return;
    return api.onSettingsChanged((settings) => {
      setPetSettings(settings);
    });
  }, []);

  // Idle → waiting after 8s of no interaction
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();
  const resetIdleTimer = useCallback(() => {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      setAnimation('waiting');
    }, 8000);
  }, []);

  useEffect(() => {
    resetIdleTimer();
    return () => clearTimeout(idleTimer.current);
  }, [resetIdleTimer]);

  // Drag handling — moves the Electron window
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);

      // Get current window position on screen
      // screenX/screenY of the event minus clientX/clientY gives window origin
      const winX = e.screenX - e.clientX;
      const winY = e.screenY - e.clientY;
      dragOffset.current = {
        x: e.screenX - winX,
        y: e.screenY - winY,
      };

      setDragging(true);
      setAnimation('idle');
      resetIdleTimer();
    },
    [resetIdleTimer],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const newX = e.screenX - dragOffset.current.x;
      const newY = e.screenY - dragOffset.current.y;
      window.forgepadPet?.moveWindow(newX, newY);

      // Determine drag direction for animation
      const dx = e.movementX;
      if (dx > 2) setAnimation('running-right');
      else if (dx < -2) setAnimation('running-left');
    },
    [dragging],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      setDragging(false);
      setAnimation('idle');
      resetIdleTimer();
    },
    [dragging, resetIdleTimer],
  );

  if (!petSettings || !petSettings.enabled) return null;

  const src = getPetSpritesheetUrl(petSettings.selectedPetId);

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        cursor: dragging ? 'grabbing' : 'grab',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <SpriteAnimator<ForgePetAnimationName>
        src={src}
        atlas={forgePetAtlas}
        animation={animation}
        scale={petSettings.petSize}
        imageRendering="pixelated"
        ariaLabel="Desktop Pet"
      />
    </div>
  );
}
