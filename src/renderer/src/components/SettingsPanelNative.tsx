import { useAppStore } from '@renderer/store/app-store';
import { Settings, X } from 'lucide-react';

export function SettingsPanelNative() {
  const setSettingsOpen = (open: boolean) => useAppStore.setState({ settingsOpen: open });

  return (
    <div className="flex size-full flex-col bg-bg">
      <div className="flex h-12 shrink-0 items-center justify-between border-border border-b px-4">
        <div className="flex items-center gap-2 font-semibold text-[14px] text-text">
          <Settings size={16} />
          Settings
        </div>
        <button type="button" className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings">
          <X size={16} />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <div className="max-w-[420px] text-muted text-sm leading-relaxed">
          Native settings are being moved onto the Swift/Rust path. The legacy Electron settings UI remains available in the
          non-native build while this host is slimmed down.
        </div>
      </div>
    </div>
  );
}
