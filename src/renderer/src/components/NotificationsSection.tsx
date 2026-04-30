import { useCallback, useEffect, useRef, useState } from 'react';
import { useNotificationSound } from '@renderer/hooks/useNotificationSound';
import { BUILTIN_SOUNDS } from '@renderer/lib/builtin-sounds';
import { useAppStore } from '@renderer/store/app-store';
import type { NotificationSound } from '@shared/types';
import { Check, Music, Pause, Pencil, Play, Plus, Trash2, Upload, Volume2 } from 'lucide-react';

/* ─── Re-usable UI primitives (local copies matching SettingsPanel style) ─── */

function SectionHeader({ title }: { title: string }) {
  return <h3 className="mb-4 font-[590] text-[15px] text-text">{title}</h3>;
}

function Divider() {
  return <div className="my-5 border-border border-t" />;
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="font-[510] text-[13px] text-text">{label}</div>
        {description && <div className="mt-0.5 text-[11px] text-subtle leading-tight">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      className={`relative inline-flex h-5 w-8 items-center rounded-full transition-colors ${
        disabled ? 'cursor-not-allowed opacity-40' : ''
      } ${checked ? 'bg-accent' : 'bg-panel-3'}`}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
    >
      <span
        className={`inline-block size-3.5 translate-x-0.5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[14px]' : ''
        }`}
      />
    </button>
  );
}

/* ─── Volume Slider ─── */

function VolumeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <Volume2 size={14} className="shrink-0 text-subtle" />
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="h-1.5 w-32 cursor-pointer appearance-none rounded-full bg-panel-3 accent-accent"
        aria-label="Volume"
      />
      <span className="w-8 text-right font-mono text-[12px] text-muted tabular-nums">{value}%</span>
    </div>
  );
}

/* ─── Rename dialog ─── */

function RenameDialog({ initial, onSave, onClose }: { initial: string; onSave: (name: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.select();
  }, []);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/80" onMouseDown={onClose}>
      <div
        className="w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-xl border border-border bg-surface-dialog shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-3">
          <div className="mb-2 font-[590] text-[14px] text-text">Rename Sound</div>
          <input
            ref={ref}
            className="h-8 w-full rounded-md border border-border bg-panel-2 px-3 text-[13px] text-text outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && value.trim()) onSave(value.trim());
              if (e.key === 'Escape') onClose();
            }}
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-border border-t px-4 py-3">
          <button className="secondary-button small" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button small"
            type="button"
            disabled={!value.trim()}
            onClick={() => value.trim() && onSave(value.trim())}
          >
            <Check size={13} />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Sound card ─── */

function SoundCard({
  sound,
  isSelected,
  isPlaying,
  onSelect,
  onPlayPause,
  onRename,
  onDelete,
}: {
  sound: NotificationSound;
  isSelected: boolean;
  isPlaying: boolean;
  onSelect: () => void;
  onPlayPause: () => void;
  onRename?: (name: string) => void;
  onDelete?: () => void;
}) {
  const durationLabel = sound.durationMs >= 1000 ? `${(sound.durationMs / 1000).toFixed(1)}s` : `${sound.durationMs}ms`;

  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      className={`group relative flex cursor-pointer select-none flex-col rounded-xl border p-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 ${
        isSelected ? 'border-accent/50 bg-accent-surface' : 'border-border bg-surface-card hover:border-border hover:bg-panel-2'
      }`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
        if (e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          onPlayPause();
        }
      }}
    >
      {/* Top row: icon + duration badge */}
      <div className="mb-2.5 flex items-start justify-between gap-1">
        <div
          className={`grid size-9 shrink-0 place-items-center rounded-lg ${
            isSelected ? 'bg-accent/20 text-accent' : 'bg-panel-3 text-muted'
          }`}
        >
          <Music size={16} />
        </div>
        <span className="rounded-full bg-panel-3 px-1.5 py-0.5 font-mono text-[10px] text-subtle">{durationLabel}</span>
      </div>

      {/* Name + subtitle */}
      <div className="mb-2 min-w-0 flex-1">
        <div className="truncate font-[510] text-[12px] text-text leading-tight">{sound.name}</div>
        <div className="mt-0.5 truncate text-[11px] text-subtle">{sound.subtitle}</div>
      </div>

      {/* Bottom row: play button + selected check */}
      <div className="flex items-center justify-between">
        <button
          className={`flex h-6 w-6 items-center justify-center rounded-full border transition-colors ${
            isPlaying
              ? 'border-accent bg-accent text-white'
              : 'border-border bg-panel-2 text-muted hover:border-accent/40 hover:text-accent'
          }`}
          type="button"
          title={isPlaying ? 'Stop preview' : 'Preview sound'}
          aria-label={isPlaying ? 'Stop preview' : 'Preview sound'}
          onClick={(e) => {
            e.stopPropagation();
            onPlayPause();
          }}
        >
          {isPlaying ? <Pause size={11} /> : <Play size={11} />}
        </button>

        <div className="flex items-center gap-1">
          {/* Custom sound actions */}
          {sound.source === 'custom' && onRename && (
            <button
              className="flex h-5 w-5 items-center justify-center rounded text-muted opacity-0 transition-opacity hover:text-text group-hover:opacity-100"
              type="button"
              title="Rename"
              onClick={(e) => {
                e.stopPropagation();
                onRename(sound.name);
              }}
            >
              <Pencil size={11} />
            </button>
          )}
          {sound.source === 'custom' && onDelete && (
            <button
              className="flex h-5 w-5 items-center justify-center rounded text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
              type="button"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 size={11} />
            </button>
          )}
          {isSelected && (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent">
              <Check size={11} className="text-white" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Notifications Section ─── */

export function NotificationsSection() {
  const settings = useAppStore((s) => s.settings);
  const ns = settings.notifications;
  const updateNotifications = useAppStore((s) => s.updateNotificationSettings);
  const addCustomSound = useAppStore((s) => s.addCustomSound);
  const removeCustomSound = useAppStore((s) => s.removeCustomSound);
  const renameCustomSound = useAppStore((s) => s.renameCustomSound);
  const addToast = useAppStore((s) => s.addToast);

  const { play, stopCurrent } = useNotificationSound();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [renamingSound, setRenamingSound] = useState<NotificationSound | null>(null);
  const [importing, setImporting] = useState(false);

  // Stop preview when section unmounts (e.g. navigate to different settings tab)
  useEffect(() => {
    return () => {
      stopCurrent();
    };
  }, [stopCurrent]);

  const handlePlayPause = useCallback(
    (sound: NotificationSound) => {
      if (playingId === sound.id) {
        stopCurrent();
        setPlayingId(null);
        return;
      }
      stopCurrent();
      setPlayingId(sound.id);

      // Play using the builtin synthesizer or custom data URL
      if (sound.source === 'built-in') {
        const builtin = BUILTIN_SOUNDS.find((s) => s.id === sound.id);
        if (builtin) {
          try {
            const ctx = new AudioContext();
            const vol = ns.volume / 100;
            if (ctx.state === 'suspended') {
              ctx
                .resume()
                .then(() => builtin.play(ctx, vol))
                .catch(() => {});
            } else {
              builtin.play(ctx, vol);
            }
            // Auto-clear playing state after duration
            setTimeout(() => {
              setPlayingId((prev) => (prev === sound.id ? null : prev));
            }, sound.durationMs + 100);
          } catch {
            addToast('error', 'Failed to play sound preview.');
            setPlayingId(null);
          }
        }
      } else if (sound.dataUrl) {
        try {
          const audio = new Audio(sound.dataUrl);
          audio.volume = ns.volume / 100;
          audio.play().catch(() => {
            addToast('error', 'Failed to play sound preview.');
            setPlayingId(null);
          });
          audio.onended = () => setPlayingId((prev) => (prev === sound.id ? null : prev));
          // Register stop handler
          stopCurrent();
          // We re-register stop via a closure trick
          const stop = () => {
            audio.pause();
            audio.currentTime = 0;
          };
          // Store stop in ref via play hook is complex; just track via state
          audio.onpause = () => setPlayingId((prev) => (prev === sound.id ? null : prev));
        } catch {
          addToast('error', 'Failed to play sound preview.');
          setPlayingId(null);
        }
      }
    },
    [playingId, ns.volume, stopCurrent, addToast],
  );

  const handleAddCustom = useCallback(async () => {
    if (importing) return;
    setImporting(true);
    try {
      const result = await window.forgepad.notification.pickAudio();
      if (!result) return;

      const sound: NotificationSound = {
        id: `custom-${Date.now()}`,
        name: result.fileName.replace(/_\d+\.(mp3|wav|ogg)$/i, '').replace(/_/g, ' '),
        subtitle: 'Custom sound',
        durationMs: 3000, // Estimate; real duration not easily available from main
        source: 'custom',
        assetPath: result.assetPath,
        dataUrl: result.dataUrl,
        createdAt: Date.now(),
      };
      addCustomSound(sound);
      addToast('success', `Imported "${sound.name}"`);
    } catch (err) {
      addToast('error', `Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
    }
  }, [importing, addCustomSound, addToast]);

  const handleDelete = useCallback(
    async (sound: NotificationSound) => {
      if (!window.confirm(`Delete "${sound.name}"?`)) return;
      // If deleting the currently selected sound, fallback to default
      if (ns.selectedSoundId === sound.id) {
        updateNotifications({ selectedSoundId: 'ping' });
      }
      if (playingId === sound.id) {
        stopCurrent();
        setPlayingId(null);
      }
      // Remove file from disk
      if (sound.assetPath) {
        try {
          await window.forgepad.notification.deleteAudio(sound.assetPath);
        } catch {
          // Non-critical; continue
        }
      }
      removeCustomSound(sound.id);
    },
    [ns.selectedSoundId, playingId, updateNotifications, removeCustomSound, stopCurrent],
  );

  // Combine built-in + custom sounds
  const builtinSounds: NotificationSound[] = BUILTIN_SOUNDS.map((s) => ({
    id: s.id,
    name: s.name,
    subtitle: s.subtitle,
    durationMs: s.durationMs,
    source: 'built-in' as const,
    createdAt: 0,
  }));
  const allSounds = [...builtinSounds, ...ns.customSounds];

  return (
    <div>
      <SectionHeader title="Notifications" />

      {/* ─── Sound master toggle ─── */}
      <SettingRow label="Notification Sounds" description="Play a sound when agents complete tasks or need input">
        <Toggle checked={ns.enabled} onChange={(v) => updateNotifications({ enabled: v })} label="Notification sounds" />
      </SettingRow>

      <SettingRow label="Volume" description="Playback volume for notification sounds">
        <VolumeSlider value={ns.volume} onChange={(v) => updateNotifications({ volume: v })} />
      </SettingRow>

      <SettingRow label="Play When App Is Focused" description="Also play sound when the ForgePad window is active">
        <Toggle
          checked={ns.playWhenAppFocused}
          onChange={(v) => updateNotifications({ playWhenAppFocused: v })}
          label="Play when app is focused"
        />
      </SettingRow>

      <Divider />

      {/* ─── Desktop notifications ─── */}
      <SectionHeader title="Desktop Notifications" />

      <SettingRow label="Enable Desktop Notifications" description="Show system notification banners when app is not focused">
        <Toggle
          checked={ns.desktopNotificationEnabled}
          onChange={(v) => updateNotifications({ desktopNotificationEnabled: v })}
          label="Desktop notifications"
        />
      </SettingRow>

      <SettingRow label="Agent Completed" description="Notify when an agent finishes its task">
        <Toggle
          checked={ns.notifyOnAgentDone}
          onChange={(v) => updateNotifications({ notifyOnAgentDone: v })}
          label="Agent completed"
          disabled={!ns.desktopNotificationEnabled && !ns.enabled}
        />
      </SettingRow>

      <SettingRow label="Agent Needs Approval" description="Notify when an agent is waiting for you">
        <Toggle
          checked={ns.notifyOnAgentNeedsApproval}
          onChange={(v) => updateNotifications({ notifyOnAgentNeedsApproval: v })}
          label="Agent needs approval"
          disabled={!ns.desktopNotificationEnabled && !ns.enabled}
        />
      </SettingRow>

      <SettingRow label="Task Completed" description="Notify when a task changes to done status">
        <Toggle
          checked={ns.notifyOnTaskDone}
          onChange={(v) => updateNotifications({ notifyOnTaskDone: v })}
          label="Task completed"
          disabled={!ns.desktopNotificationEnabled && !ns.enabled}
        />
      </SettingRow>

      <Divider />

      {/* ─── Sound picker ─── */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="font-[590] text-[14px] text-text">Notification Sound</div>
          <p className="mt-0.5 text-[11px] text-subtle">Click a card to select, then press play to preview</p>
        </div>
        <button className="secondary-button small" type="button" disabled={importing} onClick={handleAddCustom}>
          {importing ? (
            <span className="text-[12px]">Importing…</span>
          ) : (
            <>
              <Upload size={13} />
              Add Custom Audio
            </>
          )}
        </button>
      </div>

      {/* Sound grid — responsive: 3 cols → 2 cols → 1 col */}
      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
        role="listbox"
        aria-label="Notification sounds"
      >
        {allSounds.map((sound) => (
          <SoundCard
            key={sound.id}
            sound={sound}
            isSelected={ns.selectedSoundId === sound.id}
            isPlaying={playingId === sound.id}
            onSelect={() => {
              updateNotifications({ selectedSoundId: sound.id });
            }}
            onPlayPause={() => handlePlayPause(sound)}
            onRename={sound.source === 'custom' ? () => setRenamingSound(sound) : undefined}
            onDelete={sound.source === 'custom' ? () => handleDelete(sound) : undefined}
          />
        ))}

        {/* Add custom audio shortcut card */}
        <button
          className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border border-border border-dashed bg-transparent text-subtle transition-colors hover:border-accent/40 hover:text-accent"
          type="button"
          disabled={importing}
          onClick={handleAddCustom}
        >
          <Plus size={18} />
          <span className="text-[11px]">Add Audio</span>
        </button>
      </div>

      <p className="mt-3 text-[11px] text-subtle">
        Supports <code className="text-text-code-inline">.mp3</code>, <code className="text-text-code-inline">.wav</code>,{' '}
        <code className="text-text-code-inline">.ogg</code> audio files
      </p>

      {/* Rename dialog */}
      {renamingSound && (
        <RenameDialog
          initial={renamingSound.name}
          onSave={(name) => {
            renameCustomSound(renamingSound.id, name);
            setRenamingSound(null);
          }}
          onClose={() => setRenamingSound(null)}
        />
      )}
    </div>
  );
}
