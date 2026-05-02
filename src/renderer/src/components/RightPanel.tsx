import { useTranslation } from '@renderer/i18n';
import { useAppStore } from '@renderer/store/app-store';
import type { RightPanelMode } from '@shared/types';
import { Files, GitCompare, SendHorizontal } from 'lucide-react';

import { ChangesPanel } from './ChangesPanel';
import { ContextPanel } from './ContextPanel';
import { FilesPanel } from './FilesPanel';

const modes: Array<{
  mode: RightPanelMode;
  labelKey: string;
  icon: typeof Files;
}> = [
  { mode: 'files', labelKey: 'rightPanel.files', icon: Files },
  { mode: 'changes', labelKey: 'rightPanel.changes', icon: GitCompare },
  { mode: 'context', labelKey: 'rightPanel.context', icon: SendHorizontal },
];

export function RightPanel() {
  const { t } = useTranslation();
  const mode = useAppStore((state) => state.rightPanelMode);
  const setMode = useAppStore((state) => state.setRightPanelMode);

  return (
    <aside className="flex h-full min-h-0 flex-col border-border border-l bg-bg">
      <div className="flex min-h-9 items-center border-border border-b bg-bg">
        <div className="flex min-w-0 flex-1" role="tablist">
          {modes.map(({ mode: nextMode, labelKey, icon: Icon }) => (
            <div
              className={`relative flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap px-3 text-[13px] transition-colors select-none${nextMode === mode ? 'text-text' : 'text-muted hover:text-text'}`}
              key={nextMode}
              role="tab"
              tabIndex={0}
              aria-selected={nextMode === mode}
              title={t(labelKey)}
              onClick={() => setMode(nextMode)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setMode(nextMode);
                }
              }}
            >
              <Icon size={14} />
              <span>{t(labelKey)}</span>
              {nextMode === mode && <span className="absolute right-3 bottom-0 left-3 h-[2px] rounded-full bg-accent" />}
            </div>
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {mode === 'files' ? <FilesPanel /> : null}
        {mode === 'changes' ? <ChangesPanel /> : null}
        {mode === 'context' ? <ContextPanel /> : null}
      </div>
    </aside>
  );
}
