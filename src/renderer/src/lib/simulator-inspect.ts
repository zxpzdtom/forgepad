import type { DOMNode, InspectTarget, NodeInfo } from '@shared/types';

// ── Preload API accessor ──────────────────────────────────────────────────

type InspectApi = {
  inspectStart: () => Promise<{ port: number }>;
  inspectTargets: (udid?: string) => Promise<InspectTarget[]>;
  inspectDocument: (targetId: string) => Promise<DOMNode>;
  inspectHighlight: (targetId: string, backendNodeId: number) => Promise<void>;
  inspectHide: (targetId: string) => Promise<void>;
  inspectNodeInfo: (targetId: string, backendNodeId: number) => Promise<NodeInfo>;
  inspectStop: () => Promise<void>;
};

function getApi(): InspectApi {
  const api = (window as unknown as { forgepad?: { simulator?: InspectApi } }).forgepad?.simulator;
  if (!api) throw new Error('Simulator Inspect API not available');
  return api;
}

// ── WebKit Inspector API ──────────────────────────────────────────────────

/** Start the CDP bridge (lazy singleton). */
export async function startInspect(): Promise<{ port: number }> {
  return getApi().inspectStart();
}

/** List inspectable WebKit targets, optionally filtered by simulator UDID. */
export async function getInspectTargets(udid?: string): Promise<InspectTarget[]> {
  return getApi().inspectTargets(udid);
}

/** Get the full DOM document tree for a target. */
export async function getDocument(targetId: string): Promise<DOMNode> {
  return getApi().inspectDocument(targetId);
}

/** Highlight a DOM node in the simulator. */
export async function highlightNode(targetId: string, backendNodeId: number): Promise<void> {
  return getApi().inspectHighlight(targetId, backendNodeId);
}

/** Clear the highlight overlay. */
export async function hideHighlight(targetId: string): Promise<void> {
  return getApi().inspectHide(targetId);
}

/** Get detailed info about a DOM node (selector, HTML, box model, styles). */
export async function getNodeInfo(targetId: string, backendNodeId: number): Promise<NodeInfo> {
  return getApi().inspectNodeInfo(targetId, backendNodeId);
}

/** Stop the CDP bridge and all sessions. */
export async function stopInspect(): Promise<void> {
  return getApi().inspectStop();
}
