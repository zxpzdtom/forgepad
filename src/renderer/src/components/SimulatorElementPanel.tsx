import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@renderer/i18n';
import type { DOMNode, InspectTarget, NodeInfo } from '@shared/types';

import {
  getDocument,
  getInspectTargets,
  getNodeInfo,
  hideHighlight,
  highlightNode,
  startInspect,
  stopInspect,
} from '../lib/simulator-inspect';
import { useAppStore } from '../store/app-store';

// ── Types ────────────────────────────────────────────────────────────────

type SimulatorElementPanelProps = {
  /** Simulator UDID to filter targets. */
  udid: string;
  /** Active streaming port for building page URL. */
  port: number;
  /** Device name for feedback context. */
  deviceName: string;
  /** Device runtime for feedback context. */
  deviceRuntime: string;
  /** Tab ID for feedback modal. */
  tabId: string;
  /** Canvas ref for screenshot capture. */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
};

type DevtoolsTarget = {
  id: string;
  title: string;
  url: string;
  appName: string;
  devtoolsFrontendUrl: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────

/** Parse DOM node attributes array [name, value, name, value, ...] into pairs. */
function parseAttributes(attrs?: string[]): Array<[string, string]> {
  if (!attrs) return [];
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < attrs.length; i += 2) {
    pairs.push([attrs[i], attrs[i + 1] ?? '']);
  }
  return pairs;
}

/** Build a display label for a DOM node: `<tag#id.class1.class2>` */
function nodeLabel(node: DOMNode): string {
  const tag = node.localName || node.nodeName.toLowerCase();
  if (node.nodeType === 3) return '#text';
  if (node.nodeType === 8) return '<!-- comment -->';
  if (node.nodeType === 10) return `<!DOCTYPE ${tag}>`;

  const attrs = parseAttributes(node.attributes);
  const id = attrs.find(([k]) => k === 'id')?.[1];
  const cls = attrs.find(([k]) => k === 'class')?.[1];

  let label = tag;
  if (id) label += `#${id}`;
  if (cls) {
    label += `.${cls.trim().split(/\s+/).join('.')}`;
  }
  return label;
}

/** Check if a node is "interesting" enough to show (skip #text, comments, doctype). */
function isElementNode(node: DOMNode): boolean {
  return node.nodeType === 1; // Element node
}

/** Filter DOM tree to only element nodes, preserving hierarchy.
 *  The root from DOM.getDocument is nodeType=9 (Document), so we pass through its children. */
function filterTree(node: DOMNode): DOMNode | null {
  // Document node (nodeType 9) or DocumentFragment (nodeType 11): pass through children
  if (node.nodeType === 9 || node.nodeType === 11) {
    const children = (node.children ?? []).map(filterTree).filter(Boolean) as DOMNode[];
    // Return the first element child (typically <html>) or a synthetic wrapper
    if (children.length === 1) return children[0];
    if (children.length > 1) return { ...node, nodeType: 1, localName: '#document', children };
    return null;
  }
  if (!isElementNode(node)) return null;
  const children = (node.children ?? []).map(filterTree).filter(Boolean) as DOMNode[];
  return { ...node, children };
}

// ── Box Model Colors ────────────────────────────────────────────────────

const BOX_COLORS = {
  margin: 'rgba(246, 178, 107, 0.66)',
  border: 'rgba(255, 229, 153, 0.66)',
  padding: 'rgba(147, 196, 125, 0.55)',
  content: 'rgba(111, 168, 220, 0.66)',
} as const;

// ── Spinner ──────────────────────────────────────────────────────────────

function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin text-accent ${className}`} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ── Component ────────────────────────────────────────────────────────────

export function SimulatorElementPanel({ udid, port, deviceName, deviceRuntime, tabId, canvasRef }: SimulatorElementPanelProps) {
  console.log('[SimulatorElementPanel] MOUNTED, udid:', udid, 'port:', port);
  const { t } = useTranslation();
  const openFeedbackModal = useAppStore((s) => s.openFeedbackModal);

  // ── State ──────────────────────────────────────────────────────────────
  const [targets, setTargets] = useState<InspectTarget[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [domTree, setDomTree] = useState<DOMNode | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [selectedNodeInfo, setSelectedNodeInfo] = useState<NodeInfo | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'elements' | 'styles' | 'devtools'>('elements');

  // ── DevTools state ─────────────────────────────────────────────────────
  const [devtoolsTargets, setDevtoolsTargets] = useState<DevtoolsTarget[]>([]);
  const [selectedDevtoolsTargetId, setSelectedDevtoolsTargetId] = useState<string | null>(null);
  const [devtoolsLoading, setDevtoolsLoading] = useState(false);
  const [devtoolsError, setDevtoolsError] = useState<string | null>(null);

  const treeContainerRef = useRef<HTMLDivElement>(null);

  const selectedTarget = useMemo(() => targets.find((t) => t.id === selectedTargetId) ?? null, [targets, selectedTargetId]);
  const selectedDevtoolsTarget = useMemo(
    () => devtoolsTargets.find((t) => t.id === selectedDevtoolsTargetId) ?? null,
    [devtoolsTargets, selectedDevtoolsTargetId],
  );

  // ── Initialize: start bridge + list targets ───────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      console.log('[SimulatorElementPanel] init called, udid:', udid);
      setLoading(true);
      setError(null);
      try {
        console.log('[SimulatorElementPanel] calling startInspect...');
        await startInspect();
        console.log('[SimulatorElementPanel] startInspect done, calling getInspectTargets...');
        const list = await getInspectTargets(udid);
        console.log('[SimulatorElementPanel] targets:', list.length, list);
        if (cancelled) return;
        setTargets(list);
        // Auto-select first target
        if (list.length > 0) {
          setSelectedTargetId((prev) => prev ?? list[0].id);
        }
      } catch (err) {
        console.error('[SimulatorElementPanel] init error:', err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [udid]);

  // ── Load DOM tree when target selected ─────────────────────────────────
  useEffect(() => {
    if (!selectedTargetId) return;
    let cancelled = false;

    async function loadTree() {
      console.log('[SimulatorElementPanel] loadTree called, targetId:', selectedTargetId);
      setLoading(true);
      setError(null);
      setDomTree(null);
      setSelectedNodeId(null);
      setSelectedNodeInfo(null);
      setExpandedNodes(new Set());

      try {
        const doc = await getDocument(selectedTargetId!);
        console.log('[SimulatorElementPanel] getDocument result:', {
          nodeType: doc?.nodeType,
          nodeName: doc?.nodeName,
          childCount: doc?.children?.length,
        });
        if (cancelled) return;
        const filtered = filterTree(doc);
        console.log(
          '[SimulatorElementPanel] filterTree result:',
          filtered ? { nodeName: filtered.nodeName, localName: filtered.localName, childCount: filtered.children?.length } : null,
        );
        setDomTree(filtered);

        // Auto-expand root + body
        if (filtered) {
          const toExpand = new Set<number>();
          toExpand.add(filtered.backendNodeId);
          // Expand <html>
          const html = filtered.children?.find((c) => c.localName === 'html');
          if (html) {
            toExpand.add(html.backendNodeId);
            // Expand <body>
            const body = html.children?.find((c) => c.localName === 'body');
            if (body) toExpand.add(body.backendNodeId);
          }
          setExpandedNodes(toExpand);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTree();
    return () => {
      cancelled = true;
    };
  }, [selectedTargetId]);

  // ── Load node info when selected ───────────────────────────────────────
  useEffect(() => {
    if (!selectedTargetId || selectedNodeId == null) {
      setSelectedNodeInfo(null);
      return;
    }
    let cancelled = false;

    async function loadInfo() {
      setLoadingInfo(true);
      try {
        const info = await getNodeInfo(selectedTargetId!, selectedNodeId!);
        if (!cancelled) setSelectedNodeInfo(info);
      } catch {
        // Silently fail — some nodes can't be inspected
        if (!cancelled) setSelectedNodeInfo(null);
      } finally {
        if (!cancelled) setLoadingInfo(false);
      }
    }

    loadInfo();
    return () => {
      cancelled = true;
    };
  }, [selectedTargetId, selectedNodeId]);

  // ── Load DevTools targets when DevTools tab activated ──────────────────
  useEffect(() => {
    if (activeSection !== 'devtools' || port === 0) return;
    let cancelled = false;

    async function loadDevtoolsTargets() {
      setDevtoolsLoading(true);
      setDevtoolsError(null);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/.sim/devtools`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { targets: DevtoolsTarget[] };
        if (cancelled) return;
        setDevtoolsTargets(data.targets ?? []);
        if (data.targets?.length > 0) {
          setSelectedDevtoolsTargetId((prev) => prev ?? data.targets[0].id);
        }
      } catch (err) {
        if (!cancelled) {
          setDevtoolsError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setDevtoolsLoading(false);
      }
    }

    loadDevtoolsTargets();
    return () => {
      cancelled = true;
    };
  }, [activeSection, port]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopInspect().catch(() => {});
    };
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleToggleExpand = useCallback((backendNodeId: number) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(backendNodeId)) {
        next.delete(backendNodeId);
      } else {
        next.add(backendNodeId);
      }
      return next;
    });
  }, []);

  const handleNodeHover = useCallback(
    (backendNodeId: number) => {
      if (selectedTargetId) {
        highlightNode(selectedTargetId, backendNodeId).catch(() => {});
      }
    },
    [selectedTargetId],
  );

  const handleNodeLeave = useCallback(() => {
    if (selectedTargetId) {
      hideHighlight(selectedTargetId).catch(() => {});
    }
  }, [selectedTargetId]);

  const handleNodeSelect = useCallback((backendNodeId: number) => {
    setSelectedNodeId(backendNodeId);
  }, []);

  const handleRefreshTargets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getInspectTargets(udid);
      setTargets(list);
      if (list.length > 0 && !list.some((t) => t.id === selectedTargetId)) {
        setSelectedTargetId(list[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [udid, selectedTargetId]);

  const handleRefreshTree = useCallback(async () => {
    if (!selectedTargetId) return;
    setLoading(true);
    try {
      const doc = await getDocument(selectedTargetId);
      const filtered = filterTree(doc);
      setDomTree(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedTargetId]);

  const handleRefreshDevtoolsTargets = useCallback(async () => {
    if (port === 0) return;
    setDevtoolsLoading(true);
    setDevtoolsError(null);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/.sim/devtools`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { targets: DevtoolsTarget[] };
      setDevtoolsTargets(data.targets ?? []);
      if (data.targets?.length > 0 && !data.targets.some((t) => t.id === selectedDevtoolsTargetId)) {
        setSelectedDevtoolsTargetId(data.targets[0].id);
      }
    } catch (err) {
      setDevtoolsError(err instanceof Error ? err.message : String(err));
    } finally {
      setDevtoolsLoading(false);
    }
  }, [port, selectedDevtoolsTargetId]);

  const handleSendFeedback = useCallback(() => {
    if (!selectedNodeInfo || !selectedTargetId) return;

    // Capture screenshot from canvas
    let screenshotBase64 = '';
    if (canvasRef.current) {
      screenshotBase64 = canvasRef.current.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
    }

    openFeedbackModal(tabId, {
      selector: selectedNodeInfo.selector,
      tagName: selectedNodeInfo.tagName,
      outerHTML: selectedNodeInfo.outerHTML,
      boundingRect: selectedNodeInfo.boundingRect,
      screenshotBase64,
      pageUrl: selectedTarget?.url ?? `simulator://localhost:${port}/${udid}`,
      pageTitle: selectedTarget?.title ?? deviceName,
    });
  }, [selectedNodeInfo, selectedTargetId, selectedTarget, tabId, canvasRef, port, udid, deviceName, openFeedbackModal]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full w-full flex-col bg-panel">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-border border-b px-2">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 text-accent">
          <path d="M2 1h8v10H2z" stroke="currentColor" strokeWidth="1.2" />
          <path d="M4 3.5h4M4 5.5h3M4 7.5h2" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" />
        </svg>
        <span className="flex-1 truncate font-medium text-[11px] text-text">{t('simulator.elements')}</span>

        {/* Refresh button (only for Elements/Styles) */}
        {activeSection !== 'devtools' && (
          <button
            type="button"
            onClick={handleRefreshTree}
            disabled={!selectedTargetId || loading}
            title={t('simulator.refreshTree')}
            className="rounded p-0.5 text-subtle transition-colors hover:bg-panel-2 hover:text-text disabled:opacity-30"
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
          </button>
        )}
      </div>

      {/* ── Global tab bar: Elements | Styles | DevTools ────────────────── */}
      {(targets.length > 0 || activeSection === 'devtools') && (
        <div className="flex shrink-0 border-border border-b">
          <button
            type="button"
            onClick={() => setActiveSection('elements')}
            className={[
              'px-3 py-1 font-medium text-[11px] transition-colors',
              activeSection === 'elements' ? 'border-accent border-b-2 text-accent' : 'text-muted hover:text-text',
            ].join(' ')}
          >
            {t('simulator.elements')}
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('styles')}
            className={[
              'px-3 py-1 font-medium text-[11px] transition-colors',
              activeSection === 'styles' ? 'border-accent border-b-2 text-accent' : 'text-muted hover:text-text',
            ].join(' ')}
          >
            {t('simulator.styles')}
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('devtools')}
            className={[
              'px-3 py-1 font-medium text-[11px] transition-colors',
              activeSection === 'devtools' ? 'border-accent border-b-2 text-accent' : 'text-muted hover:text-text',
            ].join(' ')}
          >
            {t('simulator.devtools')}
          </button>
        </div>
      )}

      {/* ── Target picker (Elements/Styles only) ────────────────────────── */}
      {activeSection !== 'devtools' && (
        <div className="flex shrink-0 items-center gap-1.5 border-border border-b px-2 py-1.5">
          <select
            value={selectedTargetId ?? ''}
            onChange={(e) => setSelectedTargetId(e.target.value || null)}
            disabled={loading || targets.length === 0}
            className="min-w-0 flex-1 rounded border border-border bg-panel-2 px-1.5 py-1 text-[11px] text-text outline-none transition-colors focus:border-accent disabled:opacity-50"
          >
            {targets.length === 0 && <option value="">{t('simulator.noWebTargets')}</option>}
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.title} — {target.appName}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleRefreshTargets}
            disabled={loading}
            title={t('simulator.refreshTargets')}
            className="shrink-0 rounded p-1 text-subtle transition-colors hover:bg-panel-2 hover:text-text disabled:opacity-30"
          >
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <path
                d="M12 7A5 5 0 1 1 7 2M7 2l2.5 2.5M7 2L4.5 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}

      {/* ── Error / Loading (Elements/Styles) ───────────────────────────── */}
      {activeSection !== 'devtools' && error && (
        <div className="shrink-0 border-border border-b bg-danger/5 px-2 py-1.5 text-[11px] text-danger">{error}</div>
      )}

      {activeSection !== 'devtools' && loading && !domTree && (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Spinner />
            <span className="text-[11px] text-muted">{t('simulator.loadingTree')}</span>
          </div>
        </div>
      )}

      {/* ── No targets state ────────────────────────────────────────────── */}
      {activeSection !== 'devtools' && !loading && targets.length === 0 && !error && (
        <div className="flex flex-1 items-center justify-center px-4 text-center">
          <div className="flex flex-col items-center gap-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-muted">
              <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M4 9h16" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="7" cy="6.5" r="0.75" fill="currentColor" />
              <circle cx="9.5" cy="6.5" r="0.75" fill="currentColor" />
              <circle cx="12" cy="6.5" r="0.75" fill="currentColor" />
            </svg>
            <p className="text-[11px] text-muted leading-relaxed">{t('simulator.noWebTargets')}</p>
            <button
              type="button"
              onClick={handleRefreshTargets}
              className="mt-1 rounded border border-border px-2 py-0.5 text-[10px] text-muted transition-colors hover:bg-panel-2 hover:text-text"
            >
              {t('simulator.refreshTargets')}
            </button>
          </div>
        </div>
      )}

      {/* ── DOM Tree + Info Split (Elements/Styles) ──────────────────────── */}
      {activeSection !== 'devtools' && domTree && (
        <div className="flex min-h-0 flex-1 flex-col">
          {activeSection === 'elements' ? (
            <>
              {/* DOM Tree */}
              <div ref={treeContainerRef} className="min-h-0 flex-1 overflow-auto font-mono text-[11px]">
                <DOMTreeNode
                  node={domTree}
                  depth={0}
                  expandedNodes={expandedNodes}
                  selectedNodeId={selectedNodeId}
                  onToggle={handleToggleExpand}
                  onHover={handleNodeHover}
                  onLeave={handleNodeLeave}
                  onSelect={handleNodeSelect}
                />
              </div>

              {/* Selected element info */}
              {selectedNodeId != null && (
                <div className="shrink-0 border-border border-t">
                  <ElementInfoSection info={selectedNodeInfo} loading={loadingInfo} onSendFeedback={handleSendFeedback} t={t} />
                </div>
              )}
            </>
          ) : (
            /* Styles panel */
            <div className="min-h-0 flex-1 overflow-auto">
              {selectedNodeInfo?.computedStyle && Object.keys(selectedNodeInfo.computedStyle).length > 0 ? (
                <StylesSection info={selectedNodeInfo} />
              ) : (
                <div className="flex items-center justify-center p-4 text-[11px] text-muted">
                  {selectedNodeId != null
                    ? loadingInfo
                      ? t('simulator.loadingStyles')
                      : t('simulator.noStyles')
                    : t('simulator.selectElement')}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── DevTools tab (full-panel, no domTree dependency) ────────────── */}
      {activeSection === 'devtools' && (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* DevTools target picker */}
          <div className="flex shrink-0 items-center gap-1.5 border-border border-b px-2 py-1.5">
            <select
              value={selectedDevtoolsTargetId ?? ''}
              onChange={(e) => setSelectedDevtoolsTargetId(e.target.value || null)}
              disabled={devtoolsLoading || devtoolsTargets.length === 0}
              className="min-w-0 flex-1 rounded border border-border bg-panel-2 px-1.5 py-1 text-[11px] text-text outline-none transition-colors focus:border-accent disabled:opacity-50"
            >
              {devtoolsTargets.length === 0 && <option value="">{t('simulator.noDevtoolsTargets')}</option>}
              {devtoolsTargets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.title || target.url} — {target.appName}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleRefreshDevtoolsTargets}
              disabled={devtoolsLoading}
              title={t('simulator.refreshDevtoolsTargets')}
              className="shrink-0 rounded p-1 text-subtle transition-colors hover:bg-panel-2 hover:text-text disabled:opacity-30"
            >
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                <path
                  d="M12 7A5 5 0 1 1 7 2M7 2l2.5 2.5M7 2L4.5 4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          {/* DevTools error */}
          {devtoolsError && (
            <div className="shrink-0 border-border border-b bg-danger/5 px-2 py-1.5 text-[11px] text-danger">{devtoolsError}</div>
          )}

          {/* DevTools loading */}
          {devtoolsLoading && (
            <div className="flex flex-1 items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <Spinner />
                <span className="text-[11px] text-muted">{t('simulator.loadingDevtools')}</span>
              </div>
            </div>
          )}

          {/* No targets */}
          {!devtoolsLoading && devtoolsTargets.length === 0 && !devtoolsError && (
            <div className="flex flex-1 items-center justify-center px-4 text-center">
              <div className="flex flex-col items-center gap-2">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-muted">
                  <rect x="3" y="3" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M7 9l3 3-3 3M13 15h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="text-[11px] text-muted leading-relaxed">{t('simulator.noDevtoolsTargets')}</p>
                <button
                  type="button"
                  onClick={handleRefreshDevtoolsTargets}
                  className="mt-1 rounded border border-border px-2 py-0.5 text-[10px] text-muted transition-colors hover:bg-panel-2 hover:text-text"
                >
                  {t('simulator.refreshDevtoolsTargets')}
                </button>
              </div>
            </div>
          )}

          {/* DevTools iframe */}
          {!devtoolsLoading && selectedDevtoolsTarget && (
            <iframe
              key={selectedDevtoolsTarget.devtoolsFrontendUrl}
              src={selectedDevtoolsTarget.devtoolsFrontendUrl}
              className="min-h-0 flex-1 border-0 bg-white"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
              title="Chrome DevTools"
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── DOM Tree Node (Recursive) ────────────────────────────────────────────

function DOMTreeNode({
  node,
  depth,
  expandedNodes,
  selectedNodeId,
  onToggle,
  onHover,
  onLeave,
  onSelect,
}: {
  node: DOMNode;
  depth: number;
  expandedNodes: Set<number>;
  selectedNodeId: number | null;
  onToggle: (id: number) => void;
  onHover: (id: number) => void;
  onLeave: () => void;
  onSelect: (id: number) => void;
}) {
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isExpanded = expandedNodes.has(node.backendNodeId);
  const isSelected = selectedNodeId === node.backendNodeId;
  const label = nodeLabel(node);
  const tag = node.localName || node.nodeName.toLowerCase();
  const attrs = parseAttributes(node.attributes);

  // Skip non-element nodes
  if (node.nodeType !== 1) return null;

  return (
    <div>
      <div
        role="treeitem"
        tabIndex={0}
        className={[
          'group flex cursor-pointer items-center gap-0.5 py-[1px] pr-2 transition-colors',
          isSelected ? 'bg-accent/15 text-accent' : 'hover:bg-panel-2',
        ].join(' ')}
        style={{ paddingLeft: depth * 14 + 4 }}
        onClick={() => {
          onSelect(node.backendNodeId);
          if (hasChildren) onToggle(node.backendNodeId);
        }}
        onMouseEnter={() => onHover(node.backendNodeId)}
        onMouseLeave={onLeave}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(node.backendNodeId);
            if (hasChildren) onToggle(node.backendNodeId);
          }
        }}
      >
        {/* Chevron */}
        {hasChildren ? (
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            className={['shrink-0 text-subtle transition-transform duration-100', isExpanded ? '' : '-rotate-90'].join(' ')}
          >
            <path d="M3 4l2 2 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <span className="w-[10px] shrink-0" />
        )}

        {/* Node label */}
        <span className="min-w-0 truncate">
          <span className="text-purple-400">{'<'}</span>
          <span className={isSelected ? 'text-accent' : 'text-blue-400'}>{tag}</span>
          {attrs
            .filter(([k]) => k === 'id' || k === 'class')
            .slice(0, 2)
            .map(([k, v]) => (
              <span key={k}>
                <span className="text-orange-300"> {k}</span>
                <span className="text-subtle">=</span>
                <span className="text-green-400">"{v.length > 30 ? `${v.slice(0, 30)}…` : v}"</span>
              </span>
            ))}
          {attrs.length > 2 && <span className="text-subtle"> …</span>}
          <span className="text-purple-400">{'>'}</span>
        </span>
      </div>

      {/* Children */}
      {isExpanded &&
        hasChildren &&
        node.children?.map((child) => (
          <DOMTreeNode
            key={child.backendNodeId}
            node={child}
            depth={depth + 1}
            expandedNodes={expandedNodes}
            selectedNodeId={selectedNodeId}
            onToggle={onToggle}
            onHover={onHover}
            onLeave={onLeave}
            onSelect={onSelect}
          />
        ))}

      {/* Closing tag (for expanded nodes with children) */}
      {isExpanded && hasChildren && (
        <div className="py-[1px] text-subtle hover:bg-panel-2" style={{ paddingLeft: depth * 14 + 4 + 10 }}>
          <span className="text-purple-400">{'</'}</span>
          <span className="text-blue-400">{tag}</span>
          <span className="text-purple-400">{'>'}</span>
        </div>
      )}
    </div>
  );
}

// ── Element Info Section ─────────────────────────────────────────────────

function ElementInfoSection({
  info,
  loading,
  onSendFeedback,
  t,
}: {
  info: NodeInfo | null;
  loading: boolean;
  onSendFeedback: () => void;
  t: (key: string) => string;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center p-3">
        <Spinner className="h-4 w-4" />
      </div>
    );
  }

  if (!info) return null;

  return (
    <div className="max-h-48 overflow-auto">
      {/* Tag + Selector */}
      <div className="space-y-1 px-2 py-1.5 text-[11px]">
        <div className="flex items-baseline gap-1.5">
          <span className="shrink-0 font-medium text-muted">{t('browserFeedback.tag')}</span>
          <code className="min-w-0 truncate rounded bg-panel-2 px-1 py-0.5 font-mono text-[10px] text-accent">
            {info.tagName}
          </code>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="shrink-0 font-medium text-muted">{t('browserFeedback.selector')}</span>
          <code className="min-w-0 truncate rounded bg-panel-2 px-1 py-0.5 font-mono text-[10px] text-text">{info.selector}</code>
        </div>
      </div>

      {/* Box model mini visualization */}
      {info.boundingRect.width > 0 && (
        <div className="border-border border-t px-2 py-1.5">
          <BoxModelMini rect={info.boundingRect} />
        </div>
      )}

      {/* Send Feedback button */}
      <div className="border-border border-t px-2 py-1.5">
        <button
          type="button"
          onClick={onSendFeedback}
          className="flex w-full items-center justify-center gap-1.5 rounded bg-accent py-1 font-medium text-[11px] text-white transition-colors hover:bg-accent/90"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2 10V3.5L6 1l4 2.5V10H2z" stroke="currentColor" strokeWidth="1" />
            <path d="M2 3.5L6 6l4-2.5" stroke="currentColor" strokeWidth="1" />
          </svg>
          {t('simulator.sendFeedback')}
        </button>
      </div>
    </div>
  );
}

// ── Box Model Mini Visualization ─────────────────────────────────────────

function BoxModelMini({ rect }: { rect: { x: number; y: number; width: number; height: number } }) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <div
        className="flex size-8 items-center justify-center rounded-sm font-medium text-[9px] text-white"
        style={{ backgroundColor: BOX_COLORS.content }}
      >
        {rect.width}x{rect.height}
      </div>
      <div className="space-y-0.5 text-subtle">
        <div>
          x: {rect.x}, y: {rect.y}
        </div>
        <div>
          {rect.width} x {rect.height}
        </div>
      </div>
    </div>
  );
}

// ── Styles Section ───────────────────────────────────────────────────────

function StylesSection({ info }: { info: NodeInfo }) {
  const styles = info.computedStyle ?? {};
  const entries = Object.entries(styles).sort(([a], [b]) => a.localeCompare(b));

  // Group styles by category
  const groups = useMemo(() => {
    const layout: Array<[string, string]> = [];
    const typography: Array<[string, string]> = [];
    const visual: Array<[string, string]> = [];
    const spacing: Array<[string, string]> = [];

    for (const [key, value] of entries) {
      if (
        ['display', 'position', 'flex-direction', 'align-items', 'justify-content', 'gap', 'overflow', 'z-index'].includes(key)
      ) {
        layout.push([key, value]);
      } else if (['font-family', 'font-size', 'font-weight', 'color'].includes(key)) {
        typography.push([key, value]);
      } else if (['background-color', 'border', 'opacity'].includes(key)) {
        visual.push([key, value]);
      } else if (['width', 'height', 'margin', 'padding'].includes(key)) {
        spacing.push([key, value]);
      }
    }
    return { layout, typography, visual, spacing };
  }, [entries]);

  return (
    <div className="space-y-0 text-[11px]">
      <StyleGroup title="Layout" entries={groups.layout} />
      <StyleGroup title="Spacing" entries={groups.spacing} />
      <StyleGroup title="Typography" entries={groups.typography} />
      <StyleGroup title="Visual" entries={groups.visual} />
    </div>
  );
}

function StyleGroup({ title, entries }: { title: string; entries: Array<[string, string]> }) {
  if (entries.length === 0) return null;

  return (
    <div className="border-border border-b last:border-b-0">
      <div className="bg-panel-2/50 px-2 py-1 font-medium text-[10px] text-muted uppercase tracking-wider">{title}</div>
      <div className="px-2 py-1">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-baseline gap-1.5 py-[1px] font-mono">
            <span className="shrink-0 text-purple-400">{key}</span>
            <span className="text-subtle">:</span>
            <span className="min-w-0 truncate text-text">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
