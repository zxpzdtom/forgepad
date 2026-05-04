import { useCallback, useMemo } from 'react';
import {
  PetWidget as CodexPetWidget,
  usePetController,
  usePetDragGestureAnimations,
  type PetAction,
  type PetDragGestureAnimationMap,
} from 'codex-pets-react';
import { useAppStore } from '@renderer/store/app-store';
import { forgePetAtlas, getPetSpritesheetUrl, type ForgePetAnimationName } from './pet-registry';

/**
 * Renders the desktop pet overlay using codex-pets-react.
 * Reads pet settings from the Zustand store to decide which pet,
 * size, and whether it's enabled.
 */
export function PetWidget() {
  const petSettings = useAppStore((s) => s.settings.pets);

  const { pet, petDispatch } = usePetController<ForgePetAnimationName>({
    initialState: {
      animation: { name: 'idle', mode: 'loop' },
      pin: 'bottom-right',
      position: { x: 200, y: 200 },
    },
    defaultAnimation: 'idle',
    waitingAnimation: 'waiting',
    waitingAfterMs: 8000,
  });

  const dragGestureAnimations = useMemo(
    () =>
      ({
        left: 'running-left',
        right: 'running-right',
        up: 'jumping',
        down: 'waving',
      }) satisfies PetDragGestureAnimationMap<ForgePetAnimationName>,
    [],
  );

  const commitAction = useCallback(
    (action: PetAction<ForgePetAnimationName>) => {
      petDispatch(action);
    },
    [petDispatch],
  );

  const observeDragGesture = usePetDragGestureAnimations<ForgePetAnimationName>({
    enabled: true,
    animations: dragGestureAnimations,
    restAnimation: 'idle',
    restDelayMs: 140,
    minimumDistance: 16,
    axisBias: 1.12,
    onGestureAction: commitAction,
  });

  const dispatchAction = useCallback(
    (action: PetAction<ForgePetAnimationName>) => {
      commitAction(action);
      observeDragGesture(action);
    },
    [commitAction, observeDragGesture],
  );

  if (!petSettings.enabled) return null;

  const src = getPetSpritesheetUrl(petSettings.selectedPetId);

  return (
    <CodexPetWidget
      src={src}
      atlas={forgePetAtlas}
      animation={pet.animation}
      position={pet.position}
      pin={pet.pin}
      draggable
      scale={petSettings.petSize}
      boundsPadding={{ top: 40, right: 8, bottom: 8, left: 8 }}
      zIndex={50}
      imageRendering="pixelated"
      ariaLabel="Desktop Pet"
      onAction={dispatchAction}
    />
  );
}
