import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@renderer/i18n';
import type { SimulatorDevice, Tab } from '@shared/types';
import { Allotment } from 'allotment';

import { checkXcode, fetchDevices, shutdownDevice, startDeviceStream, stopDeviceStream } from '../lib/simulator-api';
import { SimulatorInputHandler } from '../lib/simulator-input';
import type { StreamStatus } from '../lib/simulator-stream';
import { SimulatorStreamSession } from '../lib/simulator-stream';
import { useAppStore } from '../store/app-store';
import { BrowserFeedbackModal } from './BrowserFeedbackModal';
import { SimulatorElementPanel } from './SimulatorElementPanel';
import { SimulatorRegionSelect } from './SimulatorRegionSelect';

type SimulatorTabProps = {
  tab: Extract<Tab, { type: 'simulator' }>;
};

export function SimulatorTab({ tab }: SimulatorTabProps) {
  const { t } = useTranslation();
  const addToast = useAppStore((s) => s.addToast);
  const openFeedbackModal = useAppStore((s) => s.openFeedbackModal);
  const updateSimulatorState = useAppStore((s) => s.updateSimulatorState);

  // ── Connection state ─────────────────────────────────────────────────
  const [devices, setDevices] = useState<SimulatorDevice[]>([]);
  const [selectedUdid, setSelectedUdid] = useState(tab.udid || '');
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle');
  const [fps, setFps] = useState(0);
  const [resolution, setResolution] = useState({ w: 0, h: 0 });
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [regionSelectMode, setRegionSelectMode] = useState(false);
  const [elementInspectMode, setElementInspectMode] = useState(false);
  const [activePort, setActivePort] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<SimulatorStreamSession | null>(null);
  const inputRef = useRef<SimulatorInputHandler | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const didAutoLoad = useRef(false);

  const isConnected = streamStatus === 'connected';
  const isStreaming = streamStatus === 'connected' || streamStatus === 'connecting';

  const selectedDevice = useMemo(() => devices.find((d) => d.id === selectedUdid), [devices, selectedUdid]);

  // ── Auto-load devices on mount ──────────────────────────────────────
  const loadDevices = useCallback(async () => {
    setIsLoadingDevices(true);
    setConnectError(null);

    try {
      const xcode = await checkXcode();
      if (!xcode.available) {
        setConnectError(xcode.message ?? t('simulator.xcodeRequired'));
        setIsLoadingDevices(false);
        return;
      }

      const list = await fetchDevices();
      setDevices(list);

      // Auto-select first booted device, or first iPhone
      if (!selectedUdid || !list.some((d) => d.id === selectedUdid)) {
        const firstBooted = list.find((d) => d.isBooted);
        const firstIphone = list.find((d) => d.name.startsWith('iPhone'));
        const pick = firstBooted ?? firstIphone ?? list[0];
        if (pick) setSelectedUdid(pick.id);
      }
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err));
      setDevices([]);
    } finally {
      setIsLoadingDevices(false);
    }
  }, [selectedUdid, t]);

  useEffect(() => {
    if (!didAutoLoad.current) {
      didAutoLoad.current = true;
      loadDevices();
    }
  }, [loadDevices]);

  // ── Start streaming (auto-boots if needed via backend) ──────────────
  const handleStartStream = useCallback(async () => {
    if (!selectedUdid || !canvasRef.current) return;

    // Stop any existing session
    sessionRef.current?.stop();
    inputRef.current?.dispose();
    inputRef.current = null;

    try {
      // startDeviceStream auto-boots the device via serve-sim-service
      const { port } = await startDeviceStream(selectedUdid);
      setActivePort(port);

      const canvas = canvasRef.current;
      const session = new SimulatorStreamSession({
        port,
        canvas,
        onSize: (w, h) => {
          setResolution({ w, h });
        },
        onFps: setFps,
        onStatus: (status) => {
          setStreamStatus(status);
          updateSimulatorState(tab.id, {
            isStreaming: status === 'connected',
            isConnected: status === 'connected',
          });
          // Attach input handler once stream is connected
          if (status === 'connected' && !inputRef.current && canvasRef.current) {
            inputRef.current = new SimulatorInputHandler(canvasRef.current, port);
          }
        },
      });

      sessionRef.current = session;
      session.start();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err));
      setStreamStatus('error');
    }
  }, [selectedUdid, tab.id, updateSimulatorState]);

  // ── Stop streaming (auto-shuts down device) ─────────────────────────
  const handleStopStream = useCallback(async () => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    inputRef.current?.dispose();
    inputRef.current = null;
    setStreamStatus('idle');
    setFps(0);
    setActivePort(0);
    updateSimulatorState(tab.id, { isStreaming: false, isConnected: false });

    if (selectedUdid) {
      // Stop serve-sim process
      await stopDeviceStream(selectedUdid).catch(() => {});
      // Auto-shutdown the device
      await shutdownDevice(selectedUdid).catch(() => {});
      // Refresh device list to reflect shutdown state
      loadDevices();
    }
  }, [tab.id, selectedUdid, updateSimulatorState, loadDevices]);

  // ── Home / Lock buttons ──────────────────────────────────────────────
  const handleHomeButton = useCallback(() => {
    inputRef.current?.sendButton('home');
  }, []);

  const handleLockButton = useCallback(() => {
    inputRef.current?.sendButton('lock');
  }, []);

  // ── Inspect modes ────────────────────────────────────────────────────
  const handleElementInspect = useCallback(() => {
    setElementInspectMode((v) => !v);
    setRegionSelectMode(false);
  }, []);

  const handleRegionSelect = useCallback(() => {
    setRegionSelectMode((v) => !v);
    setElementInspectMode(false);
  }, []);

  const handleRegionSelected = useCallback(
    (screenshotBase64: string, region: { x: number; y: number; w: number; h: number }) => {
      setRegionSelectMode(false);
      const deviceName = selectedDevice?.name ?? selectedUdid;
      const deviceRuntime = selectedDevice?.runtime ?? '';

      openFeedbackModal(tab.id, {
        selector: `simulator:region(${region.x},${region.y},${region.w},${region.h})`,
        tagName: 'SIMULATOR_REGION',
        outerHTML: `<simulator-region device="${deviceName}" runtime="${deviceRuntime}" x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}" />`,
        boundingRect: { x: region.x, y: region.y, width: region.w, height: region.h },
        screenshotBase64,
        pageUrl: `simulator://localhost:${activePort}/${selectedUdid}`,
        pageTitle: deviceName,
      });
    },
    [tab.id, selectedUdid, selectedDevice, activePort, openFeedbackModal],
  );

  const handleRegionCancel = useCallback(() => {
    setRegionSelectMode(false);
  }, []);

  // ── Screenshot (save as PNG) ─────────────────────────────────────────
  const handleScreenshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `simulator-${selectedDevice?.name ?? selectedUdid}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    addToast('success', t('simulator.screenshotSaved'));
  }, [selectedUdid, selectedDevice, addToast, t]);

  // ── Close device picker on outside click ─────────────────────────────
  useEffect(() => {
    if (!devicePickerOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setDevicePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [devicePickerOpen]);

  // ── Cleanup on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      sessionRef.current?.stop();
      inputRef.current?.dispose();
    };
  }, []);

  // ── Sync store when device selected ──────────────────────────────────
  useEffect(() => {
    if (selectedDevice) {
      updateSimulatorState(tab.id, {
        udid: selectedDevice.id,
        deviceName: selectedDevice.name,
        runtime: selectedDevice.runtime,
      });
    }
  }, [selectedDevice, tab.id, updateSimulatorState]);

  return (
    <div className="flex h-full w-full flex-col">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-border border-b bg-panel px-2">
        {/* Connect / Disconnect button */}
        <button
          type="button"
          onClick={isStreaming ? handleStopStream : handleStartStream}
          disabled={isLoadingDevices || (!isStreaming && !selectedUdid)}
          title={isStreaming ? t('simulator.disconnect') : t('simulator.connect')}
          className={[
            'flex h-7 items-center gap-1 rounded px-2 font-medium text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            isStreaming ? 'bg-danger text-white hover:bg-danger/90' : 'bg-accent text-white hover:bg-accent/90',
          ].join(' ')}
        >
          {isStreaming ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 3l9 3.5-9 3.5V3z" fill="currentColor" />
            </svg>
          )}
          {isStreaming ? t('simulator.disconnect') : t('simulator.connect')}
        </button>

        {/* Device picker dropdown */}
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => {
              if (devices.length === 0 && !isLoadingDevices) loadDevices();
              setDevicePickerOpen((v) => !v);
            }}
            disabled={isStreaming}
            title={t('simulator.selectDevice')}
            className={[
              'flex h-7 items-center gap-1 rounded px-2 font-medium text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              selectedDevice
                ? 'border border-accent/50 bg-accent/10 text-accent'
                : 'border border-border bg-panel-2 text-muted hover:border-border hover:text-text',
            ].join(' ')}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <rect x="3" y="1" width="7" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="5.5" y1="10" x2="7.5" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <span className="max-w-[120px] truncate">{selectedDevice ? selectedDevice.name : t('simulator.selectDevice')}</span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0 opacity-50">
              <path d="M3 4l2 2 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Dropdown menu */}
          {devicePickerOpen && (
            <div className="absolute top-full right-0 z-50 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-panel shadow-lg">
              {isLoadingDevices ? (
                <div className="flex items-center justify-center px-3 py-4 text-muted text-xs">
                  <svg className="mr-2 h-4 w-4 animate-spin text-accent" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                    <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  {t('simulator.loadingDevices')}
                </div>
              ) : devices.length === 0 ? (
                <div className="px-3 py-4 text-center text-muted text-xs">
                  {connectError ? (
                    <div>
                      <p className="mb-1 text-danger">{t('simulator.connectionFailed')}</p>
                      <p className="text-subtle">{connectError}</p>
                    </div>
                  ) : (
                    t('simulator.noDevices')
                  )}
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto py-1">
                  {devices.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        setSelectedUdid(d.id);
                        setDevicePickerOpen(false);
                      }}
                      className={[
                        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-panel-2',
                        d.id === selectedUdid ? 'bg-accent/10 text-accent' : 'text-text',
                      ].join(' ')}
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${d.isBooted ? 'bg-ok' : 'bg-subtle'}`} />
                      <span className="min-w-0 flex-1 truncate">{d.name}</span>
                      <span className="shrink-0 text-[10px] text-subtle">{d.runtime}</span>
                    </button>
                  ))}
                </div>
              )}
              {/* Refresh button */}
              <div className="border-border border-t px-2 py-1.5">
                <button
                  type="button"
                  onClick={loadDevices}
                  className="flex w-full items-center justify-center gap-1 rounded py-1 text-[10px] text-muted transition-colors hover:bg-panel-2 hover:text-text"
                >
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M12 7A5 5 0 1 1 7 2M7 2l2.5 2.5M7 2L4.5 4.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {t('simulator.refreshDevices')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Home button */}
        {isConnected && (
          <button
            type="button"
            onClick={handleHomeButton}
            title={t('simulator.homeButton')}
            className="flex h-7 items-center gap-1 rounded border border-border bg-panel-2 px-2 font-medium text-muted text-xs transition-colors hover:border-border hover:text-text"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
              <rect x="4.5" y="4.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1" />
            </svg>
            {t('simulator.homeButton')}
          </button>
        )}

        {/* Lock button */}
        {isConnected && (
          <button
            type="button"
            onClick={handleLockButton}
            title={t('simulator.lockButton')}
            className="flex h-7 items-center gap-1 rounded border border-border bg-panel-2 px-2 font-medium text-muted text-xs transition-colors hover:border-border hover:text-text"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <rect x="3" y="6" width="7" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
              <path d="M5 6V4.5a1.5 1.5 0 0 1 3 0V6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            {t('simulator.lockButton')}
          </button>
        )}

        {/* Inspect Element button (WebKit DOM inspector) */}
        <button
          type="button"
          onClick={handleElementInspect}
          disabled={!isConnected}
          title={t('simulator.inspectElement')}
          className={[
            'flex h-7 items-center gap-1.5 rounded border px-2.5 font-medium text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-30',
            elementInspectMode
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border bg-panel-2 text-muted hover:border-border hover:text-text',
          ].join(' ')}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 1h9v11H2z" stroke="currentColor" strokeWidth="1.2" />
            <path d="M4 3.5h5M4 5.5h4M4 7.5h3" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" />
          </svg>
          {t('simulator.inspectElement')}
        </button>

        {/* Region Select button (pixel screenshot selection) */}
        <button
          type="button"
          onClick={handleRegionSelect}
          disabled={!isConnected}
          title={t('simulator.regionSelect')}
          className={[
            'flex h-7 items-center gap-1.5 rounded border px-2.5 font-medium text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-30',
            regionSelectMode
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border bg-panel-2 text-muted hover:border-border hover:text-text',
          ].join(' ')}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="6.5" cy="6.5" r="1.5" fill="currentColor" />
            <path d="M6.5 1v2M6.5 10v2M1 6.5h2M10 6.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          {t('simulator.regionSelect')}
        </button>

        {/* Screenshot button */}
        <button
          type="button"
          onClick={handleScreenshot}
          disabled={!isConnected}
          title={t('simulator.screenshot')}
          className="rounded p-1.5 text-subtle transition-colors hover:bg-panel-3 hover:text-text disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="3" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="7" cy="7.5" r="2.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M5 3V2.5A.5.5 0 0 1 5.5 2h3a.5.5 0 0 1 .5.5V3" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>

      {/* ── Canvas area + Element Panel ─────────────────────────────────── */}
      <Allotment className="min-h-0 flex-1">
        <Allotment.Pane minSize={200}>
          <div ref={containerRef} className="relative flex h-full w-full items-center justify-center overflow-hidden bg-panel-2">
            {streamStatus === 'idle' && !connectError && (
              <EmptyState
                t={t}
                isLoading={isLoadingDevices}
                hasDevices={devices.length > 0}
                selectedDevice={selectedDevice}
                onStream={handleStartStream}
              />
            )}

            {(streamStatus === 'connecting' || streamStatus === 'disconnected') && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-panel-2/80">
                <div className="flex flex-col items-center gap-3">
                  <svg className="h-8 w-8 animate-spin text-accent" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                    <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <p className="text-muted text-xs">
                    {streamStatus === 'connecting' ? t('simulator.connecting') : t('simulator.reconnecting')}
                  </p>
                </div>
              </div>
            )}

            {streamStatus === 'error' && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-panel-2">
                <div className="flex max-w-sm flex-col items-center gap-4 px-6 text-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-panel-3">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" className="text-danger" />
                      <path d="M12 8v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-danger" />
                      <circle
                        cx="12"
                        cy="16"
                        r="0.5"
                        fill="currentColor"
                        stroke="currentColor"
                        strokeWidth="0.5"
                        className="text-danger"
                      />
                    </svg>
                  </div>
                  <h3 className="font-medium text-sm text-text">{t('simulator.connectionFailed')}</h3>
                  <p className="text-muted text-xs leading-relaxed">{connectError || t('simulator.connectionFailedDetail')}</p>
                  <button
                    type="button"
                    onClick={handleStartStream}
                    className="mt-1 flex h-8 items-center gap-1.5 rounded-md bg-accent px-4 font-medium text-white text-xs transition-colors hover:bg-accent/90 active:bg-accent/80"
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                      <path
                        d="M12 7A5 5 0 1 1 7 2M7 2l2.5 2.5M7 2L4.5 4.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {t('common.retry')}
                  </button>
                </div>
              </div>
            )}

            <canvas
              ref={canvasRef}
              className="max-h-full max-w-full object-contain"
              style={{
                display: isConnected ? 'block' : 'none',
                cursor: isConnected && !regionSelectMode ? 'default' : 'not-allowed',
                imageRendering: 'auto',
              }}
            />

            {/* Region select overlay */}
            {regionSelectMode && isConnected && (
              <SimulatorRegionSelect
                canvasRef={canvasRef}
                onRegionSelected={handleRegionSelected}
                onCancel={handleRegionCancel}
                t={t}
              />
            )}
          </div>
        </Allotment.Pane>

        {/* Element inspector panel (right sidebar) */}
        <Allotment.Pane preferredSize={320} minSize={elementInspectMode ? 240 : 0} visible={elementInspectMode}>
          {elementInspectMode && isConnected && selectedUdid && (
            <SimulatorElementPanel
              udid={selectedUdid}
              port={activePort}
              deviceName={selectedDevice?.name ?? selectedUdid}
              deviceRuntime={selectedDevice?.runtime ?? ''}
              tabId={tab.id}
              canvasRef={canvasRef}
            />
          )}
        </Allotment.Pane>
      </Allotment>

      {/* ── Status bar ───────────────────────────────────────────────────── */}
      <div className="flex h-6 shrink-0 items-center justify-between border-border border-t bg-panel px-3 text-[10px] text-subtle">
        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            <span
              className={[
                'h-1.5 w-1.5 rounded-full transition-colors duration-200',
                isConnected
                  ? 'bg-ok'
                  : streamStatus === 'connecting' || streamStatus === 'disconnected'
                    ? 'animate-pulse bg-warn'
                    : 'bg-subtle',
              ].join(' ')}
            />
            <span>
              {isConnected
                ? t('simulator.statusConnected')
                : streamStatus === 'connecting'
                  ? t('simulator.statusConnecting')
                  : streamStatus === 'disconnected'
                    ? t('simulator.statusReconnecting')
                    : t('simulator.statusIdle')}
            </span>
          </div>

          {/* Device info */}
          {selectedDevice && (
            <span className="text-muted">
              {selectedDevice.name} {selectedDevice.runtime && `(${selectedDevice.runtime})`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Port */}
          {activePort > 0 && <span className="text-subtle">:{activePort}</span>}

          {/* Resolution */}
          {resolution.w > 0 && (
            <span>
              {resolution.w} x {resolution.h}
            </span>
          )}

          {/* FPS */}
          {isConnected && <span className={fps > 30 ? 'text-ok' : fps > 15 ? 'text-warn' : 'text-danger'}>{fps} FPS</span>}
        </div>
      </div>

      {/* Feedback modal (shared with browser) */}
      <BrowserFeedbackModal />
    </div>
  );
}

// ── Empty State Component ────────────────────────────────────────────────

function EmptyState({
  t,
  isLoading,
  hasDevices,
  selectedDevice,
  onStream,
}: {
  t: (key: string) => string;
  isLoading: boolean;
  hasDevices: boolean;
  selectedDevice?: SimulatorDevice;
  onStream: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-4">
        <svg className="h-8 w-8 animate-spin text-accent" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.25" />
          <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <p className="text-muted text-xs">{t('simulator.loadingDevices')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Simulator icon */}
      <div className="flex size-16 items-center justify-center rounded-2xl bg-panel-3/50">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-muted">
          <rect x="7" y="2" width="18" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <line x1="12" y1="27" x2="20" y2="27" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="9" y="5" width="14" height="19" rx="0.5" stroke="currentColor" strokeWidth="1" opacity="0.4" />
        </svg>
      </div>

      <div className="text-center">
        <h3 className="mb-1 font-medium text-sm text-text">{t('simulator.emptyTitle')}</h3>
        <p className="text-muted text-xs leading-relaxed">{t('simulator.emptyDescription')}</p>
      </div>

      {hasDevices && selectedDevice ? (
        <button
          type="button"
          onClick={onStream}
          className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-4 font-medium text-white text-xs transition-colors hover:bg-accent/90"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 1.5l8 4.5-8 4.5V1.5z" fill="currentColor" />
          </svg>
          {t('simulator.startStream')}
        </button>
      ) : hasDevices ? (
        <p className="text-muted text-xs">{t('simulator.selectDevice')}</p>
      ) : (
        <p className="text-muted text-xs">{t('simulator.noDevices')}</p>
      )}
    </div>
  );
}
