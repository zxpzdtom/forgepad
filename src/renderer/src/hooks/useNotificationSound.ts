import { useCallback, useRef } from 'react';
import { BUILTIN_SOUNDS } from '@renderer/lib/builtin-sounds';
import { useAppStore } from '@renderer/store/app-store';

/**
 * Hook that provides a `play(soundId?)` function for notification sounds.
 * - Respects `settings.notifications.enabled` and `volume`
 * - Only one sound plays at a time (stops any currently-playing source)
 * - Uses a shared AudioContext (lazily created) to avoid browser limits
 */
export function useNotificationSound() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const stopCurrentRef = useRef<(() => void) | null>(null);

  const getCtx = useCallback((): AudioContext | null => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      try {
        audioCtxRef.current = new AudioContext();
      } catch {
        return null;
      }
    }
    return audioCtxRef.current;
  }, []);

  const stopCurrent = useCallback(() => {
    stopCurrentRef.current?.();
    stopCurrentRef.current = null;
  }, []);

  /**
   * Play a notification sound.
   * @param soundId  Override the sound to play (defaults to the selected sound in settings).
   */
  const play = useCallback(
    (soundId?: string) => {
      const settings = useAppStore.getState().settings.notifications;

      if (!settings.enabled) return;
      if (settings.volume === 0) return;

      stopCurrent();

      const id = soundId ?? settings.selectedSoundId;
      const volume = settings.volume / 100;

      // Try built-in first
      const builtin = BUILTIN_SOUNDS.find((s) => s.id === id);
      if (builtin) {
        const ctx = getCtx();
        if (!ctx) return;

        // Resume suspended context (browser policy requires user gesture first time)
        const doPlay = () => {
          let cancelled = false;
          stopCurrentRef.current = () => {
            cancelled = true;
          };
          if (!cancelled) {
            builtin.play(ctx, volume);
          }
        };

        if (ctx.state === 'suspended') {
          ctx
            .resume()
            .then(doPlay)
            .catch(() => {});
        } else {
          doPlay();
        }
        return;
      }

      // Try custom sound through the native file scheme.
      const custom = settings.customSounds.find((s) => s.id === id);
      if (custom?.assetPath && window.forgepad.fs.absFileUrl) {
        window.forgepad.fs.absFileUrl(custom.assetPath).then((url) => {
          const audio = new Audio(url);
          audio.volume = volume;
          const playPromise = audio.play();
          stopCurrentRef.current = () => {
            audio.pause();
            audio.currentTime = 0;
          };
          if (playPromise) {
            playPromise.catch(() => {
              // Autoplay blocked; ignore silently
            });
          }
        }).catch(() => {
          // Ignore audio errors
        });
        return;
      }

      // Fallback to first built-in if nothing found
      const fallback = BUILTIN_SOUNDS[0];
      if (fallback) {
        const ctx = getCtx();
        if (ctx) {
          const doPlay = () => fallback.play(ctx, volume);
          if (ctx.state === 'suspended') {
            ctx
              .resume()
              .then(doPlay)
              .catch(() => {});
          } else {
            doPlay();
          }
        }
      }
    },
    [getCtx, stopCurrent],
  );

  return { play, stopCurrent };
}
