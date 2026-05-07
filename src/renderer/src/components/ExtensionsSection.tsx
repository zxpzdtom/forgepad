import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@renderer/i18n";
import { useAppStore } from "@renderer/store/app-store";
import type { ExtensionInfo } from "@shared/types";
import { FolderOpen, Puzzle, Trash2 } from "lucide-react";

/* ─── Reusable primitives (same style as SettingsPanel) ─── */

function SectionHeader({ title }: { title: string }) {
  return <h3 className="mb-4 font-[590] text-[15px] text-text">{title}</h3>;
}

function Divider() {
  return <div className="my-4 border-border border-t" />;
}

/* ─── Extension row card ─── */

function ExtensionRow({
  ext,
  onUninstall,
}: {
  ext: ExtensionInfo;
  onUninstall: (ext: ExtensionInfo) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="group flex items-center gap-3 rounded-lg border border-border bg-panel p-3 transition-colors hover:bg-panel-2">
      {/* Icon */}
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
        <Puzzle size={18} />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-[510] text-[13px] text-text">
            {ext.name}
          </span>
          <span className="shrink-0 rounded bg-border/50 px-1.5 py-0.5 text-[10px] text-subtle">
            v{ext.version}
          </span>
        </div>
        <div className="mt-0.5 truncate text-[11px] text-subtle">
          {ext.path}
        </div>
      </div>

      {/* Uninstall button */}
      <button
        type="button"
        className="shrink-0 rounded-md p-1.5 text-subtle opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
        title={t("settings.extensions.uninstall")}
        onClick={() => onUninstall(ext)}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

/* ─── Main section component ─── */

export function ExtensionsSection() {
  const { t } = useTranslation();
  const addExtensionPath = useAppStore((s) => s.addExtensionPath);
  const removeExtensionPath = useAppStore((s) => s.removeExtensionPath);

  const [extensions, setExtensions] = useState<ExtensionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await window.forgepad.extension.list();
      setExtensions(list);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleInstall = async () => {
    setLoading(true);
    setError(null);
    try {
      const ext = await window.forgepad.extension.install();
      if (ext) {
        addExtensionPath(ext.path);
        await refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleUninstall = async (ext: ExtensionInfo) => {
    try {
      await window.forgepad.extension.uninstall(ext.id);
      removeExtensionPath(ext.path);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div>
      <SectionHeader title={t("settings.extensions.title")} />
      <p className="mb-4 text-[12px] leading-relaxed text-subtle">
        {t("settings.extensions.description")}
      </p>

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
          {error}
        </div>
      )}

      {/* Install button */}
      <button
        type="button"
        disabled={loading}
        className="mb-4 inline-flex items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2 text-[13px] font-[510] text-text transition-colors hover:bg-panel-2 disabled:opacity-50"
        onClick={handleInstall}
      >
        <FolderOpen size={15} />
        {loading
          ? t("settings.extensions.installing")
          : t("settings.extensions.addExtension")}
      </button>

      <Divider />

      {/* Extension list */}
      {extensions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Puzzle size={36} className="mb-3 text-subtle/40" />
          <p className="text-[13px] text-subtle">
            {t("settings.extensions.empty")}
          </p>
          <p className="mt-1 text-[11px] text-subtle/60">
            {t("settings.extensions.emptyHint")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {extensions.map((ext) => (
            <ExtensionRow
              key={ext.id}
              ext={ext}
              onUninstall={handleUninstall}
            />
          ))}
        </div>
      )}
    </div>
  );
}
