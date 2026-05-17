import { useState } from 'react';
import { useAppStore } from '@renderer/store/app-store';
import { AlertTriangle, Check, CheckCircle2, Copy, Info, X } from 'lucide-react';
import { useTranslation } from '@renderer/i18n';

import clsx from 'clsx';

type ToastItemProps = {
  toast: {
    id: string;
    kind: 'info' | 'error' | 'success';
    message: string;
  };
  onDismiss: (id: string) => void;
};

export function ToastStack() {
  const { t } = useTranslation();
  const toasts = useAppStore((state) => state.toasts);
  const dismissToast = useAppStore((state) => state.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 bottom-4 z-20 grid w-[min(520px,calc(100vw-32px))] gap-2.5">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const tone = getToastTone(toast.kind);
  const Icon = tone.icon;

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(toast.message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className={clsx(
        'toast-item group grid grid-cols-[20px_minmax(0,1fr)_auto] gap-3 rounded-[10px] px-3.5 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.34),0_1px_0_rgba(255,255,255,0.04)_inset]',
        'bg-panel-2/95 text-sm backdrop-blur-xl',
        tone.borderClass,
      )}
    >
      <div className={clsx('mt-0.5 flex size-5 items-center justify-center rounded-md', tone.iconClass)}>
        <Icon size={14} strokeWidth={2.3} />
      </div>

      <div className="min-w-0 select-text">
        <div className={clsx('mb-1 text-[11px] font-semibold uppercase tracking-[0.08em]', tone.labelClass)}>
          {t(tone.labelKey)}
        </div>
        <pre
          className={clsx(
            'break-anywhere m-0 max-h-36 overflow-auto whitespace-pre-wrap text-[12px] leading-5 text-text',
            toast.kind === 'error' && 'font-mono',
          )}
        >
          {toast.message}
        </pre>
      </div>

      <div className="flex items-start gap-1">
        <button
          className="icon-button small"
          type="button"
          title={copied ? t('toast.copied') : t('toast.copy')}
          aria-label={copied ? t('toast.copied') : t('toast.copy')}
          onClick={copyMessage}
        >
          {copied ? (
            <span key="check" className="icon-swap">
              <Check size={14} />
            </span>
          ) : (
            <span key="copy" className="icon-swap">
              <Copy size={14} />
            </span>
          )}
        </button>
        <button
          className="icon-button small"
          type="button"
          title={t('toast.dismiss')}
          aria-label={t('toast.dismiss')}
          onClick={() => onDismiss(toast.id)}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

function getToastTone(kind: ToastItemProps['toast']['kind']) {
  if (kind === 'error') {
    return {
      icon: AlertTriangle,
      labelKey: 'toast.error' as const,
      borderClass: 'border border-toast-border-error',
      iconClass: 'bg-danger/10 text-danger',
      labelClass: 'text-danger',
    };
  }
  if (kind === 'success') {
    return {
      icon: CheckCircle2,
      labelKey: 'toast.success' as const,
      borderClass: 'border border-toast-border-success',
      iconClass: 'bg-success/10 text-success',
      labelClass: 'text-success',
    };
  }
  return {
    icon: Info,
    labelKey: 'toast.info' as const,
    borderClass: 'border border-border',
    iconClass: 'bg-accent/10 text-accent',
    labelClass: 'text-muted',
  };
}
